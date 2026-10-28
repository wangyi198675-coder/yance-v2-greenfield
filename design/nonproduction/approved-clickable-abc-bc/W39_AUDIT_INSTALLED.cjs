const fs=require('fs'),p=require('path'),crypto=require('crypto');const root=__dirname,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const lock=JSON.parse(fs.readFileSync(p.join(root,'package-lock.json'),'utf8')),pkg=JSON.parse(fs.readFileSync(p.join(root,'package.json'),'utf8')),rows=JSON.parse(fs.readFileSync(p.join(root,'W42_APPROVED_ACTIONS.json'),'utf8'));
const approved=rows.filter(x=>x.preimport_gate==='PREIMPORT_ALLOW'&&x.approved_action==='INSTALL');if(approved.length!==14)throw Error('W42 direct package allow count mismatch');
const declared={...pkg.dependencies,...pkg.devDependencies};if(Object.keys(declared).length!==14)throw Error('Direct count mismatch');
for(const a of approved){if(declared[a.path]!== (a.path==='vite'?'7.3.7':a.version))throw Error('INSTALL whitelist mismatch '+a.path)}
const packages=[],notices=[],absent=[];
for(const [location,item] of Object.entries(lock.packages)){
 if(!location.startsWith('node_modules/')||!item.version)continue;
 const dir=p.join(root,location),name=location.slice(location.lastIndexOf('node_modules/')+13);
 const infofile=p.join(dir,'package.json');let inst=null;
 if(fs.existsSync(infofile)){inst=JSON.parse(fs.readFileSync(infofile,'utf8'));if(inst.version!==item.version)throw Error('installed drift '+name)}
 else absent.push({name,version:item.version,reason:'not materialized; optional platform or subdependency'});
 const licFiles=fs.existsSync(dir)?fs.readdirSync(dir).filter(n=>/^(LICENSE|LICENCE|COPYING|NOTICE|COPYRIGHT)(\.|$)/i.test(n)&&fs.statSync(p.join(dir,n)).isFile()):[];
 const normName=inst?.name||name,spdx=inst?.license||'UNKNOWN_LICENSE_IN_INSTALLED_MANIFEST';
 const text=licFiles.map(n=>({file:n,content:fs.readFileSync(p.join(dir,n),'utf8')}));if(inst&&text.length===0){const parent=normName.startsWith('@esbuild/')?'esbuild':normName.startsWith('@rollup/')?'rollup':null;if(parent){const origin=p.join(root,'node_modules',parent,'LICENSE.md');if(fs.existsSync(origin))text.push({file:'INHERITED_UPSTREAM_PARENT_LICENSE:'+parent+'/LICENSE.md',content:fs.readFileSync(origin,'utf8')})}}if(inst)notices.push({name:normName,version:item.version,license:spdx,files:text});
 const sri=item.integrity||null;
 const component={type:'library',name:normName,version:item.version,'bom-ref':'pkg:npm/'+normName.replace(/^@/,'%40')+'@'+item.version,
 purl:'pkg:npm/'+normName.replace(/^@/,'%40')+'@'+item.version,
 scope:pkg.dependencies[normName]?'required':pkg.devDependencies[normName]?'excluded':'optional',
 licenses:[{license:{id:typeof spdx==='string'?spdx:'NOASSERTION'}}],
 properties:[{name:'YANCE:lock.location',value:location},{name:'YANCE:installedPackageJsonSHA256',value:inst?sha(fs.readFileSync(infofile)):'NOT_INSTALLED_ON_WIN'},
 {name:'YANCE:integrityProvenance',value:sri?'PACKAGE_LOCK_METADATA_VERIFY_TARBALL_SEPARATELY':'MISSING_LOCK_INTEGRITY'}]};
 if(sri&&sri.startsWith('sha512-'))component.hashes=[{alg:'SHA-512',content:Buffer.from(sri.slice(7),'base64').toString('hex')}];
 packages.push({name:normName,version:item.version,installed:!!inst,lock_integrity:sri,license:spdx,licenseFiles:licFiles,location,component});
}
const bill={bomFormat:'CycloneDX',specVersion:'1.5',serialNumber:'urn:uuid:6d6b0ceb-738c-4f5d-86a9-d6e7d52b88dd',version:1,
 metadata:{timestamp:new Date().toISOString(),component:{type:'application',name:pkg.name,version:pkg.version},properties:[{name:'YANCE:stage',value:'P3_1_OFFLINE_NONPRODUCTION_ONLY'},{name:'YANCE:lockSHA256',value:sha(fs.readFileSync(p.join(root,'package-lock.json')))}]},components:packages.filter(x=>x.installed).map(x=>x.component),
 dependencies:packages.filter(x=>x.installed).map(x=>({ref:x.component['bom-ref'],dependsOn:[]}))};
const look=new Map(packages.filter(x=>x.installed).map(x=>[x.location,x.component['bom-ref']]));
for(const [i,entry] of Object.entries(lock.packages)){
 if(!i.startsWith('node_modules/'))continue;
 const dep=bill.dependencies.find(x=>x.ref===look.get(i));if(!dep)continue;
 const names=[...Object.keys(entry.dependencies||{}),...Object.keys(entry.optionalDependencies||{})];
 for(const n of names){let s=i,target=null;while(s){const maybe=s+'/node_modules/'+n;if(look.has(maybe)){target=maybe;break}s=s.includes('/node_modules/')?s.substring(0,s.lastIndexOf('/node_modules/')):''}if(!target&&look.has('node_modules/'+n))target='node_modules/'+n;if(target)dep.dependsOn.push(look.get(target));}
 dep.dependsOn=[...new Set(dep.dependsOn)];
}
fs.mkdirSync(p.join(root,'evidence'),{recursive:true});fs.writeFileSync(p.join(root,'evidence','CYCLONEDX_1_5_SBOM.json'),JSON.stringify(bill,null,2));
let notice=['YANCE V2 / P3-1 OFFLINE PROTOTYPE — THIRD PARTY LICENSE & COPYRIGHT RECORD','Not an independent legal signoff. Source shadcn-vue is MIT, frozen commit 3f048dfb495703f39e191b25a69307fba72822eb.',''];
notice.push('=== SHADCN-VUE MIT ===',fs.readFileSync(p.join(root,'licenses','SHADCN_VUE_MIT_LICENSE.txt'),'utf8'));
for(const n of notices){notice.push('\n=== '+n.name+'@'+n.version+' | declared '+n.license+' ===');if(!n.files.length)notice.push('[NO PHYSICAL LICENSE/NOTICE TEXT IN INSTALLED PACKAGE — NEED W42 REVIEW]');for(const f of n.files)notice.push('---- '+f.file+' ----\n'+f.content)}
fs.writeFileSync(p.join(root,'THIRD_PARTY_NOTICES.txt'),notice.join('\n'),'utf8');
const manifest={created:'2026-10-24',approvedDirectCount:14,installedPackageCount:packages.filter(x=>x.installed).length,lockPackageEntries:packages.length,absent,missingLicenseTexts:notices.filter(x=>!x.files.length).map(x=>x.name+'@'+x.version),lockSHA256:sha(fs.readFileSync(p.join(root,'package-lock.json'))),bomSHA256:sha(fs.readFileSync(p.join(root,'evidence','CYCLONEDX_1_5_SBOM.json'))),noticeSHA256:sha(fs.readFileSync(p.join(root,'THIRD_PARTY_NOTICES.txt'))),licenses:packages.map(({component,...rest})=>rest)};
fs.writeFileSync(p.join(root,'evidence','INSTALLED_PACKAGE_LICENSE_INTEGRITY_REPORT.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({approvedDirect:14,installed:manifest.installedPackageCount,lockEntries:manifest.lockPackageEntries,missingLicenseTexts:manifest.missingLicenseTexts,absent:manifest.absent.length,lockSHA:manifest.lockSHA256,SBOMSHA:manifest.bomSHA256,noticeSHA:manifest.noticeSHA256}));

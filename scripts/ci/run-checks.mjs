#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..'),mode=process.argv[2]||'all',reports=path.join(root,'ci-artifacts');fs.mkdirSync(reports,{recursive:true});
const report={mode,sha:spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim(),base:process.env.CI_BASE_SHA||null,checks:[],notApplicable:[],errors:[]};
const cmd=(bin,args,cwd=root,timeout=180000)=>spawnSync(bin,args,{cwd,encoding:'utf8',timeout,windowsHide:true});
function run(bin,args,cwd=root,timeout){const o=cmd(bin,args,cwd,timeout);if(o.status!==0)throw Error(bin+' '+args.join(' ')+' failed: '+String(o.stderr||o.stdout).slice(-800));return o.stdout}
function check(name,fn){try{report.checks.push({name,status:'PASS',data:fn()||null})}catch(e){report.checks.push({name,status:'FAIL',detail:String(e.message).slice(0,500)});report.errors.push(name+': '+e.message)}}
function must(v,m){if(!v)throw Error(m)}
function absent(name,reason){report.notApplicable.push({name,status:'NOT_APPLICABLE',reason})}
function filesUnder(d){const p=path.join(root,d);if(!fs.existsSync(p))return [];let out=[];for(const e of fs.readdirSync(p,{withFileTypes:true})){if(['node_modules','dist','.git','test-output','.venv'].includes(e.name))continue;const q=path.join(d,e.name).replaceAll('\\','/');out.push(...(e.isDirectory()?filesUnder(q):[q]));}return out}
const base=process.env.CI_BASE_SHA||'origin/main',v=cmd('git',['diff','--name-only',base+'...HEAD']);const changes=v.status===0?v.stdout.split(/\r?\n/).filter(Boolean):[];const changed=p=>changes.some(x=>x.startsWith(p));
const nativePaths=[
['W23-FileAttachment','services/api/src/domains/file-attachment/'],
['W24-IdentityConsent','services/api/src/domains/identity-consent/'],
['W25-MessageDelivery','services/api/src/domains/message-delivery/'],
['W44-GrantBudget','services/api/src/domains/grant-custody-budget/'],
['W45-PeopleReply','services/api/src/domains/people-translation-reply/'],
['W26-mautrix-meta','connectors/mautrix-meta/'],['W27-Pancake','connectors/pancake/'],
['W28-Baileys','connectors/baileys/'],['W29-TDLib','connectors/tdlib-json/'],
['W46-Frontend','apps/web/'],['W43-Agno','services/agentos/'],['M0-Contract','integration/synthetic-first-flow/']];
if(['all','contract'].includes(mode)){
check('contract-252-and-UIE100',()=>{run('node',['scripts/verify-evidence.cjs']);let v=fs.readFileSync(path.join(root,'contracts/source/10_authority252.csv'),'utf8');must(v.trim().split(/\r?\n/).length===253,'252 rows required');return {stableIDs:252,uiIDs:100}});
}
if(['all','native'].includes(mode)){
check('committed-domain-tests',()=>{
 const results=[];
 for(const [name,prefix] of nativePaths){
  const tests=filesUnder(prefix).filter(x=>/\.test\.mjs$|\.spec\.mjs$/i.test(x));
  const pyt=filesUnder(prefix).filter(x=>/(^|\/)test_.*\.py$/.test(x));
  if(!changed(prefix)&&tests.length===0&&pyt.length===0)continue;
  must(tests.length>0||pyt.length>0,name+' touched without checked-in tests');
  if(tests.length)run('node',['--test',...tests],root,150000);
  results.push({name,nodeTestFiles:tests.length,pythonTestFiles:pyt.length,pythonGate:pyt.length?'separate-python-job':'not_applicable'});
 }
 if(!results.length)absent('native','No domain files present on this branch; native PASS not asserted');
 return results
});
}
if(['all','security'].includes(mode)){
check('tracked-secret-scan',()=>{
 const files=run('git',['ls-files']).split(/\r?\n/).filter(Boolean);let bad=[];
 const re=/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|github_pat_[A-Za-z0-9_]{25,}|gh[pousr]_[A-Za-z0-9]{24,}|(?:AKIA|ASIA)[A-Z0-9]{16}\b|sk-proj-[A-Za-z0-9_-]{22,}/;
 const paths=/(^|\/)\.env($|\.)|(^|\/)(id_rsa|credentials\.json|service-account.*\.json)$|\.(?:p12|pfx|pem|sqlite3?)$/i;
 for(const f of files){if(paths.test(f))bad.push('PATH '+f);const p=path.join(root,f);if(!fs.existsSync(p)||fs.statSync(p).size>4000000)continue;const buf=fs.readFileSync(p);if(!buf.includes(0)&&re.test(buf.toString('utf8')))bad.push('CONTENT '+f)}
 must(bad.length===0,'secret candidates: '+bad.slice(0,8).join(','));return {trackedFiles:files.length}
});
}
if(['all','frontend'].includes(mode)){
const app='design/nonproduction/approved-clickable-abc-bc',dir=path.join(root,app);
if(!fs.existsSync(path.join(dir,'package-lock.json'))){
 check('missing-app-blocks-changed-frontend',()=>{must(!changed(app+'/')&&!changed('apps/web/'),'UI changed with no lock and usable frontend build');absent('frontend','No UI on this domain PR; not claiming UI PASS')});
}else{
check('frontend-committed-data-and-OSS-provenance',()=>{
 const obj=JSON.parse(fs.readFileSync(path.join(dir,'src/data/fixture.json'),'utf8'));
 must(obj.contacts.length===120,'120 fixture rows expected');
 const keys=obj.contacts.map(c=>[c.tenant,c.account,c.channel,c.peer_id,c.binding_revision].join('|'));must(new Set(keys).size===120,'canonical K duplicate');
 for(const p of ['src/data/overlay.json','src/data/sidecar.json','src/data/effective-fixture.json','W39_VENDOR_MODIFICATIONS.json','THIRD_PARTY_NOTICES.txt','evidence/CYCLONEDX_1_5_SBOM.json'])must(fs.existsSync(path.join(dir,p)),'missing source evidence '+p);
 const vendor=JSON.parse(fs.readFileSync(path.join(dir,'W39_VENDOR_MODIFICATIONS.json'),'utf8'));
 must(vendor.files.length===72,'vendor count');
 for(const f of vendor.files){const file=path.join(dir,f.vendorPath);must(fs.existsSync(file),'vendor missing '+f.vendorPath);const hash=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');must(hash===f.finalVendorSha,'vendor sha mismatch '+f.vendorPath)}
 return {syntheticContacts:120,vendorSourceFiles:72}
});
check('frontend-reproducible-npm-typescript-build-audit',()=>{
 run('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],dir,360000);
 run('npx',['tsc','--noEmit'],dir,180000);run('npm',['run','build'],dir,180000);
 run('npm',['audit','--audit-level=high'],dir,90000);
 return {cleanInstall:true,typescript:true,viteBuild:true,auditHigh:'no findings'}
});
}}
const out=path.join(reports,'ci-'+mode+'.json');fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(report.errors.length)process.exitCode=1;

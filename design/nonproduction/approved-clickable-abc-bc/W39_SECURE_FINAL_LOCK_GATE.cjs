'use strict';
const fs=require('fs'),p=require('path'),crypto=require('crypto'),{execFileSync}=require('child_process');
const root=__dirname,repo=p.resolve(root,'../../..'),base='design/nonproduction/approved-clickable-abc-bc/';
const w42='C:/Users/1/Documents/YanceV2/Phase3_OSS_Worktrees_20261024/DISPATCH/P2_AUDIT_ONLY_20261024/INDEPENDENT_REVIEW_RECEIPTS/P3-W42-OSS-PREIMPORT-POSTBUILD/';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const expected={original:'8287614bdf28e28fd51eb994037f351adbd9e74110fa0f9ec48409c1dc4c9e60',six:'5e15e6ab12652c5e0e5f662bc322e443e6ad68596f900e1f5a5009c7fef94b60'};
for(const [k,file] of [['original','VITE_ESBUILD_MINIMAL_SAFE_PIN_DELTA.csv'],['six','SIX_TRANSITIVE_LOCK_DELTA_ALLOW_HOLD.csv']]){if(sha(fs.readFileSync(p.join(w42,file)))!==expected[k])throw Error('W42_SIGNED_CSV_SHA_FAIL '+file);}
const old=JSON.parse(execFileSync('git',['-C',repo,'show','fddf625d9a06f6919f753a7c89302563c1a98b25:'+base+'package-lock.json'],{encoding:'utf8'})),lock=JSON.parse(fs.readFileSync(p.join(root,'package-lock.json'))),pkg=JSON.parse(fs.readFileSync(p.join(root,'package.json')));
if(pkg.devDependencies.vite!=='7.3.7'||pkg.overrides?.esbuild!=='0.28.1'||Object.keys({...pkg.dependencies,...pkg.devDependencies}).length!==14)throw Error('DIRECT_PIN_OR_OVERRIDE');
const prev=JSON.parse(execFileSync('git',['-C',repo,'show','fddf625d9a06f6919f753a7c89302563c1a98b25:'+base+'package.json'],{encoding:'utf8'}));
for(const [name,ver] of Object.entries({...prev.dependencies,...prev.devDependencies})){if((pkg.dependencies?.[name]||pkg.devDependencies?.[name])!==(name==='vite'?'7.3.7':ver))throw Error('UNAPPROVED_DIRECT_DRIFT '+name);}
const csv=fs.readFileSync(p.join(w42,'SIX_TRANSITIVE_LOCK_DELTA_ALLOW_HOLD.csv'),'utf8').trim().split(/\r?\n/);
const quoted=s=>[...s.matchAll(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)].map(m=>m[1].startsWith('"')?m[1].slice(1,-1).replace(/""/g,'"'):m[1]);
const rows=csv.slice(1).map(quoted);const extra=new Map(rows.map(r=>[r[2],{name:r[3],version:r[4],spdx:r[13]}]));if(extra.size!==6||rows.some(r=>r[0]!=='DELTA_ALLOW'||r[1]!=='LOCK_METADATA_ONLY_NO_NEW_DIRECT_DEP'))throw Error('W42_SIX_ROW_PARSE_OR_DECISION');
const changes=[];for(const key of new Set([...Object.keys(old.packages),...Object.keys(lock.packages)])){let a=old.packages[key],b=lock.packages[key];if(JSON.stringify(a)===JSON.stringify(b))continue;let category;if(key==='')category='ROOT';else if(key==='node_modules/vite'||key==='node_modules/esbuild')category='PIN';else if(/^node_modules\/@esbuild\//.test(key))category='ESBUILD_PLATFORM';else if(extra.has(key))category='W42_SIX_BUNDLE';else throw Error('UNAPPROVED_LOCK_DRIFT '+key);
 if(category==='ESBUILD_PLATFORM'&&(b?.version!=='0.28.1'||!b.integrity?.startsWith('sha512-')))throw Error('BAD_ESBUILD_PLATFORM '+key);
 if(category==='W42_SIX_BUNDLE'&&(a||b?.version!==extra.get(key).version||!b.inBundle||!b.optional||!b.dev||b.integrity||b.resolved))throw Error('ILLEGAL_SIX_BUNDLE '+key);
 changes.push({key,category,oldVersion:a?.version||null,newVersion:b?.version||null});
}
if(changes.length!==35||changes.filter(c=>c.category==='W42_SIX_BUNDLE').length!==6)throw Error('UNEXPECTED_LOCK_DELTA_COUNT '+changes.length);
if(lock.packages['node_modules/vite']?.integrity!=='sha512-AHEzTORMbi7/7aXp7w7KZ5+DCUdSeLsJz0grY8xHpc9DHdYb0vQu6DqJfm2tOw3gDExNgPgnJTXxM6syYFHaCA=='||lock.packages['node_modules/esbuild']?.integrity!=='sha512-HrJrvZv5ayxBzPfwphOoNzkzOIIlifzk0KJrGK2c8R4+LKpMtpYLQeUdjnwjWv/LZlkH2laZk+4w78pi99D4Vw==')throw Error('PIN_SRI_MISMATCH');
const report={stage:'W39_EXACT_W42_TWO_SIGNED_CSV_LOCK_GATE',status:'ALLOW',sourceSHA:'fddf625d9a06f6919f753a7c89302563c1a98b25',signedCsvSha:expected,lockSHA256:sha(fs.readFileSync(p.join(root,'package-lock.json'))),oldNodes:Object.keys(old.packages).length,newNodes:Object.keys(lock.packages).length,changes,counts:Object.fromEntries([...new Set(changes.map(x=>x.category))].map(k=>[k,changes.filter(x=>x.category===k).length]))};
fs.writeFileSync(p.join(root,'evidence/W39_SECURE_LOCK_TWO_ALLOW_GATES.json'),JSON.stringify(report,null,2));console.log('W39_TWO_SIGNED_GATE_PASS '+JSON.stringify({lockSHA:report.lockSHA256,nodes:[report.oldNodes,report.newNodes],count:changes.length,categories:report.counts}));

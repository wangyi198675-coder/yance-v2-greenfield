'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs','EVIDENCE_HASHES.json'),'utf8'));
const problems=[];
for (const e of manifest.copied_from_p2_authoritative_files) {
  const p=path.join(root,e.rel);
  if (!fs.existsSync(p)) {problems.push('MISSING:'+e.rel);continue;}
  const data=fs.readFileSync(p),sha=crypto.createHash('sha256').update(data).digest('hex');
  if (data.length!==e.bytes||sha!==e.sha256) problems.push('HASH_MISMATCH:'+e.rel);
}
function csv(file){
  const t=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'');let rows=[],r=[],v='',q=false;
  for(let i=0;i<t.length;i++){let c=t[i];if(q){if(c==='"'&&t[i+1]==='"'){v+='"';i++}else if(c==='"')q=false;else v+=c;}
  else if(c==='"')q=true;else if(c===','){r.push(v);v='';}else if(c==='\n'){r.push(v.replace(/\r$/,''));rows.push(r);r=[];v='';}else v+=c;}
  if(v||r.length){r.push(v);rows.push(r)}
  const header=rows.shift();
  return rows.filter(x=>x.length>=header.length).map(x=>Object.fromEntries(header.map((k,i)=>[k,x[i]])));
}
const x=csv(path.join(root,'contracts/source/09_legacy252.csv'));
const y=csv(path.join(root,'contracts/source/10_authority252.csv'));
const z=csv(path.join(root,'contracts/audit/W04_feature252.csv'));
const u=csv(path.join(root,'contracts/audit/W04_UIE100.csv'));
const unique=arr=>new Set(arr.map(x=>x.stable_id)).size===arr.length;
const ids=new Set(x.map(r=>r.stable_id));
if(x.length!==252||y.length!==252||z.length!==252||u.length!==100||ids.size!==252||!unique(y)||!unique(z))problems.push('ID_COUNTS_NOT_252_252_252_100');
for(const q of [y,z])for(const id of ids)if(!q.some(r=>r.stable_id===id)){problems.push('MISSING:'+id);break;}
const original=JSON.parse(fs.readFileSync(path.join(root,'design/provenance/CHAT_A_V25_USER_UPLOAD.json'),'utf8'));
if(original.bytes!==89033||original.sha256!=='7365b4bdf4011007b3fb6b6736ad3d47ede9a0604b1d8c24b17074d7c653aceb')problems.push('REFERENCE_PROVENANCE_MISMATCH');
for(const p of ['apps/web','apps/windows','services/agentos','services/api','connectors/mautrix-meta','connectors/pancake','connectors/baileys','connectors/tdlib-json']){
  const contents=fs.readdirSync(path.join(root,p));
  if(contents.length!==1||contents[0]!=='.gitkeep')problems.push('APPLICATION_CODE_NOT_ALLOWED_P3_0:'+p);
}
console.log(JSON.stringify({scope:'P3_0_CONTRACT_BOOTSTRAP_ONLY',evidence_files:manifest.copied_from_p2_authoritative_files.length,original09:x.length,original10:y.length,w04_features:z.length,w04_UIE:u.length,unique_ids:ids.size,original_v25_sha:original.sha256,errors:problems},null,2));
if(problems.length)process.exitCode=2;

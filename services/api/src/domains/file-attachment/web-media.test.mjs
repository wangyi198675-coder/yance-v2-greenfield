import test from 'node:test';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {mkdtemp,rm,readFile,readdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {PersistentMediaAssets,MediaError,mediaCapabilities,sniffMedia} from './web-media.mjs';
import {createWebMediaHttpHandler} from './web-media-http.mjs';

// Test files are locally authored fixture bytes, never a user's messages or remote account media.
// PNG is a portable 1x1 image; WAV is a valid RIFF/PCM tone; MP4 is a small ISO-BMFF
// container with ftyp/moov/mdat (storage roundtrip only; no decoder/playback claim).
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64');
function wav(){
 const samples=256,buf=Buffer.alloc(44+samples*2);
 buf.write('RIFF',0);buf.writeUInt32LE(buf.length-8,4);buf.write('WAVEfmt ',8);
 buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);
 buf.writeUInt32LE(8000,24);buf.writeUInt32LE(16000,28);buf.writeUInt16LE(2,32);buf.writeUInt16LE(16,34);
 buf.write('data',36);buf.writeUInt32LE(samples*2,40);
 for(let i=0;i<samples;i++)buf.writeInt16LE(Math.round(Math.sin(i/8)*2000),44+i*2);
 return buf;
}
const atom=(kind,payload)=>{const b=Buffer.alloc(payload.length+8);b.writeUInt32BE(b.length,0);b.write(kind,4);payload.copy(b,8);return b};
const mp4=Buffer.concat([atom('ftyp',Buffer.from('isom0000isommp42')),atom('moov',Buffer.from('minimal test atom')),atom('mdat',Buffer.from('container bytes only - playback not tested'))]);
const K={tenant:'actual-test-tenant',account:'actual-test-account-A',channel:'FB_PERSONAL',peer_id:'actual-test-contact-A',binding_revision:'epoch-1'};
const actor='authorized-local-test-principal';
const error=code=>e=>e instanceof MediaError&&e.code===code;
function createFixture(directory,key){
 const s={grant_active:true,consent_active:true,account_active:true,allowed:true,epoch:0,expires:Date.now()+300000};
 const authority={calls:[],async check(p){
  this.calls.push(p);
  return {allowed:s.allowed&&p.actor===actor&&p.k.account===K.account&&p.k.binding_revision===K.binding_revision,
   principal:p.actor,...p.k,account_active:s.account_active,grant_active:s.grant_active,consent_active:s.consent_active,
   expires_at:s.expires,grant_revision:1+s.epoch,consent_revision:1+s.epoch,revocation_epoch:s.epoch,custody_epoch:0,
   message_authorized:p.message_id===null||p.message_id==='mid-test-original-42',
   authorized_message_id:p.message_id};
 }};
 const create=()=>new PersistentMediaAssets({directory,key,authority});
 return {s,authority,create};
}
const attrs=(mime,b,extra={})=>({actor,k:K,purpose:'contact_draft',mime,byte_size:b.length,
 original_name:'user-test-file.'+mime.split('/')[1],message_id:null,
 consent_id:'consent-authority-a',grant_id:'grant-authority-a',
 idempotency_key:'upload-'+mime,...extra});
async function withFixture(fn){
 const dir=await mkdtemp(join(tmpdir(),'w23-real-media-')),key=randomBytes(32),f=createFixture(dir,key);
 try{await fn({...f,dir,key})}finally{await rm(dir,{recursive:true,force:true})}
}
test('independent PNG / WAV / MP4 signatures, sizes, disabled generation capabilities',()=>{
 assert.equal(sniffMedia(png),'image/png');assert.equal(sniffMedia(wav()),'audio/wav');assert.equal(sniffMedia(mp4),'video/mp4');
 assert.throws(()=>sniffMedia(Buffer.from('not an image mp4 WAV file')),error('MEDIA_SIGNATURE_INVALID'));
 const c=mediaCapabilities();assert.equal(c.media_generation.image,'PROVIDER_NOT_CONFIGURED');
 assert.equal(c.media_generation.video,'PROVIDER_NOT_CONFIGURED');assert.equal(c.media_generation.tts,'PROVIDER_NOT_CONFIGURED');
 assert.ok(c.accepted.some(x=>x.mime==='video/mp4'&&x.max_bytes>1000000));
});
test('real authored image/audio/video bytes persist encrypted, survive cold restart, and delete',async()=>withFixture(async({create,dir,key})=>{
 const a=await create().open();
 for(const [mime,bytes] of [['image/png',png],['audio/wav',wav()],['video/mp4',mp4]]){
  const started=await a.begin(attrs(mime,bytes));
  assert.equal(started.status,'RESERVED');
  const ready=await a.upload({actor,k:K,asset_id:started.asset_id,bytes});
  assert.equal(ready.status,'READY');assert.equal(ready.byte_size,bytes.length);assert.equal(ready.message_id,null);
  assert.equal(ready.sha256,createHash('sha256').update(bytes).digest('hex'));
  const ciphertext=await readFile(join(dir,'blobs',started.asset_id+'.gcm'));
  assert.notDeepEqual(ciphertext.subarray(12,-16),bytes);
  const restart=await create().open();
  const out=await restart.read({actor,k:K,asset_id:started.asset_id});
  assert.deepEqual(out.bytes,bytes);assert.equal(out.metadata.mime,mime);
  const del=await restart.delete({actor,k:K,asset_id:started.asset_id});
  assert.equal(del.status,'REVOKED');
  const restartAgain=await create().open();
  await assert.rejects(restartAgain.read({actor,k:K,asset_id:started.asset_id}),error('ASSET_NOT_READY'));
  assert.equal((await readdir(join(dir,'blobs'))).includes(started.asset_id+'.gcm'),false);
 }
}));
test('metadata / idempotency conflict survive restart and do not leak disk paths',async()=>withFixture(async({create})=>{
 const first=await create().open();const a=await first.begin(attrs('image/png',png));
 const after=await create().open();assert.deepEqual(await after.begin(attrs('image/png',png)),a);
 await assert.rejects(after.begin(attrs('image/png',png,{byte_size:png.length+1})),error('IDEMPOTENCY_CONFLICT'));
 const m=await after.upload({actor,k:K,asset_id:a.asset_id,bytes:png});
 assert.equal('storage_path' in m,false);assert.equal('encryption_key' in m,false);
 assert.deepEqual(await (await create().open()).metadata({actor,k:K,asset_id:a.asset_id}),m);
}));
test('MIME mismatch, size, unsupported SVG and no message MID binding fail closed',async()=>withFixture(async({create})=>{
 const a=await create().open();
 await assert.rejects(a.begin(attrs('image/svg+xml',png)),error('UNSUPPORTED_MEDIA'));
 await assert.rejects(a.begin(attrs('image/png',png,{byte_size:9*1024*1024})),error('SIZE_LIMIT'));
 await assert.rejects(a.begin(attrs('image/png',png,{purpose:'contact_received'})),error('MESSAGE_REQUIRED'));
 await assert.rejects(a.begin(attrs('image/png',png,{purpose:'private_tool_artifact',message_id:'mid-test-original-42'})),error('MESSAGE_SCOPE_FORBIDDEN'));
 const s=await a.begin(attrs('image/png',png));
 await assert.rejects(a.upload({actor,k:K,asset_id:s.asset_id,bytes:wav()}),error('SIZE_MISMATCH'));
 const sameLength=Buffer.alloc(png.length,65);
 await assert.rejects(a.upload({actor,k:K,asset_id:s.asset_id,bytes:sameLength}),error('MEDIA_SIGNATURE_INVALID'));
}));
test('full K + authorized message identity, stolen actor, revoked grant/consent, stale binding rejected',async()=>withFixture(async({create,s})=>{
 const a=await create().open();
 const msg=await a.begin(attrs('image/png',png,{message_id:'mid-test-original-42',purpose:'contact_received'}));
 await a.upload({actor,k:K,asset_id:msg.asset_id,bytes:png});
 await assert.rejects(a.read({actor:'stolen-user',k:K,asset_id:msg.asset_id}),error('ACCESS_DENIED'));
 for(const diff of [{account:'actual-test-account-B'},{peer_id:'other-contact'},{binding_revision:'epoch-2'},{channel:'FB_PAGE'},{tenant:'other-tenant'}]){
  await assert.rejects(a.read({actor,k:{...K,...diff},asset_id:msg.asset_id}),error('ASSET_NOT_FOUND_OR_FORBIDDEN'));
 }
 s.grant_active=false;s.epoch++;
 await assert.rejects(a.read({actor,k:K,asset_id:msg.asset_id}),error('ACCESS_DENIED'));
 s.grant_active=true;s.consent_active=false;s.epoch++;
 await assert.rejects(a.metadata({actor,k:K,asset_id:msg.asset_id}),error('ACCESS_DENIED'));
 s.consent_active=true;s.account_active=false;
 await assert.rejects(a.read({actor,k:K,asset_id:msg.asset_id}),error('ACCESS_DENIED'));
 s.account_active=true;
 assert.deepEqual((await a.read({actor,k:K,asset_id:msg.asset_id})).bytes,png);
}));
test('untrusted message ID needs explicit authorization for binding',async()=>withFixture(async({create})=>{
 const a=await create().open();
 await assert.rejects(a.begin(attrs('image/png',png,{purpose:'contact_received',message_id:'forged-message-id'})),error('ACCESS_DENIED'));
}));
test('wrong restart key fail-closed; tampering with encrypted blob fails authentication',async()=>withFixture(async({create,dir})=>{
 const a=await create().open(),s=await a.begin(attrs('image/png',png));
 await a.upload({actor,k:K,asset_id:s.asset_id,bytes:png});
 const wrong=createFixture(dir,randomBytes(32));const r=await wrong.create().open();
 await assert.rejects(r.read({actor,k:K,asset_id:s.asset_id}),error('BLOB_AUTH_FAILED'));
 const path=join(dir,'blobs',s.asset_id+'.gcm'),buf=await readFile(path);buf[20]^=1;await writeFile(path,buf);
 await assert.rejects(a.read({actor,k:K,asset_id:s.asset_id}),error('BLOB_AUTH_FAILED'));
}));
test('real same-origin HTTP upload + byte download + cold restart + delete, no Windows install',async()=>withFixture(async({create})=>{
 const service=await create().open();
 const handler=createWebMediaHttpHandler({service,resolveIdentity:async()=>({actor,k:K}),checkCsrf:async(req)=>req.headers['x-csrf-test']==='pass'});
 const server=createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port,request=async(path,method='GET',body,headers={})=>{
  const res=await fetch(base+path,{method,headers:{...(body&&!(body instanceof Buffer)?{'content-type':'application/json'}:{}),...headers},body:body?(body instanceof Buffer?body:JSON.stringify(body)):undefined});
  return {status:res.status,headers:res.headers,body:res.headers.get('content-type')?.includes('application/json')?await res.json():Buffer.from(await res.arrayBuffer())};
 };
 try{
  const init=await request('/v2/media/upload-sessions','POST',attrs('image/png',png),{'x-csrf-test':'pass'});
  assert.equal(init.status,201);const id=init.body.asset_id;
  assert.equal((await request('/v2/media/'+id+'/content','PUT',png,{'content-type':'image/png'})).status,403);
  const saved=await request('/v2/media/'+id+'/content','PUT',png,{'content-type':'image/png','x-csrf-test':'pass'});
  assert.equal(saved.status,200);assert.equal(saved.body.mime,'image/png');
  const fetched=await request('/v2/media/'+id+'/content');
  assert.equal(fetched.status,200);assert.deepEqual(fetched.body,png);
  assert.equal(fetched.headers.get('cache-control'),'no-store, private');
  assert.equal(fetched.headers.get('content-disposition').startsWith('attachment;'),true);
  const cap=await request('/api/v2/media/capabilities');
  assert.equal(cap.body.media_generation.video,'PROVIDER_NOT_CONFIGURED');
  assert.equal((await request('/v2/media/'+id,'DELETE',null,{'x-csrf-test':'pass'})).status,200);
  assert.equal((await request('/v2/media/'+id+'/content')).status,409);
 }finally{await new Promise(resolve=>server.close(resolve))}
}));
test('HTTP without trusted ports refuses to mount; unauthenticated is 401',async()=>withFixture(async({create})=>{
 const service=await create().open();
 assert.throws(()=>createWebMediaHttpHandler({service,resolveIdentity:async()=>({actor,k:K})}),error('TRUSTED_PORTS_REQUIRED'));
 const server=createServer(createWebMediaHttpHandler({service,resolveIdentity:async()=>null,checkCsrf:async()=>true}));
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{const res=await fetch('http://127.0.0.1:'+server.address().port+'/v2/media/capabilities');
   assert.equal(res.status,401)}finally{await new Promise(resolve=>server.close(resolve))}
}));

test('true OS-process restart: new Node process reads independently encrypted persisted WAV bytes',async()=>withFixture(async({create,dir,key})=>{
 const s=await create().open(),start=await s.begin(attrs('audio/wav',wav()));
 await s.upload({actor,k:K,asset_id:start.asset_id,bytes:wav()});
 const {spawnSync}=await import('node:child_process');
 const moduleUrl=new URL('./web-media.mjs',import.meta.url).href;
 const code=`
  const {PersistentMediaAssets}=await import(${JSON.stringify(moduleUrl)});
  const k=JSON.parse(process.env.W23_K);
  const svc=await new PersistentMediaAssets({directory:process.env.W23_DIR,key:Buffer.from(process.env.W23_KEY,'hex'),
    authority:{check:async ({actor,k})=>({allowed:true,principal:actor,...k,account_active:true,grant_active:true,consent_active:true,
      expires_at:Date.now()+120000,grant_revision:1,consent_revision:1,revocation_epoch:0,custody_epoch:0})}}).open();
  const a=await svc.read({actor:process.env.W23_ACTOR,k,asset_id:process.env.W23_ID});
  process.stdout.write(a.bytes.toString('hex'));
 `;
 const proc=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:20000,env:{
  ...process.env,W23_DIR:dir,W23_KEY:key.toString('hex'),W23_ACTOR:actor,W23_ID:start.asset_id,W23_K:JSON.stringify(K)}});
 assert.equal(proc.status,0,'child restart failure: '+proc.stderr);
 assert.equal(proc.stdout,wav().toString('hex'));
}));
test('HTTP rejects mismatched uploaded content-type despite valid actual bytes',async()=>withFixture(async({create})=>{
 const service=await create().open();
 const h=createWebMediaHttpHandler({service,resolveIdentity:async()=>({actor,k:K}),checkCsrf:async()=>true});
 const server=createServer(h);server.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const upload=await fetch(base+'/v2/media/upload-sessions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(attrs('image/png',png))});
  const {asset_id}=await upload.json();assert.equal(upload.status,201);
  const response=await fetch(base+'/v2/media/'+asset_id+'/content',{method:'PUT',headers:{'content-type':'image/jpeg'},body:png});
  assert.equal(response.status,400);assert.equal((await response.json()).error,'MIME_MISMATCH');
  const meta=await fetch(base+'/v2/media/'+asset_id);
  assert.equal(meta.status,409);
 }finally{await new Promise(resolve=>server.close(resolve))}
}));

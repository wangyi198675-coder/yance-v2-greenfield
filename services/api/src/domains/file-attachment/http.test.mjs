import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {FileAttachmentService} from './file-attachment.mjs';
import {createSyntheticAssetHttpHandler} from './http.mjs';
const actor='fake-test-user';
const k={tenant:'SYNTHETIC_TEST_ONLY',account:'fake-a',channel:'FB_PERSONAL',peer_id:'fake-peer',binding_revision:'fake-rev'};
const bytes=Buffer.from('YANCE_SYNTHETIC_FILE_V1\nnever-real-image');
test('real loopback HTTP: upload -> encrypted asset -> metadata -> read handle -> revoke',async()=>{
 const state={grant:true,consent:true};
 const authority={async check({action,actor,k}){return {allowed:true,account_active:true,grant_active:state.grant,
  consent_active:state.consent,expires_at:Date.now()+60000,grant_revision:state.grant?1:2,consent_revision:state.consent?1:2,
  revocation_epoch:state.grant?0:1,custody_epoch:0,principal:actor,tenant:k.tenant,account:k.account,channel:k.channel,peer_id:k.peer_id,binding_revision:k.binding_revision}}};
 const service=new FileAttachmentService({authority});
 let resolverCount=0;
 const handler=createSyntheticAssetHttpHandler({service,resolveIdentity:async()=>{resolverCount++;return {actor,k}}});
 const server=createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 const request=async(path,method='GET',body)=>{const response=await fetch(base+path,{method,headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:response.status,body:await response.json(),headers:response.headers}};
 try{
  const start=await request('/v2/assets/upload-sessions','POST',{actor:'fake-attacker',k:{...k,peer_id:'fake-other'},
   purpose:'contact_draft',declared_mime:'application/x-yance-synthetic',byte_size:bytes.length,
   consent_id:'fake-consent',grant_id:'fake-grant',idempotency_key:'fake-first'});
  assert.equal(start.status,201);assert.equal(start.body.status,'RESERVED');
  const id=start.body.asset_id;
  const complete=await request('/v2/assets/upload-sessions/'+start.body.session_id+'/complete','POST',{bytes_base64:bytes.toString('base64')});
  assert.equal(complete.status,200);assert.equal(complete.body.status,'READY');assert.deepEqual(complete.body.k,k);
  const meta=await request('/v2/assets/'+id);assert.equal(meta.body.status,'READY');
  assert.equal(meta.headers.get('cache-control'),'no-store');
  assert.equal('blob_key' in meta.body,false);
  const cap=await request('/v2/assets/'+id+'/read-capabilities','POST',{ttl_ms:1000});
  const read=await request('/v2/assets/read','POST',{read_handle:cap.body.read_handle});
  assert.equal(Buffer.from(read.body.synthetic_bytes_base64,'base64').toString(),bytes.toString());
  assert.equal((await request('/v2/assets/read','POST',{read_handle:cap.body.read_handle})).status,403);
  const derived=await request('/v2/assets/'+id+'/derivatives','POST',{provider_ref:'fake-derivative'});
  assert.equal(derived.status,201);
  state.grant=false;state.consent=false;
  const forbidden=await request('/v2/assets/'+id);
  assert.equal(forbidden.status,403);assert.equal(forbidden.body.error,'ACCESS_DENIED');
  const revoke=await request('/v2/assets/'+id,'DELETE');
  assert.equal(revoke.body.status,'REVOKED');assert.equal(revoke.body.derivatives[0].deletion_status,'EXTERNAL_DELETE_UNCONFIRMED');
  assert.equal((await request('/v2/assets/'+id)).status,403);
  assert.ok(resolverCount>=9);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
test('HTTP rejects missing trusted principal; never trust body account and never start unconfigured listener',async()=>{
 assert.throws(()=>createSyntheticAssetHttpHandler({service:new FileAttachmentService({authority:{check:async()=>({})}})}),{code:'TRUSTED_HTTP_PORTS_REQUIRED'});
 const svc=new FileAttachmentService({authority:{check:async()=>({})}});
 const server=createServer(createSyntheticAssetHttpHandler({service:svc,resolveIdentity:async()=>null}));
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const r=await fetch('http://127.0.0.1:'+server.address().port+'/v2/assets/upload-sessions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({actor,k})});
  assert.equal(r.status,401);assert.equal((await r.json()).error,'AUTH_REQUIRED');
 }finally{await new Promise(resolve=>server.close(resolve))}
});

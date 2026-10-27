import test from 'node:test';
import assert from 'node:assert/strict';
import {FileAttachmentService,SyntheticEncryptedBlobStore,canonicalK,AssetError} from './file-attachment.mjs';
const k={tenant:'SYNTHETIC_TEST_ONLY',account:'fake-account-A',channel:'FB_PERSONAL',peer_id:'fake-peer-A',binding_revision:'rev-1'};
const actor='fake-user';
const bytes=Buffer.from('YANCE_SYNTHETIC_FILE_V1\nfictional file, no real media');
const failure=(code)=>e=>e instanceof AssetError&&e.code===code;
function fixture(){
 let time=1000;const s={allowed:true,account_active:true,grant_active:true,consent_active:true,expires_at:500000,
  grant_revision:1,consent_revision:1,revocation_epoch:0,custody_epoch:0};
 const authority={calls:[],async check(req){
  this.calls.push(req.action);
  return {...s,allowed:s.allowed && req.actor===actor,principal:req.actor,tenant:req.k.tenant,account:req.k.account,channel:req.k.channel,peer_id:req.k.peer_id,binding_revision:req.k.binding_revision};
 }};
 const storage=new SyntheticEncryptedBlobStore();
 const service=new FileAttachmentService({authority,storage,clock:()=>time});
 const create=(over={})=>service.beginUpload({actor,k,purpose:'contact_draft',declared_mime:'application/x-yance-synthetic',
  byte_size:bytes.length,consent_id:'fake-consent-1',grant_id:'fake-grant-1',idempotency_key:'fake-upload-1',...over});
 const complete=(s,over={})=>service.completeUpload({actor,k,session_id:s.session_id,bytes,...over});
 const ready=async()=>{const s=await create();await complete(s);return s};
 return {s,authority,service,storage,create,complete,ready,advance:n=>time+=n,time:()=>time};
}
test('K keeps tenant/account/channel/peer/binding; real data and bad channel rejected',()=>{
 assert.deepEqual(canonicalK(k),k);
 assert.throws(()=>canonicalK({...k,tenant:'actual-person'}),failure('REAL_DATA_FORBIDDEN'));
 assert.throws(()=>canonicalK({...k,channel:'BOT'}),failure('BAD_CHANNEL'));
 assert.throws(()=>canonicalK({...k,peer_id:''}),failure('INVALID_K'));
});
test('authority port mandatory, synthetic storage rejects wrong key',()=>{
 assert.throws(()=>new FileAttachmentService(),failure('AUTHORITY_REQUIRED'));
 assert.throws(()=>new SyntheticEncryptedBlobStore(Buffer.alloc(1)),failure('INVALID_KEY'));
});
test('encrypted bytes, metadata and one-time capability: ciphertext not plaintext',async()=>{
 const f=fixture(),session=await f.ready();
 const metadata=await f.service.getMetadata({actor,k,asset_id:session.asset_id});
 assert.equal(metadata.status,'READY');assert.equal(metadata.derivative_count,0);
 assert.equal('encrypted_blob_ref' in metadata,false);
 const ciphertext=f.storage.inspectCiphertextForTest(session.asset_id);
 assert.notDeepEqual(ciphertext,bytes);assert.equal(ciphertext.includes(bytes),false);
 const cap=await f.service.issueReadCapability({actor,k,asset_id:session.asset_id});
 assert.deepEqual(await f.service.readWithCapability({actor,k,read_handle:cap.read_handle}),bytes);
 await assert.rejects(f.service.readWithCapability({actor,k,read_handle:cap.read_handle}),failure('CAPABILITY_INVALID'));
 assert.deepEqual(f.authority.calls,['create','upload','upload','read','read','read','read']);
});
test('idempotent upload session and complete; conflicting replay rejected',async()=>{
 const f=fixture(),a=await f.create(),again=await f.create();
 assert.deepEqual(a,again);
 await assert.rejects(f.create({byte_size:bytes.length+1}),failure('IDEMPOTENCY_CONFLICT'));
 assert.deepEqual(await f.complete(a),await f.complete(a));
});
test('missing consent, wrong MIME, oversized, nonfake bytes all fail closed',async()=>{
 const f=fixture();
 await assert.rejects(f.create({consent_id:''}),failure('CONSENT_REQUIRED'));
 await assert.rejects(f.create({declared_mime:'image/jpeg'}),failure('UNSUPPORTED_MIME'));
 await assert.rejects(f.create({byte_size:200000}),failure('SIZE_LIMIT'));
 const a=await f.create();
 await assert.rejects(f.complete(a,{bytes:Buffer.alloc(bytes.length)}),failure('SYNTHETIC_BYTES_ONLY'));
 await assert.rejects(f.complete(a,{bytes:Buffer.from('x')}),failure('SIZE_MISMATCH'));
 assert.equal(f.storage.inspectCiphertextForTest(a.asset_id),null);
});
test('cross-tenant, account, peer, channel, rebind, principal denied for metadata and bearer',async()=>{
 const f=fixture(),a=await f.ready(),cap=await f.service.issueReadCapability({actor,k,asset_id:a.asset_id});
 for(const wrong of [{...k,account:'fake-account-B'},{...k,peer_id:'fake-peer-B'},{...k,channel:'FB_PAGE'},{...k,binding_revision:'rev-2'}]){
  await assert.rejects(f.service.getMetadata({actor,k:wrong,asset_id:a.asset_id}),failure('ASSET_NOT_FOUND_OR_FORBIDDEN'));
 }
 await assert.rejects(f.service.getMetadata({actor:'fake-other',k,asset_id:a.asset_id}),failure('ACCESS_DENIED'));
 await assert.rejects(f.service.readWithCapability({actor:'fake-other',k,read_handle:cap.read_handle}),failure('CAPABILITY_INVALID'));
});
test('revoked grant, consent, account and expired eligibility deny already-minted read handle',async()=>{
 for(const change of [
  s=>{s.grant_active=false;s.revocation_epoch++}, s=>{s.consent_active=false;s.consent_revision++},
  s=>{s.account_active=false},s=>{s.expires_at=1000}]){
  const f=fixture(),a=await f.ready(),cap=await f.service.issueReadCapability({actor,k,asset_id:a.asset_id});
  change(f.s);
  await assert.rejects(f.service.readWithCapability({actor,k,read_handle:cap.read_handle}),failure('ACCESS_DENIED'));
 }
});
test('regrant at new revision does not reactivate old read capability',async()=>{
 const f=fixture(),a=await f.ready(),cap=await f.service.issueReadCapability({actor,k,asset_id:a.asset_id});
 f.s.grant_revision++;f.s.revocation_epoch++;
 await assert.rejects(f.service.readWithCapability({actor,k,read_handle:cap.read_handle}),failure('AUTH_REVISION_CHANGED'));
 const fresh=await f.service.issueReadCapability({actor,k,asset_id:a.asset_id});
 assert.deepEqual(await f.service.readWithCapability({actor,k,read_handle:fresh.read_handle}),bytes);
});
test('expiry TTL is bounded and old token never yields bytes',async()=>{
 const f=fixture(),a=await f.ready();
 await assert.rejects(f.service.issueReadCapability({actor,k,asset_id:a.asset_id,ttl_ms:10001}),failure('TTL_INVALID'));
 const cap=await f.service.issueReadCapability({actor,k,asset_id:a.asset_id,ttl_ms:10});f.advance(10);
 await assert.rejects(f.service.readWithCapability({actor,k,read_handle:cap.read_handle}),failure('CAPABILITY_INVALID'));
});
test('revocation purges local ciphertext, denies old metadata and tracks external deletion truthfully',async()=>{
 const f=fixture(),a=await f.ready();
 const d=await f.service.registerDerivative({actor,k,asset_id:a.asset_id,provider_ref:'fake-provider-ref-1'});
 const cap=await f.service.issueReadCapability({actor,k,asset_id:a.asset_id});
 f.s.grant_active=false;f.s.consent_active=false;
 const r=await f.service.revokeAsset({actor,k,asset_id:a.asset_id});
 assert.equal(r.status,'REVOKED');assert.deepEqual(r.derivatives,[{derivative_id:d.derivative_id,deletion_status:'EXTERNAL_DELETE_UNCONFIRMED'}]);
 assert.equal(f.storage.inspectCiphertextForTest(a.asset_id),null);
 await assert.rejects(f.service.getMetadata({actor,k,asset_id:a.asset_id}),failure('ACCESS_DENIED'));
 await assert.rejects(f.service.readWithCapability({actor,k,read_handle:cap.read_handle}),failure('CAPABILITY_INVALID'));
 assert.deepEqual(await f.service.revokeAsset({actor,k,asset_id:a.asset_id}),r);
});
test('stale account binding, vanished authority, auth errors and upload session mismatch block side effects',async()=>{
 const f=fixture(),a=await f.create();
 await assert.rejects(f.complete(a,{k:{...k,binding_revision:'rev-2'}}),failure('ASSET_NOT_FOUND_OR_FORBIDDEN'));
 f.s.allowed=false;
 await assert.rejects(f.complete(a),failure('ACCESS_DENIED'));
 assert.equal(f.storage.inspectCiphertextForTest(a.asset_id),null);
 f.s.allowed=true;
 f.authority.check=async()=>{throw Error('offline')};
 await assert.rejects(f.complete(a),failure('ACCESS_DENIED'));
});
test('mid-flight revoke/revision change fails byte read even when first permission check was valid',async()=>{
 const f=fixture(),a=await f.ready(),cap=await f.service.issueReadCapability({actor,k,asset_id:a.asset_id});
 const original=f.authority.check.bind(f.authority);let once=true;
 f.authority.check=async q=>{const e=await original(q);if(q.action==='read'&&once){once=false;f.s.revocation_epoch++;f.s.grant_revision++}return e};
 await assert.rejects(f.service.readWithCapability({actor,k,read_handle:cap.read_handle}),failure('AUTH_REVISION_CHANGED'));
});
test('derivative is synthetic only; revoked asset cannot acquire new derivative',async()=>{
 const f=fixture(),a=await f.ready();
 await assert.rejects(f.service.registerDerivative({actor,k,asset_id:a.asset_id,provider_ref:'https://real.example/photo'}),failure('FAKE_PROVIDER_REF_REQUIRED'));
 await f.service.registerDerivative({actor,k,asset_id:a.asset_id,provider_ref:'fake-child-1'});
 await assert.rejects(f.service.registerDerivative({actor,k,asset_id:a.asset_id,provider_ref:'fake-child-1'}),failure('DUPLICATE_DERIVATIVE'));
 await f.service.revokeAsset({actor,k,asset_id:a.asset_id});
 await assert.rejects(f.service.registerDerivative({actor,k,asset_id:a.asset_id,provider_ref:'fake-child-2'}),failure('ASSET_NOT_READY'));
});

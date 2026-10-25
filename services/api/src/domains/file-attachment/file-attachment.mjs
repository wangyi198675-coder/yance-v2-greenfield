// W23 Issue #9. Nonproduction: fake asset bytes only. No direct provider send.
import {randomBytes,randomUUID,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
const fields=['tenant','account','channel','peer_id','binding_revision'];
const channels=new Set(['FB_PERSONAL','FB_PAGE','WHATSAPP_PERSONAL','TELEGRAM_PERSONAL']);
const marker=Buffer.from('YANCE_SYNTHETIC_FILE_V1\n');
const hash=s=>createHash('sha256').update(s).digest('hex');
const key=k=>JSON.stringify(fields.map(x=>k[x]));
export class AssetError extends Error { constructor(code){super(code);this.code=code;this.name='AssetError';} }
const bad=(code)=>{throw new AssetError(code)};
const txt=(x,code)=>{if(typeof x!=='string'||!x||x.length>160||/[\x00-\x1f]/.test(x))bad(code)};
const fake=(x,code)=>{txt(x,code);if(!x.startsWith('fake-'))bad(code)};
export function canonicalK(k){
 if(!k||typeof k!=='object')bad('INVALID_K');
 for(const f of fields)txt(k[f],'INVALID_K');
 if(k.tenant!=='SYNTHETIC_TEST_ONLY')bad('REAL_DATA_FORBIDDEN');
 if(!channels.has(k.channel))bad('BAD_CHANNEL');
 return Object.fromEntries(fields.map(f=>[f,k[f]]));
}
const stamp=a=>JSON.stringify([a.grant_revision,a.consent_revision,a.revocation_epoch,a.custody_epoch]);
// Cryptographic AES-GCM ciphertext, ephemeral key, RAM only. Not production KMS/scan/durable blob storage.
export class SyntheticEncryptedBlobStore {
 #key; #data=new Map();
 constructor(key=randomBytes(32)){if(!Buffer.isBuffer(key)||key.length!==32)bad('INVALID_KEY');this.#key=Buffer.from(key)}
 put(id,bytes){
  if(this.#data.has(id))bad('BLOB_EXISTS');
  const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',this.#key,iv);
  c.setAAD(Buffer.from(id));this.#data.set(id,{iv,blob:Buffer.concat([c.update(bytes),c.final()]),tag:c.getAuthTag()});
 }
 get(id){
  const r=this.#data.get(id);if(!r)bad('BLOB_UNAVAILABLE');
  try{const d=createDecipheriv('aes-256-gcm',this.#key,r.iv);d.setAAD(Buffer.from(id));d.setAuthTag(r.tag);return Buffer.concat([d.update(r.blob),d.final()])}
  catch{bad('BLOB_AUTH_FAILED')}
 }
 remove(id){const r=this.#data.get(id);if(r){r.iv.fill(0);r.blob.fill(0);r.tag.fill(0);this.#data.delete(id)}}
 inspectCiphertextForTest(id){return this.#data.has(id)?Buffer.from(this.#data.get(id).blob):null}
}
export class FileAttachmentService {
 #auth;#storage;#clock;#max;
 #assets=new Map();#sessions=new Map();#idempo=new Map();#caps=new Map();
 constructor({authority,storage=new SyntheticEncryptedBlobStore(),clock=()=>Date.now(),maxBytes=65536}={}){
  if(!authority||typeof authority.check!=='function')bad('AUTHORITY_REQUIRED');
  if(!(storage instanceof SyntheticEncryptedBlobStore)||typeof clock!=='function'||!Number.isSafeInteger(maxBytes)||maxBytes<1)bad('INVALID_CONFIG');
  this.#auth=authority;this.#storage=storage;this.#clock=clock;this.#max=maxBytes;
 }
 async #check(action,actor,k,a){
  let e;try{e=await this.#auth.check({action,actor,k:structuredClone(k),asset_id:a?.asset_id??null,consent_id:a?.consent_id??null,grant_id:a?.grant_id??null,purpose:a?.purpose??null})}catch{bad('ACCESS_DENIED')}
  if(!e||e.allowed!==true||e.principal!==actor||e.tenant!==k.tenant||e.account!==k.account||e.channel!==k.channel||
   e.peer_id!==k.peer_id||e.binding_revision!==k.binding_revision||e.account_active!==true||
   !Number.isFinite(e.expires_at)||e.expires_at<=this.#clock()||
   ![e.grant_revision,e.consent_revision,e.revocation_epoch,e.custody_epoch].every(Number.isSafeInteger)||
   (action!=='revoke'&&(e.grant_active!==true||e.consent_active!==true)))bad('ACCESS_DENIED');
  return e;
 }
 #find(id,k){
  txt(id,'INVALID_ASSET_ID');const a=this.#assets.get(id);
  if(!a||key(a.k)!==key(k))bad('ASSET_NOT_FOUND_OR_FORBIDDEN');return a;
 }
 #ready(a){if(a.status!=='READY')bad('ASSET_NOT_READY')}
 #metadata(a){return {asset_id:a.asset_id,k:structuredClone(a.k),purpose:a.purpose,mime:a.mime,byte_size:a.byte_size,
  status:a.status,created_at:a.created_at,expires_at:a.expires_at,revoked_at:a.revoked_at,consent_id:a.consent_id,
  grant_id:a.grant_id,derivative_count:a.derivatives.length}}
 async beginUpload({actor,k:input,purpose,declared_mime,byte_size,consent_id,grant_id,idempotency_key}){
  fake(actor,'ACTOR_REQUIRED');fake(consent_id,'CONSENT_REQUIRED');fake(grant_id,'GRANT_REQUIRED');fake(idempotency_key,'IDEMPOTENCY_REQUIRED');
  const k=canonicalK(input);
  if(!['contact_draft','contact_received','private_tool_artifact'].includes(purpose)||declared_mime!=='application/x-yance-synthetic')bad('UNSUPPORTED_MIME');
  if(!Number.isSafeInteger(byte_size)||byte_size<marker.length||byte_size>this.#max)bad('SIZE_LIMIT');
  const attrs={k,purpose,consent_id,grant_id};
  await this.#check('create',actor,k,attrs);
  const idkey=JSON.stringify([actor,key(k),idempotency_key]);
  const sig=hash(JSON.stringify([purpose,declared_mime,byte_size,consent_id,grant_id]));
  const prev=this.#idempo.get(idkey);
  if(prev){if(prev.sig!==sig)bad('IDEMPOTENCY_CONFLICT');const a=this.#sessions.get(prev.sid)?.a;if(!a||a.status==='REVOKED')bad('ASSET_NOT_READY');return {session_id:prev.sid,asset_id:a.asset_id,status:a.status,expires_at:a.expires_at}}
  const a={...attrs,asset_id:randomUUID(),mime:declared_mime,byte_size,status:'RESERVED',created_at:this.#clock(),expires_at:this.#clock()+60000,revoked_at:null,derivatives:[]};
  const sid=randomUUID();this.#assets.set(a.asset_id,a);this.#sessions.set(sid,{a,actor});this.#idempo.set(idkey,{sid,sig});
  return {session_id:sid,asset_id:a.asset_id,status:a.status,expires_at:a.expires_at};
 }
 async completeUpload({actor,k:input,session_id,bytes}){
  fake(actor,'ACTOR_REQUIRED');const k=canonicalK(input),s=this.#sessions.get(session_id);
  if(!s||s.actor!==actor||key(s.a.k)!==key(k))bad('ASSET_NOT_FOUND_OR_FORBIDDEN');
  const a=s.a;
  if(a.status==='READY'){await this.#check('upload',actor,k,a);return this.#metadata(a)}
  if(a.status!=='RESERVED'||a.expires_at<=this.#clock())bad('UPLOAD_EXPIRED');
  if(!Buffer.isBuffer(bytes)||bytes.length!==a.byte_size)bad('SIZE_MISMATCH');
  if(!bytes.subarray(0,marker.length).equals(marker))bad('SYNTHETIC_BYTES_ONLY');
  const before=await this.#check('upload',actor,k,a),after=await this.#check('upload',actor,k,a);
  if(stamp(before)!==stamp(after)||a.status!=='RESERVED')bad('AUTH_REVISION_CHANGED');
  this.#storage.put(a.asset_id,bytes);a.status='READY';return this.#metadata(a);
 }
 async getMetadata({actor,k:input,asset_id}){
  fake(actor,'ACTOR_REQUIRED');const k=canonicalK(input),a=this.#find(asset_id,k);
  await this.#check('read',actor,k,a);this.#ready(a);return this.#metadata(a);
 }
 async issueReadCapability({actor,k:input,asset_id,ttl_ms=3000}){
  fake(actor,'ACTOR_REQUIRED');const k=canonicalK(input),a=this.#find(asset_id,k);
  if(!Number.isSafeInteger(ttl_ms)||ttl_ms<1||ttl_ms>10000)bad('TTL_INVALID');
  const e=await this.#check('read',actor,k,a);this.#ready(a);
  const token=randomBytes(32).toString('hex'),expires_at=this.#clock()+ttl_ms;
  this.#caps.set(hash(token),{actor,asset_id,ref:key(k),expires_at,stamp:stamp(e)});
  return {read_handle:token,expires_at};
 }
 async readWithCapability({actor,k:input,read_handle}){
  fake(actor,'ACTOR_REQUIRED');txt(read_handle,'CAPABILITY_INVALID');
  const k=canonicalK(input),cap=this.#caps.get(hash(read_handle));this.#caps.delete(hash(read_handle));
  if(!cap||cap.actor!==actor||cap.ref!==key(k)||cap.expires_at<=this.#clock())bad('CAPABILITY_INVALID');
  const a=this.#find(cap.asset_id,k),before=await this.#check('read',actor,k,a);
  this.#ready(a);if(stamp(before)!==cap.stamp)bad('AUTH_REVISION_CHANGED');
  const bytes=this.#storage.get(a.asset_id),after=await this.#check('read',actor,k,a);
  if(stamp(after)!==cap.stamp||a.status!=='READY'){bytes.fill(0);bad('AUTH_REVISION_CHANGED')}
  return bytes;
 }
 async registerDerivative({actor,k:input,asset_id,provider_ref}){
  fake(actor,'ACTOR_REQUIRED');fake(provider_ref,'FAKE_PROVIDER_REF_REQUIRED');
  const k=canonicalK(input),a=this.#find(asset_id,k);await this.#check('derive',actor,k,a);this.#ready(a);
  if(a.derivatives.some(x=>x.provider_ref===provider_ref))bad('DUPLICATE_DERIVATIVE');
  const result={derivative_id:randomUUID(),provider_ref,deletion_status:'NOT_REQUESTED'};
  a.derivatives.push(result);return structuredClone(result);
 }
 async revokeAsset({actor,k:input,asset_id}){
  fake(actor,'ACTOR_REQUIRED');const k=canonicalK(input),a=this.#find(asset_id,k);
  await this.#check('revoke',actor,k,a);
  if(a.status!=='REVOKED'){
   a.status='REVOKED';a.revoked_at=this.#clock();this.#storage.remove(a.asset_id);
   for(const x of a.derivatives)x.deletion_status='EXTERNAL_DELETE_UNCONFIRMED';
   for(const [id,c] of this.#caps)if(c.asset_id===asset_id)this.#caps.delete(id);
  }
  return {asset_id,status:a.status,revoked_at:a.revoked_at,derivatives:a.derivatives.map(x=>({derivative_id:x.derivative_id,deletion_status:x.deletion_status}))};
 }
}

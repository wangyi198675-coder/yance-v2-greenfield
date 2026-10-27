// W23 Issue #77: real browser file attachment bytes, encrypted on local disk.
// No AI media generation, account login, sender, public CDN or self-issued grants.
import { randomBytes, randomUUID, createHash, createHmac, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir, unlink, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export class MediaError extends Error { constructor(code){ super(code); this.code=code; this.name='MediaError'; } }
const die=code=>{throw new MediaError(code)};
const valid=(v,max=160)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\x00-\x1f]/.test(v);
const K_FIELDS=['tenant','account','channel','peer_id','binding_revision'];
const CHANNELS=new Set(['FB_PERSONAL','FB_PAGE','WHATSAPP_PERSONAL','TELEGRAM_PERSONAL']);
const PURPOSES=new Set(['contact_draft','contact_received','private_tool_artifact']);
const stamp=a=>JSON.stringify([a.grant_revision,a.consent_revision,a.revocation_epoch,a.custody_epoch]);
const sha=b=>createHash('sha256').update(b).digest('hex');
const kID=k=>JSON.stringify(K_FIELDS.map(f=>k[f]));
const ACCEPT=Object.freeze({
 'image/png':{ext:'png',max:8*1024*1024,type:'image'},
 'image/jpeg':{ext:'jpg',max:8*1024*1024,type:'image'},
 'image/webp':{ext:'webp',max:8*1024*1024,type:'image'},
 'video/mp4':{ext:'mp4',max:48*1024*1024,type:'video'},
 'video/webm':{ext:'webm',max:48*1024*1024,type:'video'},
 'audio/wav':{ext:'wav',max:16*1024*1024,type:'audio'},
 'audio/mpeg':{ext:'mp3',max:16*1024*1024,type:'audio'},
 'audio/ogg':{ext:'ogg',max:16*1024*1024,type:'audio'}
});
export function mediaCapabilities(){return {attachment_store:'LOCAL_ENCRYPTED_AVAILABLE_WITH_AUTHORITY',media_generation:{
 image:'PROVIDER_NOT_CONFIGURED',video:'PROVIDER_NOT_CONFIGURED',tts:'PROVIDER_NOT_CONFIGURED'},
 accepted:Object.entries(ACCEPT).map(([mime,v])=>({mime,kind:v.type,max_bytes:v.max}))}}
export function mediaK(k){
 if(!k||typeof k!=='object')die('INVALID_K');
 for(const name of K_FIELDS)if(!valid(k[name]))die('INVALID_K');
 if(!CHANNELS.has(k.channel))die('BAD_CHANNEL');
 return Object.fromEntries(K_FIELDS.map(f=>[f,k[f]]));
}
// Container signature + a minimum structure; does NOT claim full decoder, AV or codec verification.
export function sniffMedia(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<12)die('MEDIA_SIGNATURE_INVALID');
 if(bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) &&
   bytes.readUInt32BE(8)===13 && bytes.toString('ascii',12,16)==='IHDR' &&
   bytes.includes(Buffer.from('IEND')))return 'image/png';
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.subarray(-2).equals(Buffer.from([255,217])))return 'image/jpeg';
 if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'&&bytes.readUInt32LE(4)===bytes.length-8)return 'image/webp';
 if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WAVE'&&bytes.readUInt32LE(4)===bytes.length-8 &&
    bytes.includes(Buffer.from('fmt '))&&bytes.includes(Buffer.from('data')))return 'audio/wav';
 if(bytes.toString('ascii',0,4)==='OggS')return 'audio/ogg';
 if(bytes.toString('ascii',0,3)==='ID3'||(bytes[0]===255&&(bytes[1]&0xe0)===0xe0))return 'audio/mpeg';
 if(bytes.subarray(0,4).equals(Buffer.from('1a45dfa3','hex'))&&bytes.includes(Buffer.from('webm')))return 'video/webm';
 if(bytes.toString('ascii',4,8)==='ftyp'&&bytes.readUInt32BE(0)>=16&&bytes.readUInt32BE(0)<=bytes.length){
   let pos=0,moov=false,mdat=false;
   while(pos+8<=bytes.length){
     let len=bytes.readUInt32BE(pos);const type=bytes.toString('ascii',pos+4,pos+8);
     if(len===0)len=bytes.length-pos;
     if(len<8||pos+len>bytes.length)break;
     if(type==='moov')moov=true;
     if(type==='mdat'&&len>8)mdat=true;
     pos+=len;
   }
   if(moov&&mdat)return 'video/mp4';
 }
 die('MEDIA_SIGNATURE_INVALID');
}
const copy=x=>structuredClone(x);
async function removeIfExists(p){try{await unlink(p)}catch(e){if(e.code!=='ENOENT')throw e}}
async function atomicWrite(p,buf){
 const temp=p+'.'+randomUUID()+'.tmp';
 try{await writeFile(temp,buf,{flag:'wx',mode:0o600,flush:true});await rename(temp,p)}
 catch(e){await removeIfExists(temp);throw e}
}
export class PersistentMediaAssets {
 #dir;#blobDir;#key;#auth;#clock;#items=new Map();#idem=new Map();#serial=Promise.resolve();
 constructor({directory,key,authority,clock=()=>Date.now()}={}){
  if(!valid(directory,2048)||!Buffer.isBuffer(key)||key.length!==32||!authority||typeof authority.check!=='function'||typeof clock!=='function')die('PERSISTENT_CONFIG_REQUIRED');
  this.#dir=resolve(directory);this.#blobDir=join(this.#dir,'blobs');this.#key=Buffer.from(key);this.#auth=authority;this.#clock=clock;
 }
 #path(id){if(!/^[a-f0-9-]{36}$/.test(id))die('INVALID_ASSET_ID');return join(this.#blobDir,id+'.gcm')}
 #mutate(fn){
  const result=this.#serial.then(fn);this.#serial=result.catch(()=>{});return result;
 }
 async open(){
  await mkdir(this.#blobDir,{recursive:true,mode:0o700});
  for(const p of [this.#dir,this.#blobDir]){if((await lstat(p)).isSymbolicLink())die('STORAGE_SYMLINK_FORBIDDEN')}
  let obj;
  try{obj=JSON.parse(await readFile(join(this.#dir,'index.json'),'utf8'))}
  catch(e){if(e.code==='ENOENT')obj={version:1,assets:[],idempotency:[]};else die('INDEX_UNAVAILABLE')}
  if(obj.version!==1||!Array.isArray(obj.assets)||!Array.isArray(obj.idempotency))die('INDEX_UNAVAILABLE');
  this.#items=new Map(obj.assets.map(a=>[a.asset_id,a]));this.#idem=new Map(obj.idempotency);
  // Tombstones remain authoritative across restarts; encrypted tombstone blobs are garbage-collected.
  for(const a of this.#items.values())if(a.status==='REVOKED')await removeIfExists(this.#path(a.asset_id));
  return this;
 }
 async #save(){await atomicWrite(join(this.#dir,'index.json'),Buffer.from(JSON.stringify({version:1,assets:[...this.#items.values()],idempotency:[...this.#idem]})))}
 async #check(action,actor,k,a){
  if(!valid(actor))die('ACTOR_REQUIRED');
  let e;
  try{e=await this.#auth.check({action,actor,k:copy(k),asset_id:a?.asset_id??null,
    consent_id:a?.consent_id??null,grant_id:a?.grant_id??null,purpose:a?.purpose??null,message_id:a?.message_id??null})}catch{die('ACCESS_DENIED')}
  if(!e||e.allowed!==true||e.principal!==actor||K_FIELDS.some(f=>e[f]!==k[f])||
    e.account_active!==true||!Number.isFinite(e.expires_at)||e.expires_at<=this.#clock()||
    ![e.grant_revision,e.consent_revision,e.revocation_epoch,e.custody_epoch].every(Number.isSafeInteger)||
    (action!=='delete'&&(e.grant_active!==true||e.consent_active!==true))||
    (a?.message_id!==null&&a?.message_id!==undefined&&(e.message_authorized!==true||e.authorized_message_id!==a.message_id)))
    die('ACCESS_DENIED');
  return e;
 }
 #find(id,k){
  const a=this.#items.get(id);
  if(!a||kID(a.k)!==kID(k))die('ASSET_NOT_FOUND_OR_FORBIDDEN');
  return a;
 }
 #public(a){return {asset_id:a.asset_id,k:copy(a.k),purpose:a.purpose,message_id:a.message_id,
  original_name:a.original_name,mime:a.mime,kind:ACCEPT[a.mime].type,byte_size:a.byte_size,
  sha256:a.sha256,status:a.status,created_at:a.created_at,expires_at:a.expires_at,deleted_at:a.deleted_at,
  // never return disk paths, key material, private ciphertext, or grant token
  }}
 // The current W24/W44 authority, not a client-provided K or local index, owns list eligibility.
 // A cursor is integrity-protected with a derived key and invalid on identity, grant or inventory changes.
 #inventoryFingerprint(k){
  // Only this exact five-part K affects its cursor; unrelated accounts never invalidate it.
  return sha(Buffer.from(JSON.stringify([...this.#items.values()].filter(a=>kID(a.k)===kID(k)).map(a=>
   [a.asset_id,a.status,a.created_at,a.sha256,a.deleted_at]))));
 }
 #cursorMac(bytes){
  const derived=createHmac('sha256',this.#key).update('W23_MEDIA_LIST_CURSOR_KEY_V1').digest();
  return createHmac('sha256',derived).update(bytes).digest();
 }
 #cursorScope(actor,k){return this.#cursorMac(Buffer.from(JSON.stringify([actor,kID(k)]))).toString('base64url')}
 #cursorFilters({kind,mime,query}){return this.#cursorMac(Buffer.from(JSON.stringify([kind,mime,query]))).toString('base64url')}
 #decodeCursor(token){
  if(typeof token!=='string'||token.length>2048||!/^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.test(token))die('CURSOR_INVALID');
  const [body,mac]=token.split('.');
  let bytes,value;
  try{
   bytes=Buffer.from(body,'base64url');
   if(bytes.toString('base64url')!==body)die('CURSOR_INVALID');
   const sig=Buffer.from(mac,'base64url');
   if(sig.length!==32||!timingSafeEqual(this.#cursorMac(bytes),sig))die('CURSOR_INVALID');
   value=JSON.parse(bytes.toString('utf8'));
  }catch{die('CURSOR_INVALID')}
  if(!value||value.v!==1||!Number.isSafeInteger(value.after)||value.after<1||
    !Number.isFinite(value.expires_at)||typeof value.subject!=='string'||
    typeof value.filters!=='string'||typeof value.epoch!=='string'||
    typeof value.inventory!=='string')die('CURSOR_INVALID');
  if(value.expires_at<=this.#clock())die('CURSOR_EXPIRED');
  return value;
 }
 #encodeCursor(value){
  const bytes=Buffer.from(JSON.stringify(value));
  return bytes.toString('base64url')+'.'+this.#cursorMac(bytes).toString('base64url');
 }
 async list({actor,k:rawK,cursor=null,limit=20,kind=null,mime=null,query='' }={}){
  const k=mediaK(rawK);
  if(!Number.isSafeInteger(limit)||limit<1||limit>50)die('BAD_PAGE_LIMIT');
  if(kind!==null&&!['image','video','audio'].includes(kind))die('BAD_FILTER');
  if(mime!==null&&!Object.hasOwn(ACCEPT,mime))die('BAD_FILTER');
  if(kind!==null&&mime!==null&&ACCEPT[mime].type!==kind)die('BAD_FILTER');
  if(typeof query!=='string'||query.length>80||/[\x00-\x1f]/.test(query))die('BAD_FILTER');
  query=query.trim().toLowerCase();
  // Fail closed even when there are zero assets: an empty index is not an entitlement.
  const before=await this.#check('list',actor,k);
  const epoch=stamp(before),inventory=this.#inventoryFingerprint(k);
  const subject=this.#cursorScope(actor,k),filters=this.#cursorFilters({kind,mime,query});
  let offset=0;
  if(cursor!==null){
   const c=this.#decodeCursor(cursor);
   if(c.subject!==subject||c.filters!==filters)die('CURSOR_INVALID');
   if(c.epoch!==epoch)die('AUTH_REVISION_CHANGED');
   if(c.inventory!==inventory)die('LIST_SNAPSHOT_CHANGED');
   offset=c.after;
  }
  const items=[...this.#items.values()].filter(a=>
   a.status==='READY'&&kID(a.k)===kID(k)&&
   (kind===null||ACCEPT[a.mime]?.type===kind)&&
   (mime===null||a.mime===mime)&&
   (!query||a.original_name.toLowerCase().includes(query)||a.mime.includes(query)))
   .sort((a,b)=>b.created_at-a.created_at||b.asset_id.localeCompare(a.asset_id));
  if(offset>items.length)die('LIST_SNAPSHOT_CHANGED');
  const authorized=[];let nextOffset=offset,hasMore=false;
  for(let i=offset;i<items.length;i++){
   const a=items[i];
   let auth;
   try{auth=await this.#check('read',actor,k,a)}
   catch(e){if(e instanceof MediaError&&e.code==='ACCESS_DENIED')continue;throw e}
   if(authorized.length===limit){hasMore=true;break}
   authorized.push({a,epoch:stamp(auth)});nextOffset=i+1;
  }
  // Revalidate every returned asset, plus the scope and inventory, before releasing any metadata.
  const after=await this.#check('list',actor,k);
  if(stamp(after)!==epoch)die('AUTH_REVISION_CHANGED');
  for(const item of authorized){
   const now=await this.#check('read',actor,k,item.a);
   if(stamp(now)!==item.epoch||item.a.status!=='READY')die('AUTH_REVISION_CHANGED');
  }
  if(this.#inventoryFingerprint(k)!==inventory)die('LIST_SNAPSHOT_CHANGED');
  return {
   items:authorized.map(({a})=>({
    asset_id:a.asset_id,purpose:a.purpose,message_id:a.message_id,
    original_name:a.original_name,mime:a.mime,kind:ACCEPT[a.mime].type,
    byte_size:a.byte_size,sha256:a.sha256,created_at:a.created_at,status:'READY'
   })),
   has_more:hasMore,
   next_cursor:hasMore?this.#encodeCursor({v:1,subject,filters,epoch,inventory,
    after:nextOffset,expires_at:this.#clock()+5*60*1000}):null,
   order:'created_at_desc_asset_id_desc'
  };
 }
 async begin({actor,k:rawK,purpose,mime,byte_size,original_name,message_id=null,consent_id,grant_id,idempotency_key}){
  const k=mediaK(rawK);if(!PURPOSES.has(purpose)||!ACCEPT[mime])die('UNSUPPORTED_MEDIA');
  if(!Number.isSafeInteger(byte_size)||byte_size<12||byte_size>ACCEPT[mime].max)die('SIZE_LIMIT');
  if(!valid(original_name,160)||!valid(consent_id)||!valid(grant_id)||!valid(idempotency_key))die('INVALID_METADATA');
  if(message_id!==null&&!valid(message_id))die('INVALID_MESSAGE_ID');
  if(purpose==='contact_received'&&!message_id)die('MESSAGE_REQUIRED');
  if(purpose==='private_tool_artifact'&&message_id)die('MESSAGE_SCOPE_FORBIDDEN');
  const attrs={k,purpose,message_id,consent_id,grant_id};
  await this.#check('create',actor,k,attrs);
  return this.#mutate(async()=>{
   const ik=sha(JSON.stringify([actor,kID(k),idempotency_key]));
   const signature=sha(JSON.stringify([purpose,mime,byte_size,original_name,message_id,consent_id,grant_id]));
   const previous=this.#idem.get(ik);
   if(previous){
    if(previous.signature!==signature)die('IDEMPOTENCY_CONFLICT');
    const a=this.#items.get(previous.asset_id);
    if(!a||a.status==='REVOKED')die('ASSET_GONE');
    return {asset_id:a.asset_id,status:a.status,expires_at:a.expires_at};
   }
   const a={asset_id:randomUUID(),k,purpose,message_id,mime,byte_size,original_name,consent_id,grant_id,
    created_at:this.#clock(),expires_at:this.#clock()+15*60*1000,deleted_at:null,status:'RESERVED',sha256:null};
   this.#items.set(a.asset_id,a);this.#idem.set(ik,{asset_id:a.asset_id,signature});
   await this.#save();return {asset_id:a.asset_id,status:a.status,expires_at:a.expires_at};
  });
 }
 async upload({actor,k:rawK,asset_id,bytes,mime}){
  const k=mediaK(rawK),a=this.#find(asset_id,k);
  if(mime!==undefined&&mime!==a.mime)die('MIME_MISMATCH');
  if(!Buffer.isBuffer(bytes)||bytes.length!==a.byte_size)die('SIZE_MISMATCH');
  if(sniffMedia(bytes)!==a.mime)die('MIME_MISMATCH');
  const before=await this.#check('upload',actor,k,a);
  return this.#mutate(async()=>{
   if(a.status==='READY'){if(a.sha256!==sha(bytes))die('UPLOAD_ALREADY_COMPLETED');return this.#public(a)}
   if(a.status!=='RESERVED'||a.expires_at<=this.#clock())die('UPLOAD_EXPIRED');
   const after=await this.#check('upload',actor,k,a);
   if(stamp(before)!==stamp(after))die('AUTH_REVISION_CHANGED');
   const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.#key,iv);
   cipher.setAAD(Buffer.from(a.asset_id));
   const encoded=Buffer.concat([iv,cipher.update(bytes),cipher.final(),cipher.getAuthTag()]);
   await atomicWrite(this.#path(a.asset_id),encoded);
   a.sha256=sha(bytes);a.status='READY';a.expires_at=null;
   await this.#save();return this.#public(a);
  });
 }
 async metadata({actor,k:rawK,asset_id}){
  const k=mediaK(rawK),a=this.#find(asset_id,k);
  await this.#check('read',actor,k,a);
  if(a.status!=='READY')die('ASSET_NOT_READY');
  return this.#public(a);
 }
 async read({actor,k:rawK,asset_id}){
  const k=mediaK(rawK),a=this.#find(asset_id,k);
  const first=await this.#check('read',actor,k,a);
  if(a.status!=='READY')die('ASSET_NOT_READY');
  let enc;try{enc=await readFile(this.#path(a.asset_id))}catch{die('BLOB_UNAVAILABLE')}
  if(enc.length<29)die('BLOB_AUTH_FAILED');
  let bytes;
  try{const dec=createDecipheriv('aes-256-gcm',this.#key,enc.subarray(0,12));dec.setAAD(Buffer.from(a.asset_id));dec.setAuthTag(enc.subarray(-16));
   bytes=Buffer.concat([dec.update(enc.subarray(12,-16)),dec.final()])}catch{die('BLOB_AUTH_FAILED')}
  const second=await this.#check('read',actor,k,a);
  if(stamp(first)!==stamp(second)||a.status!=='READY'||bytes.length!==a.byte_size||sha(bytes)!==a.sha256){bytes.fill(0);die('AUTH_REVISION_CHANGED')}
  return {metadata:this.#public(a),bytes};
 }
 async delete({actor,k:rawK,asset_id}){
  const k=mediaK(rawK),a=this.#find(asset_id,k);
  await this.#check('delete',actor,k,a);
  return this.#mutate(async()=>{
   if(a.status!=='REVOKED'){a.status='REVOKED';a.deleted_at=this.#clock();await this.#save()}
   await removeIfExists(this.#path(a.asset_id));
   return {asset_id:a.asset_id,status:'REVOKED',deleted_at:a.deleted_at,external_provider_deletion:'NOT_APPLICABLE'};
  });
 }
}

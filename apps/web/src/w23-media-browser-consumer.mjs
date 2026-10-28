// Original W23 binary HTTP consumer; requires W47's actual scoped signed grant port.
// No synthetic K, grant, localStorage cache, browser crypto store or invented listing.
export const W23_K_FIELDS=Object.freeze(['tenant','account','channel','peer_id','binding_revision']);
const mediaPath='/api/v2/media';
const mimeLimits=Object.freeze({'image/png':8*1048576,'image/jpeg':8*1048576,'image/webp':8*1048576,
 'video/mp4':48*1048576,'video/webm':48*1048576,'audio/wav':16*1048576,'audio/mpeg':16*1048576,'audio/ogg':16*1048576});
const denied=(reason)=>{throw Error(reason)};
async function get(fetchImpl,path,options={}){
 const r=await fetchImpl(path,{credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',...options});
 if(!r?.ok)denied('W23_HTTP_'+(r?.status??'UNAVAILABLE'));
 return r;
}
export async function mediaCapabilitiesRead(fetchImpl=globalThis.fetch){
 const res=await get(fetchImpl,mediaPath+'/capabilities');
 const data=await res.json();
 if(data?.attachment_store!=='LOCAL_ENCRYPTED_AVAILABLE_WITH_AUTHORITY'||
  !Array.isArray(data.accepted)||data.accepted.length!==8||
  !data.accepted.every(x=>mimeLimits[x.mime]===x.max_bytes&&['image','video','audio'].includes(x.kind)))
  denied('W23_CAPABILITIES_NOT_VERIFIED');
 return data;
}
export function verifyMediaAuthority(scope){
 if(!scope||scope.source!=='W47_SIGNED_W23_MEDIA_AUTHORITY'||scope.authoritative!==true||
  scope.canSend!==false||typeof scope.actor!=='string'||
  !scope.k||W23_K_FIELDS.some(x=>typeof scope.k[x]!=='string'||!scope.k[x])||
  !['FB_PERSONAL','FB_PAGE','WHATSAPP_PERSONAL','TELEGRAM_PERSONAL'].includes(scope.k.channel)||
  typeof scope.grant_id!=='string'||!scope.grant_id||
  typeof scope.consent_id!=='string'||!scope.consent_id||
  typeof scope.csrf!=='string'||!/^[0-9a-f]{64}$/.test(scope.csrf)||
  !Number.isFinite(scope.expires_at)||scope.expires_at<=Date.now())
  denied('W23_VERIFIED_CONTACT_SCOPE_REQUIRED');
 return scope;
}
export function isAcceptedFile(file){
 return typeof File!=='undefined'&&file instanceof File&&
  Object.hasOwn(mimeLimits,file.type)&&file.size>=12&&file.size<=mimeLimits[file.type];
}
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const sameAsset=(x,id)=>x&&x.asset_id===id&&x.status==='READY'&&
 typeof x.original_name==='string'&&Object.hasOwn(mimeLimits,x.mime)&&x.byte_size>0;
export function createW23BrowserMediaClient({fetchImpl=globalThis.fetch,scopePort}={}){
 if(typeof fetchImpl!=='function'||typeof scopePort?.currentScope!=='function')denied('W47_W23_SCOPE_PORT_REQUIRED');
 const current=async()=>verifyMediaAuthority(await scopePort.currentScope());
 return {
  async capabilities(){return mediaCapabilitiesRead(fetchImpl)},
  async uploadFile(file,{purpose='contact_draft',message_id=null}={}){
   if(!isAcceptedFile(file))denied('W23_UNSUPPORTED_MEDIA_FILE');
   if(!['contact_draft','contact_received','private_tool_artifact'].includes(purpose))denied('W23_PURPOSE_INVALID');
   const scope=await current();
   const requestId='w46_'+Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
   const begun=await(await get(fetchImpl,mediaPath+'/upload-sessions',{
    method:'POST',headers:{'content-type':'application/json','x-yance-csrf':scope.csrf},
    body:JSON.stringify({purpose,mime:file.type,byte_size:file.size,original_name:file.name,
      message_id,consent_id:scope.consent_id,grant_id:scope.grant_id,idempotency_key:requestId})
   })).json();
   if(!uuid(begun?.asset_id)||begun.status!=='RESERVED')denied('W23_BEGIN_UNCONFIRMED');
   const fresh=await current();
   if(JSON.stringify(fresh.k)!==JSON.stringify(scope.k)||fresh.actor!==scope.actor||
     fresh.grant_id!==scope.grant_id||fresh.consent_id!==scope.consent_id)
    denied('W23_AUTHORITY_CHANGED');
   // Browser sends the exact File body. Never serialize bytes as name/size metadata.
   const receipt=await(await get(fetchImpl,mediaPath+'/'+begun.asset_id+'/content',{
    method:'PUT',headers:{'content-type':file.type,'x-yance-csrf':fresh.csrf},body:file
   })).json();
   if(!sameAsset(receipt,begun.asset_id)||receipt.mime!==file.type||
      receipt.byte_size!==file.size||receipt.original_name!==file.name)denied('W23_UPLOAD_UNCONFIRMED');
   const checked=await this.metadata(begun.asset_id);
   if(!sameAsset(checked,begun.asset_id)||checked.sha256!==receipt.sha256)denied('W23_UPLOAD_GET_MISMATCH');
   return checked;
  },
  async metadata(id){
   if(!uuid(id))denied('W23_INVALID_ASSET_ID');const scope=await current();
   const x=await(await get(fetchImpl,mediaPath+'/'+id)).json();
   if(!sameAsset(x,id)||W23_K_FIELDS.some(f=>x.k?.[f]!==scope.k[f]))denied('W23_METADATA_UNVERIFIED');
   return x;
  },
  async binary(id){
   const item=await this.metadata(id);
   const response=await get(fetchImpl,mediaPath+'/'+id+'/content');
   const bytes=await response.blob();
   if(bytes.size!==item.byte_size||bytes.type!==item.mime)denied('W23_BINARY_METADATA_MISMATCH');
   return {item,bytes};
  },
  async remove(id){
   if(!uuid(id))denied('W23_INVALID_ASSET_ID');
   const scope=await current();
   const receipt=await(await get(fetchImpl,mediaPath+'/'+id,{
    method:'DELETE',headers:{'x-yance-csrf':scope.csrf}
   })).json();
   if(receipt.asset_id!==id||receipt.status!=='REVOKED')denied('W23_DELETE_UNCONFIRMED');
   // Must confirm the asset is no longer readable, never treat the DELETE body alone as success.
   const follow=await fetchImpl(mediaPath+'/'+id,{credentials:'same-origin',cache:'no-store',redirect:'error'});
   if(![403,404,409,410].includes(follow.status))denied('W23_DELETE_GET_NOT_CONFIRMED');
   return receipt;
  }
 };
}

// W47 thin read-only adapter to ORIGINAL W24 current five-part K and
// ORIGINAL W25 SQLite inbound (no duplicate store or outbound path).
// All three callbacks are injected by signed native W09 owner composition.
// Browser identityKey is only a LOOKUP SELECTOR and NEVER authorizes itself.
const tell=(res,status,value)=>{res.writeHead(status,{
 'content-type':'application/json; charset=utf-8','cache-control':'no-store',
 'x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin',
 'referrer-policy':'no-referrer','vary':'Origin, Sec-Fetch-Site'
});res.end(JSON.stringify(value))};
const deny=(res,status,code)=>tell(res,status,{ok:false,error:code,canSend:false});
const fullK=k=>[k?.tenant,k?.account,k?.channel,k?.peer_id,k?.binding_revision].join('|');
const inboundK=k=>[k?.tenantId,k?.accountId,k?.channel,k?.peerId,k?.bindingRevision].join('|');
const allowedChannel=new Set(['FB_PERSONAL','FB_PAGE','WHATSAPP_PERSONAL','TELEGRAM_PERSONAL']);
const goodK=k=>k&&typeof k==='object'&&
 [k.tenant,k.account,k.peer_id,k.binding_revision].every(x=>
  (typeof x==='string'||typeof x==='number')&&String(x).length>0&&String(x).length<=200&&
  !String(x).includes('|'))&&
 allowedChannel.has(k.channel)&&/^[1-9][0-9]*$/.test(String(k.binding_revision));
const validMessage=(m,k)=>m&&m.k&&inboundK(m.k)===fullK(k)&&
 typeof m.providerMid==='string'&&m.providerMid.length>0&&m.providerMid.length<=250&&
 typeof m.original==='string'&&m.original.length<=64000&&
 ['mautrix-meta','pancake','baileys','tdlib-json'].includes(m.source)&&
 typeof m.id==='string'&&/^[a-f0-9]{64}$/.test(m.id);
export function createNativeMessageReadHttp({
 sessionAuthority,webOrigin,resolveW54Principal=null,
 resolveW24CurrentFullK=null,readW25OriginalInbound=null
}={}){
 if(typeof sessionAuthority?.sessionFor!=='function'||typeof webOrigin!=='string')
  throw Error('ORIGINAL_W47_LOCAL_SESSION_PORT_REQUIRED');
 const callbacks=[resolveW54Principal,resolveW24CurrentFullK,readW25OriginalInbound];
 if(callbacks.some(c=>c!==null&&typeof c!=='function'))throw Error('SIGNED_W24_W25_NATIVE_READ_PORT_INVALID');
 return async(req,res,url)=>{
  if(url.pathname!=='/api/v2/messages')return false;
  if(req.method!=='GET'){deny(res,405,'READ_ONLY_MESSAGES');return true}
  const s=sessionAuthority.sessionFor(req);
  if(s?.record?.kind!=='NATIVE_FIRST_PARTY'){
   deny(res,401,'W54_VERIFIED_LOCAL_SESSION_REQUIRED');return true}
  if(req.headers.origin&&req.headers.origin!==webOrigin){
   deny(res,403,'ORIGIN_NOT_ALLOWED');return true}
  const keys=[...url.searchParams.keys()];
  if(keys.length!==1||keys[0]!=='identityKey'){
   deny(res,422,'W24_FULL_K_REQUIRED');return true}
  const selector=url.searchParams.get('identityKey');
  if(typeof selector!=='string'||selector.length>900||selector.length<8){
   deny(res,422,'W24_FULL_K_INVALID');return true}
  if(callbacks.some(c=>typeof c!=='function')){
   deny(res,503,'W24_W25_NATIVE_READ_PORTS_NOT_CONNECTED');return true}
  let native,k,rows;
  try{
   native=await resolveW54Principal({session:s,operation:'READ_PRIVATE_INBOUND'});
   if(native?.verified!==true||native.source!=='W54_NATIVE_CURRENT_USER'||
      typeof native.principalRef!=='string'||!native.installationRef||
      !Number.isSafeInteger(native.revocationGeneration))
    throw Error('W54_CURRENT_PROFILE_UNVERIFIED');
   // This OWNER callback must call W24 assertCurrent + readConsentEpoch,
   // and prohibit a browser-selected Tenant/Account/Peer without current K.
   k=await resolveW24CurrentFullK({native,session:s,selector});
   if(!goodK(k)||fullK(k)!==selector)throw Error('W24_FULL_K_NOT_CURRENT');
   // W25 reads must independently recheck W24 current identity AND the
   // explicit user's READ_INBOUND consent before decrypting/original content.
   rows=await readW25OriginalInbound({native,session:s,k,max:250});
   if(!Array.isArray(rows)||rows.length>250||
      rows.some(m=>!validMessage(m,k)))throw Error('ORIGINAL_W25_VERIFIED_INBOUND_REQUIRED');
   const active=sessionAuthority.sessionFor(req);
   if(!active||active.id!==s.id||active.record.rev!==s.record.rev){
    deny(res,401,'NATIVE_SESSION_REVOKED_DURING_READ');return true
   }
   const latest=await resolveW54Principal({session:active,operation:'READ_PRIVATE_INBOUND'});
   if(latest?.verified!==true||latest.principalRef!==native.principalRef||
      latest.installationRef!==native.installationRef||
      latest.revocationGeneration!==native.revocationGeneration){
    deny(res,409,'NATIVE_PROFILE_CHANGED_DURING_READ');return true
   }
  }catch{deny(res,503,'W24_W25_PRIVATE_MESSAGES_UNVERIFIED');return true}
  const seen=new Set();
  const result=[];
  for(const m of rows){
   if(seen.has(m.providerMid)){deny(res,409,'DUPLICATE_NATIVE_MID');return true}
   seen.add(m.providerMid);
   result.push({identityKey:selector,mid:m.providerMid,original:m.original,
    direction:'INBOUND',providerSource:m.source,delivery:'NOT_REQUESTED'});
  }
  tell(res,200,{ok:true,authoritative:true,identityKey:selector,messages:result,canSend:false});
  return true;
 };
}

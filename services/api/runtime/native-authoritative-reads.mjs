// W47 is a THIN authenticated query gate for ORIGINAL W24 + platform Owners.
// No synthetic adapter, in-memory contact store, second message DB or sender.
// ALL injected callbacks must come from the W09-sec-reviewed native composition,
// NEVER HTTP JSON, localhost headers, environment paths, mock run results.
const channels=new Set(['FB_PERSONAL','FB_PAGE','WHATSAPP_PERSONAL','TELEGRAM_PERSONAL']);
const respond=(res,status,value)=>{
 res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  'x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin',
  'referrer-policy':'no-referrer','vary':'Origin, Sec-Fetch-Site'});
 res.end(JSON.stringify(value));
};
const deny=(res,code,error)=>{respond(res,code,{ok:false,error,canSend:false})};
function validAccount(x){
 return x&&channels.has(x.channel)&&typeof x.accountRef==='string'&&
 /^[A-Za-z0-9_-]{8,150}$/.test(x.accountRef)&&
 x.authorization==='ONLINE_VERIFIED'&&typeof x.ownerPrincipalRef==='string'&&
 /^[A-Za-z0-9_-]{8,150}$/.test(x.ownerPrincipalRef);
}
function validContact(x,accountRefs){
 return x&&typeof x==='object'&&accountRefs.has(x.accountRef)&&
 channels.has(x.channel)&&typeof x.peerRef==='string'&&
 /^[A-Za-z0-9_.:@+-]{4,200}$/.test(x.peerRef)&&
 Number.isSafeInteger(x.bindingRevision)&&x.bindingRevision>=1&&
 typeof x.displayName==='string'&&x.displayName.length<=180&&
 x.w24CurrentKVerified===true&&x.w24ConsentCurrent===true;
}
export function createNativeOwnerReadHttp({
 sessionAuthority,webOrigin,resolveW54CurrentUser=null,
 readW24AuthorizedAccounts=null,readW24VerifiedContacts=null
}={}){
 if(typeof sessionAuthority?.sessionFor!=='function'||typeof webOrigin!=='string')
  throw Error('W47_ORIGINAL_SESSION_REQUIRED');
 const ports=[resolveW54CurrentUser,readW24AuthorizedAccounts,readW24VerifiedContacts];
 if(ports.some(p=>p!==null&&typeof p!=='function'))throw Error('OWNER_NATIVE_PORT_INVALID');
 return async(req,res,url)=>{
  if(url.pathname!=='/api/v2/contacts')return false;
  if(req.method!=='GET'){deny(res,405,'METHOD_NOT_ALLOWED');return true}
  const s=sessionAuthority.sessionFor(req);
  if(!s||s.record.kind!=='NATIVE_FIRST_PARTY'){deny(res,401,'TRUSTED_LOCAL_SESSION_REQUIRED');return true}
  if(req.headers.origin&&req.headers.origin!==webOrigin){
   deny(res,403,'ORIGIN_NOT_ALLOWED');return true;
  }
  if(!ports.every(p=>typeof p==='function')){
   deny(res,503,'W24_ORIGINAL_NATIVE_CHANNELS_NOT_CONNECTED');return true
  }
  let principal,accounts,contacts;
  try{
   principal=await resolveW54CurrentUser({session:s,operation:'READ_CONTACTS'});
   if(!principal||principal.verified!==true||principal.source!=='W54_NATIVE_CURRENT_USER'||
      typeof principal.principalRef!=='string'||principal.principalRef.length<8)
    throw Error('W54_NOT_VERIFIED');
   accounts=await readW24AuthorizedAccounts({principal,session:s});
   if(!Array.isArray(accounts)||accounts.length>50||
      accounts.some(a=>!validAccount(a)||a.ownerPrincipalRef!==principal.principalRef))
    throw Error('W24_ACCOUNT_SOURCE_INVALID');
   contacts=await readW24VerifiedContacts({principal,session:s,accounts});
   const accountRefs=new Set(accounts.map(x=>x.accountRef));
   if(!Array.isArray(contacts)||contacts.length>10000||
      contacts.some(c=>!validContact(c,accountRefs)))
    throw Error('W24_CONTACT_SOURCE_INVALID');
   // Prevent a revocation / local logout while native SDK is answering.
   const after=sessionAuthority.sessionFor(req);
   if(!after||after.id!==s.id||after.record.rev!==s.record.rev){
    deny(res,401,'LOCAL_SESSION_REVOKED');return true;
   }
   const latest=await resolveW54CurrentUser({session:after,operation:'READ_CONTACTS'});
   if(!latest||latest.verified!==true||
      latest.principalRef!==principal.principalRef||
      latest.installationRef!==principal.installationRef||
      latest.revocationGeneration!==principal.revocationGeneration){
    deny(res,409,'NATIVE_USER_REVOCATION_OR_EPOCH_CHANGED');return true;
   }
  }catch{
   deny(res,503,'NATIVE_W24_CONTACTS_NOT_VERIFIED');return true;
  }
  // W24/Provider Owner must verify K and binding BEFORE populating this list.
  // No raw provider tokens, unread message contents or outbound permission.
  respond(res,200,{ok:true,authoritative:true,
   source:'W24_CURRENT_K_AND_NATIVE_CHANNEL_OWNERS',
   connectedAccountCount:accounts.length,
   contacts:contacts.map(({accountRef,channel,peerRef,bindingRevision,displayName})=>
    ({accountRef,channel,peerRef,bindingRevision,displayName})),
   canSend:false});
  return true;
 };
}

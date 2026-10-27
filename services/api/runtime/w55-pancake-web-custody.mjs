// ORIGINAL W55 WinCred/DPAPI, extended for Pancake multi-Page.
// One bounded encrypted record; no new password manager or message store.
// Page-scoped tokens are never returned to a browser.
const provider='PANCAKE_PAIR';
const denial=code=>{throw Object.assign(new Error(code),{code,status:403})};
const pageId=x=>typeof x==='string'&&/^[0-9]{1,40}$/.test(x);
const token=x=>typeof x==='string'&&x.length>=8&&x.length<=480&&
 !/[\s\u0000-\u001f\u007f]/.test(x);
const json=x=>JSON.stringify(x);
const valid=v=>v&&token(v.userAccessToken)&&v.pages&&
 typeof v.pages==='object'&&!Array.isArray(v.pages)&&
 Object.entries(v.pages).length<=24&&
 Object.entries(v.pages).every(([id,secret])=>pageId(id)&&token(secret));
export function createW55PancakeWebCustody({nativeKeyPort}={}){
 if(['status','store','withPancake','revoke'].some(k=>typeof nativeKeyPort?.[k]!=='function'))
  throw Error('ORIGINAL_W55_NATIVE_KEY_PORT_REQUIRED');
 async function snapshot(){
  const s=await nativeKeyPort.status({provider});
  if(s?.ok!==true||s.provider!==provider||
     !Number.isSafeInteger(s.revision)||s.revision<0)
    denial('W55_PANCAKE_STATUS_UNVERIFIED');
  return s;
 }
 async function secrets(){
  const status=await snapshot();
  if(!status.configured||status.revoked||status.revision<1)
   denial('PANCAKE_ACCOUNT_NOT_CONFIGURED');
  const entry=await nativeKeyPort.withPancake({
   expectedRevision:status.revision},value=>value);
  if(!valid(entry))denial('PANCAKE_VAULT_PAYLOAD_CORRUPT');
  return {status,entry};
 }
 async function store(payload,rev){
  if(!valid(payload)||Buffer.byteLength(json(payload),'utf8')>2000)
   denial('PANCAKE_CREDENTIAL_SIZE_LIMIT');
  const out=await nativeKeyPort.store({
   provider,secret:json(payload),...(rev>0?{expectedRevision:rev}:{})
  });
  if(out?.ok!==true||out.provider!==provider||out.configured!==true||
      !Number.isSafeInteger(out.revision)||out.revision<=rev)
   denial('W55_PANCAKE_STORE_NOT_VERIFIED');
  const after=await snapshot();
  if(after.revision!==out.revision||after.configured!==true)
   denial('W55_PANCAKE_READBACK_NOT_VERIFIED');
  return out.revision;
 }
 async function saveAccount({session,userAccessToken,explicitUserEntry}={}){
  if(!session||!['WEB_LOCAL_PRIVATE','NATIVE_FIRST_PARTY'].includes(session.record?.kind)||
     !token(userAccessToken)||explicitUserEntry!==true)
   denial('PANCAKE_ACCOUNT_USER_INPUT_REQUIRED');
  const prior=await snapshot();
  // Never replace an existing active account silently: this could rebind
  // all previously verified Pages to a different Pancake account.
  if(prior.configured)denial('PANCAKE_ACCOUNT_ALREADY_CONFIGURED');
  if(prior.revoked)denial('PANCAKE_REVOKED_RELINK_REQUIRES_OWNER_REVIEW');
  const rev=await store({userAccessToken,pages:{}},prior.revision);
  return Object.freeze({stored:true,revision:rev,
   source:'W55_OS_PROTECTED_CURRENT_USER',canSend:false});
 }
 async function savePage({session,pageId:id,pagePublicApiToken,explicitUserEntry}={}){
  if(!session||!['WEB_LOCAL_PRIVATE','NATIVE_FIRST_PARTY'].includes(session.record?.kind)||
     !pageId(id)||!token(pagePublicApiToken)||explicitUserEntry!==true)
    denial('PANCAKE_PAGE_USER_INPUT_REQUIRED');
  const {status,entry}=await secrets();
  const next={userAccessToken:entry.userAccessToken,
   pages:{...entry.pages,[id]:pagePublicApiToken}};
  const rev=await store(next,status.revision);
  return Object.freeze({stored:true,revision:rev,pageId:id,
   source:'W55_OS_PROTECTED_CURRENT_USER',canSend:false});
 }
 async function withCredentials(using){
  if(typeof using!=='function')denial('PANCAKE_SERVER_OWNER_ONLY');
  const {status,entry}=await secrets();
  // Internal only: the W47 handler must never serialize this callback's
  // user/Page token object to any HTTP/browser response.
  return using(entry,status.revision);
 }
 async function revokePage({session,pageId:id,explicitUserEntry}={}){
  if(!session||!pageId(id)||explicitUserEntry!==true)
   denial('PANCAKE_REVOKE_EXPLICIT_USER_REQUIRED');
  const {status,entry}=await secrets();
  const pages={...entry.pages};delete pages[id];
  const rev=await store({userAccessToken:entry.userAccessToken,pages},status.revision);
  return Object.freeze({revoked:true,pageId:id,revision:rev,canSend:false});
 }
 return Object.freeze({status:snapshot,saveAccount,savePage,withCredentials,revokePage});
}
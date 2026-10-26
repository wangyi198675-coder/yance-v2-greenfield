// W09 integration-only proposal for W47 owner review. W47 owns the HTTP
// server; W27 owns the official avatar resolver, W24 current Page+Peer proof.
// No auth bypass, alternate social provider, token store or sender.
const fail=(code,status=503)=>Object.assign(new Error(code),{code,status});
const account=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{8,150}$/.test(x);
const peer=x=>typeof x==='string'&&/^[A-Za-z0-9_.:@+-]{4,200}$/.test(x);
const out=(res,status,value)=>{res.writeHead(status,{
 'content-type':'application/json; charset=utf-8',
 'cache-control':'no-store','x-content-type-options':'nosniff',
 'cross-origin-resource-policy':'same-origin',
 'referrer-policy':'no-referrer','vary':'Origin, Sec-Fetch-Site'
});res.end(JSON.stringify(value));};
const validPrincipal=x=>x?.verified===true&&x?.source==='W54_NATIVE_CURRENT_USER'&&
 typeof x.principalRef==='string'&&x.principalRef.length>=8&&
 typeof x.installationRef==='string'&&Number.isSafeInteger(x.revocationGeneration);
const samePrincipal=(a,b)=>a.principalRef===b.principalRef&&a.installationRef===b.installationRef&&
 a.revocationGeneration===b.revocationGeneration;
const samePeer=(a,b)=>a.providerPageId===b.providerPageId&&a.pageScopedPsid===b.pageScopedPsid&&
 a.accountRef===b.accountRef&&a.peerRef===b.peerRef&&a.bindingRevision===b.bindingRevision&&
 a.accountRevocationEpoch===b.accountRevocationEpoch&&a.consentEpoch===b.consentEpoch&&
 a.channelAccountId===b.channelAccountId;
const validW24=(item,{accountRef,peerRef,bindingRevision},principal)=>
 item?.authorized===true&&item.currentKVerified===true&&item.consentCurrent===true&&
 item.channel==='FB_PAGE'&&item.provider==='PANCAKE'&&
 item.ownerPrincipalRef===principal.principalRef&&
 item.accountRef===accountRef&&item.peerRef===peerRef&&
 item.bindingRevision===bindingRevision&&item.bindingRevision>0&&
 item.active===true&&item.accountOnline===true&&
 typeof item.providerPageId==='string'&&/^[0-9]{1,40}$/.test(item.providerPageId)&&
 typeof item.pageScopedPsid==='string'&&/^[0-9]{1,40}$/.test(item.pageScopedPsid)&&
 Number.isSafeInteger(item.accountRevocationEpoch)&&item.accountRevocationEpoch>=0&&
 Number.isSafeInteger(item.consentEpoch)&&item.consentEpoch>=0&&
 typeof item.channelAccountId==='string'&&item.channelAccountId.length>0;

export function createNativeFbPageAvatarHttp({
 sessionAuthority,webOrigin,
 resolveW54CurrentUser=null,resolveW24CurrentPagePeer=null,readW27OfficialAvatar=null
}={}){
 if(typeof sessionAuthority?.sessionFor!=='function'||typeof webOrigin!=='string')
  throw fail('ORIGINAL_W47_SESSION_REQUIRED');
 if([resolveW54CurrentUser,resolveW24CurrentPagePeer,readW27OfficialAvatar]
  .some(x=>x!==null&&typeof x!=='function'))
  throw fail('ORIGINAL_OWNER_AVATAR_PORT_INVALID');
 return async(req,res,url)=>{
  if(url.pathname!=='/api/v2/contacts/avatar')return false;
  if(req.method!=='GET'){out(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});return true}
  if(req.headers.origin&&req.headers.origin!==webOrigin){
   out(res,403,{ok:false,error:'ORIGIN_NOT_ALLOWED'});return true;
  }
  const session=sessionAuthority.sessionFor(req);
  if(!session||session.record?.kind!=='NATIVE_FIRST_PARTY'){
   out(res,401,{ok:false,error:'TRUSTED_LOCAL_SESSION_REQUIRED'});return true;
  }
  if(![resolveW54CurrentUser,resolveW24CurrentPagePeer,readW27OfficialAvatar]
   .every(x=>typeof x==='function')){
   out(res,503,{ok:false,error:'ORIGINAL_PAGE_AVATAR_OWNERS_NOT_CONNECTED'});return true;
  }
  const keys=[...url.searchParams.keys()];
  if(keys.length!==3||new Set(keys).size!==3||
     !keys.every(k=>['accountRef','peerRef','bindingRevision'].includes(k))){
   out(res,422,{ok:false,error:'AVATAR_LOCATOR_INVALID'});return true;
  }
  const locator={accountRef:url.searchParams.get('accountRef'),
   peerRef:url.searchParams.get('peerRef'),
   bindingRevision:Number(url.searchParams.get('bindingRevision'))};
  if(!account(locator.accountRef)||!peer(locator.peerRef)||
     !/^[1-9][0-9]{0,9}$/.test(url.searchParams.get('bindingRevision')??'')||
     !Number.isSafeInteger(locator.bindingRevision)){
   out(res,422,{ok:false,error:'AVATAR_LOCATOR_INVALID'});return true;
  }
  try {
   const principal=await resolveW54CurrentUser({session,operation:'READ_FB_PAGE_AVATAR'});
   if(!validPrincipal(principal))throw fail('NATIVE_PRINCIPAL_UNVERIFIED',401);
   const bound=await resolveW24CurrentPagePeer({principal,session,locator});
   if(!validW24(bound,locator,principal))throw fail('W24_PAGE_PEER_NOT_AUTHORIZED',403);
   // The official REST avatar resolver independently performs its own
   // native session + W24 current Peer/revoke rechecks. Never accept a vendor
   // URL, raw Page ID or PSID from browser parameters.
   const avatar=await readW27OfficialAvatar({
    pageId:bound.providerPageId,psid:bound.pageScopedPsid,
    ownerPrincipalRef:principal.principalRef,accountRef:bound.accountRef
   });
   const currentSession=sessionAuthority.sessionFor(req);
   if(!currentSession||currentSession.id!==session.id||
      currentSession.record.rev!==session.record.rev)
    throw fail('NATIVE_SESSION_REVOKED_DURING_AVATAR',409);
   const current=await resolveW54CurrentUser({session:currentSession,operation:'READ_FB_PAGE_AVATAR'});
   if(!validPrincipal(current)||!samePrincipal(principal,current))
    throw fail('NATIVE_PRINCIPAL_CHANGED_DURING_AVATAR',409);
   const fresh=await resolveW24CurrentPagePeer({principal:current,session:currentSession,locator});
   if(!validW24(fresh,locator,current)||!samePeer(bound,fresh))
    throw fail('W24_PAGE_PEER_REVOKED_DURING_AVATAR',409);
   if(avatar?.status==='NO_AVATAR'){
    out(res,200,{ok:true,status:'NO_AVATAR',avatarUrl:null,canSend:false});return true;
   }
   let urlResult;
   try{urlResult=new URL(avatar.avatarUrl);}catch{throw fail('AVATAR_URL_UNVERIFIED',502)}
   if(avatar?.status!=='PRESENT' ||
      urlResult.protocol!=='https:'||urlResult.hostname!=='content.pancake.vn'||
      urlResult.port||urlResult.username||urlResult.password)
    throw fail('AVATAR_URL_UNVERIFIED',502);
   out(res,200,{ok:true,status:'PRESENT',avatarUrl:urlResult.toString(),
    source:'W27_PANCAKE_OFFICIAL_CURRENT_PAGE_PEER',canSend:false});return true;
  }catch(e){
   const status=[401,403,409,422,502].includes(e?.status)?e.status:503;
   out(res,status,{ok:false,error:e?.code||'AUTHENTICATED_AVATAR_READ_FAILED',canSend:false});return true;
  }
 };
}

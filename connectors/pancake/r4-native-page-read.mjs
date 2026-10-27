// W27 R4 compact Chat data port: REAL official Pancake REST, original W24
// current K, optional original W25 acceptHistory. No new protocol, login,
// sender, DB, caching, webhook listener or UI/technical authorization workspace.
// Only W47 first-party server may inject the callbacks. All returned user data
// must be from a current authorized Page-scoped Peer; NO synthetic fallback.

const deny=(code,status=403)=>Object.assign(new Error(code),{code,status});
const required=(fn,name)=>{if(typeof fn!=='function')throw deny('W27_MISSING_'+name,503);return fn;};
const id=(value,name)=>{if(typeof value!=='string'||!/^[0-9]{1,40}$/.test(value))
  throw deny('W27_INVALID_'+name,422);return value;};
const metadata=(items)=>Array.isArray(items)?items.slice(0,20).map(a=>({
  id:typeof a?.id==='string'?a.id:null,
  type:typeof a?.type==='string'?a.type:null,
  size:Number.isSafeInteger(a?.size)&&a.size>=0?a.size:null,
  mimeType:typeof a?.mime_type==='string'?a.mime_type:null
})):[];

function verifiedPage(p){
  if(!p||p.channel!=='FB_PAGE'||p.provider!=='PANCAKE'||
     p.status!=='ACTIVE'||p.verifiedByW24!==true||
     p.verifiedByNativeSession!==true||!p.principalId||
     !p.channelAccountId||!p.accountRef||
     !Number.isSafeInteger(p.bindingRevision)||p.bindingRevision<1||
     !Number.isSafeInteger(p.accountRevocationEpoch)||p.accountRevocationEpoch<0||
     !Number.isSafeInteger(p.consentEpoch)||p.consentEpoch<0)
    throw deny('W27_TRUSTED_PAGE_AUTH_REQUIRED');
  id(p.pancakePageId,'PAGE_ID');id(p.metaPageId,'META_PAGE_ID');
  return Object.freeze({
    principalId:p.principalId,channelAccountId:p.channelAccountId,accountRef:p.accountRef,
    pancakePageId:p.pancakePageId,metaPageId:p.metaPageId,
    bindingRevision:p.bindingRevision,accountRevocationEpoch:p.accountRevocationEpoch,
    consentEpoch:p.consentEpoch
  });
}
const samePage=(a,b)=>Object.keys(a).every(k=>a[k]===b[k]);
function verifiedPeer(value,page,psid){
  if(!value||value.verifiedByW24!==true||value.consentCurrent!==true||
    value.revoked===true||value.channel!=='FB_PAGE'||value.provider!=='PANCAKE'||
    value.principalId!==page.principalId||
    value.channelAccountId!==page.channelAccountId||
    value.accountRef!==page.accountRef||
    value.metaPageId!==page.metaPageId||
    value.pancakePageId!==page.pancakePageId||
    value.pageScopedPsid!==psid||
    value.bindingRevision!==page.bindingRevision||
    value.accountRevocationEpoch!==page.accountRevocationEpoch||
    value.consentEpoch!==page.consentEpoch||
    typeof value.canonicalK!=='string'||!value.canonicalK||
    typeof value.peerRef!=='string'||!value.peerRef||
    typeof value.displayName!=='string'||!value.displayName.trim()||
    value.displayName.length>180) throw deny('W27_CURRENT_W24_PEER_AUTH_REQUIRED');
  return Object.freeze({
    principalId:value.principalId,channelAccountId:value.channelAccountId,
    accountRef:value.accountRef,peerRef:value.peerRef,
    pageScopedPsid:psid,canonicalK:value.canonicalK,
    displayName:value.displayName.trim(),bindingRevision:value.bindingRevision,
    accountRevocationEpoch:value.accountRevocationEpoch,
    consentEpoch:value.consentEpoch
  });
}
const samePeer=(a,b)=>Object.keys(a).every(k=>a[k]===b[k]);
function matchRest(result,page){
  if(result?.status!=='READ_ONLY_PROVIDER_DATA'||
     result.channelAccountId!==page.channelAccountId ||
     result.pageId!==page.metaPageId || result.canSend!==false)
    throw deny('W27_CROSS_ACCOUNT_PROVIDER_DATA_DENIED',403);
}
function clamp(v,name,min,max){
  if(!Number.isSafeInteger(v)||v<min||v>max)throw deny('W27_INVALID_'+name,422);
  return v;
}
const noSending=()=>false;
export function createPancakeNativeR4ReadPort({
  resolveCurrentW24Page,pancakeRest,resolveCurrentW24Peer,
  readPageAvatar=null,acceptHistoryToW25=null
}={}){
  required(resolveCurrentW24Page,'CURRENT_W24_PAGE');
  required(resolveCurrentW24Peer,'CURRENT_W24_PEER');
  for(const name of ['listPageUsers','listCustomers','listConversations','listMessages'])
    required(pancakeRest?.[name],'OFFICIAL_REST_'+name);
  if(readPageAvatar!==null)required(readPageAvatar,'OFFICIAL_AVATAR');
  if(acceptHistoryToW25!==null)required(acceptHistoryToW25,'W25_HISTORY');

  async function currentPage(){
    return verifiedPage(await resolveCurrentW24Page({
      channel:'FB_PAGE',provider:'PANCAKE',operation:'READ_PROVIDER_DATA'
    }));
  }
  async function recheckPage(before){
    const after=await currentPage();
    if(!samePage(before,after))throw deny('W27_PAGE_REVOKED_OR_REBOUND',409);
    return after;
  }
  async function currentPeer(page,psid){
    return verifiedPeer(await resolveCurrentW24Peer({
      channel:'FB_PAGE',provider:'PANCAKE',principalId:page.principalId,
      channelAccountId:page.channelAccountId,accountRef:page.accountRef,
      metaPageId:page.metaPageId,pancakePageId:page.pancakePageId,
      pageScopedPsid:psid,bindingRevision:page.bindingRevision,
      accountRevocationEpoch:page.accountRevocationEpoch,consentEpoch:page.consentEpoch
    }),page,psid);
  }
  async function recheckPeer(page,before){
    await recheckPage(page);
    const after=await currentPeer(page,before.pageScopedPsid);
    if(!samePeer(before,after))throw deny('W27_PEER_REVOKED_OR_REBOUND',409);
    return after;
  }
  async function accountStatus(){
    let page;
    try{page=await currentPage();}
    catch(e){
      if(e?.code==='W27_TRUSTED_PAGE_AUTH_REQUIRED'){
        return Object.freeze({channel:'FB_PAGE',provider:'PANCAKE',
          state:'WAITING_USER_AUTH',realAccountVerified:false,onlineVerified:false,
          connected:false,canSend:false});
      }
      throw e;
    }
    try{
      const result=await pancakeRest.listPageUsers({pageId:page.pancakePageId});
      if(result?.status!=='READ_ONLY_PROVIDER_DATA'||
         result.channelAccountId!==page.channelAccountId||result.canSend!==false)
        throw deny('W27_CROSS_ACCOUNT_PROVIDER_DATA_DENIED');
      await recheckPage(page);
      // Page API responding with a valid token proves an authenticated REST
      // channel read, NOT Messenger webhook connect_status/Meta ONLINE.
      return Object.freeze({channel:'FB_PAGE',provider:'PANCAKE',
        state:'PAGE_API_CONNECTED_READ_ONLY',realAccountVerified:true,
        onlineVerified:false,connected:false,
        accountRef:page.accountRef,channelAccountId:page.channelAccountId,
        bindingRevision:page.bindingRevision,canSend:false});
    }catch(e){
      if(e?.code==='W27_PAGE_REVOKED_OR_REBOUND')throw e;
      if(e?.code==='W27_CROSS_ACCOUNT_PROVIDER_DATA_DENIED')throw e;
      const authFailed=['PROVIDER_AUTH_EXPIRED_OR_FORBIDDEN',
        'NO_VALID_PROVIDER_TOKEN_LEASE'].includes(e?.code);
      return Object.freeze({channel:'FB_PAGE',provider:'PANCAKE',
        state:authFailed?'WAITING_USER_AUTH':'PROVIDER_UNAVAILABLE',
        reason:e?.code||'PROVIDER_STATUS_UNAVAILABLE',
        realAccountVerified:false,connected:false,onlineVerified:false,canSend:false});
    }
  }
  async function readContacts({since,until,pageNumber=1,pageSize=50}={}){
    clamp(since,'SINCE',0,Number.MAX_SAFE_INTEGER);
    clamp(until,'UNTIL',0,Number.MAX_SAFE_INTEGER);
    if(since>until)throw deny('W27_INVALID_TIME_RANGE',422);
    clamp(pageNumber,'PAGE_NUMBER',1,100000);
    clamp(pageSize,'PAGE_SIZE',1,50);
    const page=await currentPage();
    const result=await pancakeRest.listCustomers({
      pageId:page.pancakePageId,since,until,pageNumber,pageSize
    });
    matchRest(result,page);
    if(!Array.isArray(result.customers)||result.customers.length>pageSize)
      throw deny('W27_PROVIDER_CUSTOMERS_SHAPE_INVALID',502);
    const authorized=[];
    const confirmedPeers=[];
    const encountered=new Set();
    for(const customer of result.customers){
      const psid=customer?.psid;
      if(typeof psid!=='string'||!/^[0-9]{1,40}$/.test(psid)||encountered.has(psid))
        continue;
      encountered.add(psid);
      let peer;
      try{peer=await currentPeer(page,psid);}
      catch(e){if(e.code==='W27_CURRENT_W24_PEER_AUTH_REQUIRED')continue;throw e;}
      confirmedPeers.push(peer);
      // Never use global customer_id to merge Page accounts. Never promote
      // unverified source names or provider can_inbox into send permission.
      authorized.push(Object.freeze({
        channel:'FB_PAGE',source:'W27_OFFICIAL_PANCAKE_W24_PEER',
        accountRef:page.accountRef,peerRef:peer.peerRef,
        bindingRevision:peer.bindingRevision,
        displayName:peer.displayName,
        contactRef:[page.accountRef,'FB_PAGE',peer.peerRef,peer.bindingRevision].join('|'),
        canSend:false
      }));
    }
    // List may have been fetched before a single Peer was revoked. Recheck
    // each W24 authority before exposing any contact to the original W47 UI.
    for(const p of confirmedPeers){
      const matching=await currentPeer(page,p.pageScopedPsid);
      if(!samePeer(p,matching))
        throw deny('W27_PEER_REVOKED_OR_REBOUND',409);
    }
    await recheckPage(page);
    return Object.freeze({
      status:'AUTHORIZED_READ_ONLY',source:'W24_CURRENT_K_AND_OFFICIAL_PANCAKE',
      channel:'FB_PAGE',accountRef:page.accountRef,
      contacts:Object.freeze(authorized),pageNumber,pageSize,
      // Provider total is not the number of current W24-approved peers.
      providerTotal:null,actualApprovedPageContacts:authorized.length,
      canSend:false
    });
  }
  async function readInboxConversations({lastConversationId}={}){
    if(lastConversationId!==undefined)id(lastConversationId,'CURSOR');
    const page=await currentPage();
    const result=await pancakeRest.listConversations({
      pageId:page.pancakePageId,type:'INBOX',lastConversationId
    });
    matchRest(result,page);
    if(!Array.isArray(result.conversations)||result.conversations.length>100)
      throw deny('W27_PROVIDER_CONVERSATIONS_SHAPE_INVALID',502);
    const authorized=[];const confirmedPeers=[];const seen=new Set();
    for(const c of result.conversations){
      // Official Inbox Conversation.id is the Page-scoped customer PSID.
      // COMMENT and LIVESTREAM MUST NOT be treated as private Messenger threads.
      if(c?.type!=='INBOX'||typeof c.id!=='string'||!/^[0-9]{1,40}$/.test(c.id)||
         seen.has(c.id)||(c.page_id && c.page_id!==page.pancakePageId &&
           c.page_id!==page.metaPageId)||(c.from?.id&&c.from.id!==c.id))continue;
      seen.add(c.id);
      let peer;
      try{peer=await currentPeer(page,c.id);}
      catch(e){if(e.code==='W27_CURRENT_W24_PEER_AUTH_REQUIRED')continue;throw e;}
      confirmedPeers.push(peer);
      authorized.push(Object.freeze({
        contactRef:[page.accountRef,'FB_PAGE',peer.peerRef,peer.bindingRevision].join('|'),
        accountRef:peer.accountRef,peerRef:peer.peerRef,
        bindingRevision:peer.bindingRevision,
        conversationId:c.id,
        displayName:peer.displayName,
        snippet:typeof c.snippet==='string'?c.snippet.slice(0,2000):null,
        seen:typeof c.seen==='boolean'?c.seen:null,
        unreadCount:null, // Seen boolean is NOT a quantitative unread count.
        updatedAt:typeof c.updated_at==='string'?c.updated_at:null,
        canSend:false
      }));
    }
    for(const p of confirmedPeers){
      const latest=await currentPeer(page,p.pageScopedPsid);
      if(!samePeer(p,latest))throw deny('W27_PEER_REVOKED_OR_REBOUND',409);
    }
    await recheckPage(page);
    return Object.freeze({status:'AUTHORIZED_READ_ONLY',channel:'FB_PAGE',
      source:'W24_CURRENT_K_AND_OFFICIAL_PANCAKE',
      conversations:Object.freeze(authorized),canSend:false});
  }
  async function readHistory({pageScopedPsid,currentCount=0}={}){
    const psid=id(pageScopedPsid,'PEER_PSID');
    clamp(currentCount,'CURRENT_COUNT',0,1000000);
    const page=await currentPage();
    const peer=await currentPeer(page,psid);
    // Official INBOX thread identifier is exactly its PSID. Never access
    // arbitrary conversation IDs supplied by the browser.
    const result=await pancakeRest.listMessages({
      pageId:page.pancakePageId,conversationId:psid,currentCount
    });
    matchRest(result,page);
    if(result.conversationId!==psid||!Array.isArray(result.messages)||
       result.messages.length>250)
      throw deny('W27_PROVIDER_MESSAGE_SCOPE_INVALID',502);
    const pageSenders=new Set([page.metaPageId,page.pancakePageId]);
    const msgs=[];const seen=new Set();
    for(const message of result.messages){
      const mid=message?.id,from=message?.from?.id;
      if(typeof mid!=='string'||!mid||mid.length>250||seen.has(mid)||
         message.conversation_id!==psid||
         (message.page_id && !pageSenders.has(message.page_id))||
         message.is_removed===true||message.is_hidden===true)continue;
      let direction;
      if(from===psid)direction='INBOUND';
      else if(pageSenders.has(from))direction='OUTBOUND';
      else continue; // Third-party, staff UUID or ambiguous from: not a chat message.
      seen.add(mid);
      const body=typeof message.original_message==='string' ?
        message.original_message : typeof message.message==='string'?message.message:'';
      msgs.push(Object.freeze({
        identityKey:peer.canonicalK,providerMid:mid,verifiedMetaMid:null,
        original:body.slice(0,64000),direction,fromMe:direction==='OUTBOUND',
        source:'PANCAKE_OFFICIAL_PAGE_MESSAGES',
        insertedAt:typeof message.inserted_at==='string'?message.inserted_at:null,
        attachmentMetadata:metadata(message.attachments),
        canSend:false
      }));
    }
    await recheckPeer(page,peer);
    return Object.freeze({status:'AUTHORIZED_READ_ONLY',channel:'FB_PAGE',
      channelAccountId:page.channelAccountId,
      accountRef:page.accountRef,peerRef:peer.peerRef,
      bindingRevision:page.bindingRevision,
      identityKey:peer.canonicalK,conversationId:psid,
      messages:Object.freeze(msgs),canSend:false});
  }
  async function persistHistoryToOriginalW25({pageScopedPsid,currentCount=0}={}){
    if(!acceptHistoryToW25)throw deny('W25_ORIGINAL_ACCEPT_HISTORY_PORT_MISSING',503);
    const current=await readHistory({pageScopedPsid,currentCount});
    // Existing W25 must perform durable MID+K dedupe and its own final authority
    // check. W27 does NOT have a second message DB or a write/send capability.
    const receipt=await acceptHistoryToW25({
      channel:'FB_PAGE',provider:'PANCAKE',accountRef:current.accountRef,
      channelAccountId:current.channelAccountId,
      peerRef:current.peerRef,bindingRevision:current.bindingRevision,
      identityKey:current.identityKey,
      source:'OFFICIAL_PANCAKE_READ_ONLY_HISTORY',
      messages:current.messages
    });
    if(receipt?.accepted!==true||typeof receipt.receiptId!=='string'||!receipt.receiptId)
      throw deny('W25_ORIGINAL_HISTORY_NOT_ACCEPTED',503);
    const page=await currentPage();
    if(page.channelAccountId!==current.channelAccountId||
       page.bindingRevision!==current.bindingRevision)
      throw deny('W27_PAGE_REVOKED_OR_REBOUND',409);
    return Object.freeze({status:'ACCEPTED_BY_ORIGINAL_W25',
      receiptId:receipt.receiptId,canSend:false});
  }
  async function readAvatar({pageScopedPsid}={}){
    if(!readPageAvatar)throw deny('W27_OFFICIAL_AVATAR_PORT_MISSING',503);
    const psid=id(pageScopedPsid,'PEER_PSID');
    const page=await currentPage();
    const peer=await currentPeer(page,psid);
    const r=await readPageAvatar({pageId:page.pancakePageId,psid});
    await recheckPeer(page,peer);
    if(r?.status==='NO_AVATAR')return Object.freeze({status:'NO_AVATAR',
      avatarUrl:null,canSend:false});
    let u;
    try{u=new URL(r?.avatarUrl);}catch{throw deny('W27_AVATAR_URL_NOT_VERIFIED',502);}
    if(r?.status!=='PRESENT'||u.protocol!=='https:'||u.hostname!=='content.pancake.vn'||
       u.username||u.password||u.port)throw deny('W27_AVATAR_URL_NOT_VERIFIED',502);
    return Object.freeze({status:'PRESENT',avatarUrl:u.toString(),
      source:'W27_OFFICIAL_PANCAKE_W24_PAGE_PEER',canSend:false});
  }
  return Object.freeze({
    accountStatus,readContacts,readInboxConversations,readHistory,
    persistHistoryToOriginalW25,readAvatar,
    capabilities:()=>Object.freeze({
      channel:'FB_PAGE',provider:'PANCAKE',standby:'CHATWOOT_CLOUD',
      authentication:'W27_NATIVE_AUTHORIZATION_PORT',
      identity:'W24_CURRENT_K_AND_PEER',history:'ORIGINAL_W25_ONLY',
      nativeRest:'OFFICIAL_PANCAKE_HTTPS_GET',
      avatar:'W27_OFFICIAL_PANCAKE_AVATAR',
      canSend:false,webhookEnabled:false,onlineVerified:false
    })
  });
}

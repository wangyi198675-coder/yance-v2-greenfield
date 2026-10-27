import test from 'node:test';
import assert from 'node:assert/strict';
import {createPancakeNativeR4ReadPort} from './r4-native-page-read.mjs';

const page={
 channel:'FB_PAGE',provider:'PANCAKE',status:'ACTIVE',verifiedByW24:true,
 verifiedByNativeSession:true,principalId:'user-current-1',channelAccountId:'account-page-1',
 accountRef:'providerAccount12',pancakePageId:'12345678',metaPageId:'77665544',
 bindingRevision:3,accountRevocationEpoch:5,consentEpoch:7
};
const peer={
 verifiedByW24:true,consentCurrent:true,revoked:false,channel:'FB_PAGE',
 provider:'PANCAKE',principalId:page.principalId,
 channelAccountId:page.channelAccountId,accountRef:page.accountRef,
 pancakePageId:page.pancakePageId,metaPageId:page.metaPageId,
 pageScopedPsid:'99887766',bindingRevision:page.bindingRevision,
 accountRevocationEpoch:page.accountRevocationEpoch,consentEpoch:page.consentEpoch,
 canonicalK:'W24-SIGNED-CURRENT-K',
 peerRef:'real-peer-identity',displayName:'Verified contact'
};
const base={status:'READ_ONLY_PROVIDER_DATA',channelAccountId:page.channelAccountId,
 pageId:page.metaPageId,canSend:false};
const rawCustomers={...base,customers:[
 {psid:'99887766',name:'Vendor untrusted name',customerId:'global-customer'},
 {psid:'44444444',name:'Unverified foreign contact',customerId:'other-global'}
]};
const rawConversations={...base,conversations:[
 {id:'99887766',page_id:'12345678',type:'INBOX',from:{id:'99887766'},
  snippet:'Last inbound',seen:false,updated_at:'2026-10-27T03:00:00Z'},
 {id:'44444444',type:'INBOX',snippet:'Foreign'},
 {id:'99887766_999',type:'COMMENT',snippet:'public comment'}
]};
const rawMessages={...base,conversationId:'99887766',messages:[
 {id:'p-mid-1',conversation_id:'99887766',page_id:'12345678',
  from:{id:'99887766'},original_message:'hello from real provider',
  message:'<div>rendered HTML</div>',attachments:[
   {id:'att1',type:'IMAGE',size:34,mime_type:'image/png',url:'DO_NOT_RETURN_URL'}
  ]},
 {id:'p-mid-2',conversation_id:'99887766',from:{id:'77665544'},
  original_message:'sent by page'},
 {id:'p-mid-3',conversation_id:'99887766',from:{id:'evil-sender'},
  original_message:'foreign'},
 {id:'p-mid-4',conversation_id:'99887766',from:{id:'99887766'},
  is_removed:true,original_message:'removed'},
 {id:'p-mid-1',conversation_id:'99887766',from:{id:'99887766'},original_message:'dupe'},
 {id:'p-mid-6',conversation_id:'another-thread',from:{id:'99887766'},original_message:'foreign-thread'}
]};
function make(opts={}){
 let pageReads=0,peerReads=0,restCalls=0,avatarCalls=0,w25Calls=0;
 const delivered=[];
 const p=createPancakeNativeR4ReadPort({
  resolveCurrentW24Page:async()=>{
   pageReads++;
   return pageReads>1&&opts.pageAfter!==undefined?opts.pageAfter:
     opts.page===undefined?page:opts.page;
  },
  resolveCurrentW24Peer:async request=>{
   peerReads++;
   if(opts.throwPeer)throw new Error('DATABASE_UNAVAILABLE');
   if(request.pageScopedPsid!=='99887766')return null;
   return peerReads>1&&opts.peerAfter!==undefined?opts.peerAfter:
     opts.peer===undefined?peer:opts.peer;
  },
  pancakeRest:{
   listPageUsers:async request=>{
    restCalls++;
    assert.equal(request.pageId,'12345678');
    if(opts.restError)throw Object.assign(new Error('provider'),{code:'PROVIDER_AUTH_EXPIRED_OR_FORBIDDEN'});
    if(opts.rateLimited)throw Object.assign(new Error('provider'),{code:'PROVIDER_RATE_LIMITED'});
    return opts.pageUsers??{
     status:'READ_ONLY_PROVIDER_DATA',channelAccountId:page.channelAccountId,canSend:false,users:[]
    };
   },
   listCustomers:async request=>{
    restCalls++;
    assert.equal(request.pageId,'12345678');
    assert.equal(request.pageSize<=50,true);
    return opts.customers??rawCustomers;
   },
   listConversations:async request=>{
    restCalls++;
    assert.equal(request.type,'INBOX');
    assert.equal(request.pageId,'12345678');
    return opts.conversations??rawConversations;
   },
   listMessages:async request=>{
    restCalls++;
    assert.equal(request.pageId,'12345678');
    assert.equal(request.conversationId,'99887766');
    return opts.messages??rawMessages;
   }
  },
  readPageAvatar:opts.avatarPortDisabled?null:async request=>{
   avatarCalls++;
   assert.deepEqual(request,{pageId:'12345678',psid:'99887766'});
   return opts.avatar??{status:'PRESENT',avatarUrl:'https://content.pancake.vn/portrait/known'};
  },
  acceptHistoryToW25:opts.historyPortDisabled?null:async obj=>{
   w25Calls++;delivered.push(obj);
   return opts.w25Receipt??{accepted:true,receiptId:'w25-durable-1'};
  }
 });
 return {p,delivered,get pageReads(){return pageReads},
  get peerReads(){return peerReads},get restCalls(){return restCalls},
  get avatarCalls(){return avatarCalls},get w25Calls(){return w25Calls}};
}
const reject=(promise,code)=>assert.rejects(promise,{code});
test('R4 no Page authorization returns WAITING_USER_AUTH and zero synthetic accounts',async()=>{
 const s=make({page:null});const r=await s.p.accountStatus();
 assert.equal(r.state,'WAITING_USER_AUTH');assert.equal(r.onlineVerified,false);
 assert.equal(r.connected,false);assert.equal(r.canSend,false);
 assert.equal(s.restCalls,0);
});
test('R4 Page official HTTP GET verifies API access but NEVER fabricates Messenger ONLINE',async()=>{
 const s=make();const r=await s.p.accountStatus();
 assert.equal(r.state,'PAGE_API_CONNECTED_READ_ONLY');
 assert.equal(r.realAccountVerified,true);assert.equal(r.onlineVerified,false);
 assert.equal(r.canSend,false);assert.equal(r.accountRef,'providerAccount12');
 assert.equal(s.restCalls,1);
});
test('Page bearer rejected returns WAITING_USER_AUTH, not ONLINE',async()=>{
 const s=make({restError:true});const r=await s.p.accountStatus();
 assert.equal(r.state,'WAITING_USER_AUTH');assert.equal(r.reason,'PROVIDER_AUTH_EXPIRED_OR_FORBIDDEN');
});
test('W24 revoked Page state blocks contacts, conversations, history and avatar before vendor call',async()=>{
 const s=make({page:{...page,status:'REVOKED'}});
 await reject(s.p.readContacts({since:1,until:2}),'W27_TRUSTED_PAGE_AUTH_REQUIRED');
 await reject(s.p.readInboxConversations({}),'W27_TRUSTED_PAGE_AUTH_REQUIRED');
 await reject(s.p.readHistory({pageScopedPsid:'99887766'}),'W27_TRUSTED_PAGE_AUTH_REQUIRED');
 await reject(s.p.readAvatar({pageScopedPsid:'99887766'}),'W27_TRUSTED_PAGE_AUTH_REQUIRED');
 assert.equal(s.restCalls,0);assert.equal(s.avatarCalls,0);
});
test('real provider customer list must be W24 peer-matched; excludes foreign/unapproved contacts',async()=>{
 const s=make();const r=await s.p.readContacts({since:100,until:200});
 assert.equal(r.status,'AUTHORIZED_READ_ONLY');assert.equal(r.contacts.length,1);
 assert.equal(r.contacts[0].displayName,'Verified contact');
 assert.equal(r.contacts[0].contactRef,'providerAccount12|FB_PAGE|real-peer-identity|3');
 assert.equal(r.contacts[0].canSend,false);
 assert.equal(r.providerTotal,null);
 assert.ok(!JSON.stringify(r).includes('global-customer'));
 assert.ok(!JSON.stringify(r).includes('Vendor untrusted'));
 assert.ok(!JSON.stringify(r).includes('Unverified foreign'));
});
test('invalid date/time or pageSize rejects before rest call',async()=>{
 const s=make();
 await reject(s.p.readContacts({since:3,until:2}),'W27_INVALID_TIME_RANGE');
 await reject(s.p.readContacts({since:1,until:2,pageSize:500}),'W27_INVALID_PAGE_SIZE');
 assert.equal(s.restCalls,0);
});
test('foreign account REST data is not promoted into trusted W24 contacts',async()=>{
 const s=make({customers:{...rawCustomers,channelAccountId:'foreignAccount'}});
 await reject(s.p.readContacts({since:1,until:2}),'W27_CROSS_ACCOUNT_PROVIDER_DATA_DENIED');
});
test('R4 INBOX conversations only use official PSID thread and current W24 identity',async()=>{
 const s=make();const r=await s.p.readInboxConversations({});
 assert.equal(r.conversations.length,1);
 assert.equal(r.conversations[0].conversationId,'99887766');
 assert.equal(r.conversations[0].snippet,'Last inbound');
 assert.equal(r.conversations[0].seen,false);
 assert.equal(r.conversations[0].unreadCount,null);
 assert.equal(r.conversations[0].canSend,false);
});
test('comment/livestream and cross-account Inbox thread never show in private contacts',async()=>{
 const s=make({conversations:{...rawConversations,conversations:[
 {id:'99887766_101',type:'COMMENT',from:{id:'99887766'}},
 {id:'99887766',page_id:'12345678',type:'LIVESTREAM',from:{id:'99887766'}},
 {id:'99887766',page_id:'malicious',type:'INBOX',from:{id:'99887766'}}
 ]}});
 const r=await s.p.readInboxConversations({});
 assert.equal(r.conversations.length,0);
});
test('verified Page-scope history labels fromMe and source original; never fabricates Meta MID',async()=>{
 const s=make();const r=await s.p.readHistory({pageScopedPsid:'99887766'});
 assert.equal(r.messages.length,2);
 assert.equal(r.messages[0].providerMid,'p-mid-1');
 assert.equal(r.messages[0].original,'hello from real provider');
 assert.equal(r.messages[0].direction,'INBOUND');
 assert.equal(r.messages[0].fromMe,false);
 assert.equal(r.messages[0].verifiedMetaMid,null);
 assert.equal(r.messages[0].attachmentMetadata[0].id,'att1');
 assert.equal(JSON.stringify(r).includes('DO_NOT_RETURN_URL'),false);
 assert.equal(r.messages[1].direction,'OUTBOUND');
 assert.equal(r.messages[1].fromMe,true);
 assert.equal(r.messages[1].identityKey,peer.canonicalK);
});
test('unapproved Peer cannot retrieve history even when valid Pancake token exists',async()=>{
 const s=make({peer:null});
 await reject(s.p.readHistory({pageScopedPsid:'99887766'}),'W27_CURRENT_W24_PEER_AUTH_REQUIRED');
 assert.equal(s.restCalls,0);
});
test('stale peer binding or epoch after remote history read fails closed',async()=>{
 const s=make({peerAfter:{...peer,consentEpoch:8}});
 await reject(s.p.readHistory({pageScopedPsid:'99887766'}),'W27_CURRENT_W24_PEER_AUTH_REQUIRED');
 assert.equal(s.restCalls,1);
});
test('expired/rebound W24 Page after contact read never displays old contacts',async()=>{
 const s=make({pageAfter:{...page,bindingRevision:4}});
 await reject(s.p.readContacts({since:1,until:2}),'W27_PAGE_REVOKED_OR_REBOUND');
});
test('W25 historical persistence delegated only to injected native authority and exact K/MID',async()=>{
 const s=make();const r=await s.p.persistHistoryToOriginalW25({pageScopedPsid:'99887766'});
 assert.equal(r.status,'ACCEPTED_BY_ORIGINAL_W25');
 assert.equal(r.receiptId,'w25-durable-1');assert.equal(r.canSend,false);
 assert.equal(s.w25Calls,1);
 assert.equal(s.delivered[0].identityKey,peer.canonicalK);
 assert.equal(s.delivered[0].messages[0].providerMid,'p-mid-1');
});
test('W25 history persistence missing must not create second database',async()=>{
 const s=make({historyPortDisabled:true});
 await reject(s.p.persistHistoryToOriginalW25({pageScopedPsid:'99887766'}),
  'W25_ORIGINAL_ACCEPT_HISTORY_PORT_MISSING');
 assert.equal(s.restCalls,0);
});
test('W25 declines historical dedupe authority: do not claim successful import',async()=>{
 const s=make({w25Receipt:{accepted:false}});
 await reject(s.p.persistHistoryToOriginalW25({pageScopedPsid:'99887766'}),
  'W25_ORIGINAL_HISTORY_NOT_ACCEPTED');
});
test('official avatar read only after current W24 Page and Peer, with current epoch recheck',async()=>{
 const s=make();const r=await s.p.readAvatar({pageScopedPsid:'99887766'});
 assert.equal(r.status,'PRESENT');
 assert.equal(r.avatarUrl,'https://content.pancake.vn/portrait/known');
 assert.equal(r.canSend,false);assert.equal(s.avatarCalls,1);
});
test('untrusted arbitrary avatar redirect blocked after provider response',async()=>{
 const s=make({avatar:{status:'PRESENT',avatarUrl:'https://malicious.invalid/face.jpg'}});
 await reject(s.p.readAvatar({pageScopedPsid:'99887766'}),'W27_AVATAR_URL_NOT_VERIFIED');
});
test('official NO_AVATAR uses placeholder, no fabricated image URL',async()=>{
 const s=make({avatar:{status:'NO_AVATAR',avatarUrl:null}});
 const r=await s.p.readAvatar({pageScopedPsid:'99887766'});
 assert.equal(r.status,'NO_AVATAR');assert.equal(r.avatarUrl,null);
});
test('if official avatar callback absent route fails closed',async()=>{
 const s=make({avatarPortDisabled:true});
 await reject(s.p.readAvatar({pageScopedPsid:'99887766'}),'W27_OFFICIAL_AVATAR_PORT_MISSING');
});
test('unsupported nonnumeric PSID rejects BEFORE authority or REST',async()=>{
 const s=make();
 await reject(s.p.readHistory({pageScopedPsid:'../../credential'}),'W27_INVALID_PEER_PSID');
 assert.equal(s.pageReads,0);
});
test('W27 R4 read layer never exposes provider sender or grants Chatwoot failover',()=>{
 const s=make();
 const cap=s.p.capabilities();
 assert.equal(cap.history,'ORIGINAL_W25_ONLY');
 assert.equal(cap.canSend,false);
 assert.equal(cap.onlineVerified,false);
 assert.equal(cap.standby,'CHATWOOT_CLOUD');
});

test('contact list refuses stale Peer after provider list, before returning user data',async()=>{
 const s=make({peerAfter:{...peer,revoked:true}});
 await reject(s.p.readContacts({since:1,until:2}),
   'W27_CURRENT_W24_PEER_AUTH_REQUIRED');
});
test('conversation list refuses stale W24 Peer authorization before exposing thread',async()=>{
 const s=make({peerAfter:{...peer,consentEpoch:999}});
 await reject(s.p.readInboxConversations({}),
   'W27_CURRENT_W24_PEER_AUTH_REQUIRED');
});
test('vendor 429 is PROVIDER_UNAVAILABLE, not fictitious need-to-relogin',async()=>{
 const s=make({rateLimited:true});
 const status=await s.p.accountStatus();
 assert.equal(status.state,'PROVIDER_UNAVAILABLE');
 assert.equal(status.reason,'PROVIDER_RATE_LIMITED');
 assert.equal(status.connected,false);
 assert.equal(status.onlineVerified,false);
});

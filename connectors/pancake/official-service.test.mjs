import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPancakeOfficialRest,pancakeAuthorizationSetup
} from './official-rest.mjs';
import { createAuthenticatedReadbackIngress,disabledWebhookState } from './official-inbound.mjs';
import {
  createChatwootCloudReader,chatwootCloudAuthorizationSetup
} from './chatwoot-cloud-readonly.mjs';

const principal={authenticated:true,principalId:'native-user-owner',sessionRevision:2};
const binding={
  status:'ACTIVE',channel:'FB_PAGE',principalId:'native-user-owner',
  channelAccountId:'account-1',metaPageId:'11223344',pancakePageId:'667788',
  bindingRevision:3,accountRevocationEpoch:1,consentEpoch:2
};
const replies=[];
const make=(options={})=>{
  const requests=[],leases=[];
  const fakeFetch=async (url,init)=>{
    requests.push({url:url.toString(), method:init.method,headers:init.headers});
    const r=options.response ?? {conversations:[],messages:[],customers:[],users:[],pages:[]};
    if(options.rejectFetch) throw new Error('network failed URL '+url.toString());
    return {status:options.httpStatus??200,headers:{get:()=>null},text:async()=>JSON.stringify(r)};
  };
  const obj=createPancakeOfficialRest({
    resolveTrustedSession:async()=>options.principal??principal,
    resolveChannelBinding:async()=>options.binding??binding,
    credentialLease:async(args)=>{
      leases.push(args);
      return options.lease??{provider:'PANCAKE',kind:args.tokenKind,
        channelAccountId:'account-1',bindingRevision:3,revocationEpoch:1,
        expiresAtMs:Date.now()+300000,secret:'private-page-token-123'};
    },fetchImpl:fakeFetch
  });
  return {obj,requests,leases};
};
const bad=(p,code)=>assert.rejects(p,{code});
test('Pancake official setup is actionable and no account is fabricated',()=>{
  const x=pancakeAuthorizationSetup();
  assert.equal(x.status,'WAITING_USER_AUTH');
  assert.equal(x.canSend,false);
  assert.equal(x.officialSignin,'https://pages.fm/');
  assert.equal(x.requiredSteps.length>3,true);
});
test('native session missing is rejected BEFORE credential custodian is queried',async()=>{
  const m=make({principal:{authenticated:false}});
  await bad(m.obj.listAuthorizedPages(),'NO_TRUSTED_NATIVE_SESSION');
  assert.equal(m.leases.length,0);
});
test('cross-account actor rejection before token access',async()=>{
  const m=make({binding:{...binding,principalId:'other-user'}});
  await bad(m.obj.listConversations({pageId:'667788'}),'CHANNEL_ACCOUNT_UNAUTHORIZED');
  assert.equal(m.leases.length,0);
});
test('cross Page rejects token lease call',async()=>{
  const m=make();
  await bad(m.obj.listMessages({pageId:'other-page',conversationId:'c-1'}),'PAGE_SCOPE_MISMATCH');
  assert.equal(m.leases.length,0);
});
test('Page lease revocation epoch mismatches fail closed',async()=>{
  const m=make({lease:{provider:'PANCAKE',kind:'PAGE',channelAccountId:'account-1',
    bindingRevision:3,revocationEpoch:0,expiresAtMs:Date.now()+300000,secret:'private-page-token-123'}});
  await bad(m.obj.listConversations({pageId:'667788'}),'NO_VALID_PROVIDER_TOKEN_LEASE');
  assert.equal(m.requests.length,0);
});
test('official GET User Pages uses API v1 and query token, not Authorization',async()=>{
  const m=make({response:{pages:[{id:'667788',name:'Page A'}]}});
  const x=await m.obj.listAuthorizedPages();
  assert.equal(x.pages[0].id,'667788'); assert.equal(x.canSend,false);
  assert.equal(m.requests.length,1);
  const u=new URL(m.requests[0].url);
  assert.equal(u.origin,'https://pages.fm');
  assert.equal(u.pathname,'/api/v1/pages');
  assert.equal(u.searchParams.get('access_token'),'private-page-token-123');
  assert.equal(m.requests[0].headers.Authorization,undefined);
  assert.equal(m.leases[0].tokenKind,'USER');
});
test('official GET conversation v2 pagination preserves route and tenant/Page scope',async()=>{
  const m=make({response:{conversations:[{id:'conv-1'}]}});
  const x=await m.obj.listConversations({pageId:'667788',lastConversationId:'conv-page-1'});
  assert.equal(x.conversations[0].id,'conv-1');
  assert.equal(x.channelAccountId,'account-1');
  const u=new URL(m.requests[0].url);
  assert.equal(u.pathname,'/api/public_api/v2/pages/667788/conversations');
  assert.equal(u.searchParams.get('last_conversation_id'),'conv-page-1');
  assert.equal(u.searchParams.get('page_access_token'),'private-page-token-123');
});
test('official GET message v1 does not mint Meta MID or user contact authority',async()=>{
  const m=make({response:{messages:[{id:'m123',message:'hello',
    attachments:[{id:'asset1',type:'IMAGE',size:12,mime_type:'image/png'}]}]}});
  const x=await m.obj.listMessages({pageId:'667788',conversationId:'conv1',currentCount:30});
  assert.equal(x.verifiedMetaMid,null);
  assert.deepEqual(x.attachmentMetadata,[{messageId:'m123',id:'asset1',type:'IMAGE',size:12,mimeType:'image/png'}]);
  const u=new URL(m.requests[0].url);
  assert.equal(u.pathname,'/api/public_api/v1/pages/667788/conversations/conv1/messages');
  assert.equal(u.searchParams.get('current_count'),'30');
});
test('official page customer query explicit date window and metadata preserves PSID as unverified',async()=>{
  const m=make({response:{total:1,customers:[{id:'customer1',psid:'psid-1',customer_id:'global1',name:'Test'}]}});
  const x=await m.obj.listCustomers({pageId:'667788',since:1,until:2});
  assert.equal(x.customers[0].psid,'psid-1');
  assert.equal(x.customers[0].verifiedPagePeer,false);
  const u=new URL(m.requests[0].url);
  assert.equal(u.pathname,'/api/public_api/v1/pages/667788/page_customers');
  assert.equal(u.searchParams.get('since'),'1');
  assert.equal(u.searchParams.get('page_number'),'1');
});
test('bad time range blocked before token is leased',async()=>{
  const m=make();
  await bad(m.obj.listCustomers({pageId:'667788',since:100,until:50}),'INVALID_TIME_RANGE');
  assert.equal(m.leases.length,0);
});
test('HTTP 401 sanitized without token exposure',async()=>{
  const m=make({httpStatus:401});
  await bad(m.obj.listAuthorizedPages(),'PROVIDER_AUTH_EXPIRED_OR_FORBIDDEN');
});
test('HTTP 429 fails without blind retry',async()=>{
  const m=make({httpStatus:429});
  await bad(m.obj.listConversations({pageId:'667788'}),'PROVIDER_RATE_LIMITED');
  assert.equal(m.requests.length,1);
});
test('network error never returns provider URL or token',async()=>{
  const m=make({rejectFetch:true});
  try{await m.obj.listAuthorizedPages();assert.fail('Must throw');}
  catch(e){assert.equal(e.code,'PROVIDER_NETWORK_UNAVAILABLE');
    assert.doesNotMatch(String(e.message),/private-page-token-123/);}
});
test('provider success false rejected, not 200 success',async()=>{
  const m=make({response:{success:false,message_code:'bad'}});
  await bad(m.obj.listConversations({pageId:'667788'}),'PROVIDER_REJECTED');
});
test('no native inbound callbacks = fail closed',()=>{
  assert.throws(()=>createAuthenticatedReadbackIngress({}),{code:'MISSING_W24_PAGE_OWNER'});
  assert.equal(disabledWebhookState().installedPublicListener,false);
});
const event={page_id:'667788',event_type:'messaging',
  data:{message:{id:'m-real1',conversation_id:'conv1',message:'hello',from:{id:'psid1'}}}};
const ingress=({
  readback={
    status:'READ_ONLY_PROVIDER_DATA',channelAccountId:'account-1',pageId:'11223344',
    messages:[{id:'m-real1',conversation_id:'conv1',from:{id:'psid1'},message:'hello',
      attachments:[{id:'attach1',type:'IMAGE'}]}]
  },
  page={verifiedByNativeSession:true,status:'ACTIVE',
    pancakePageId:'667788',metaPageId:'11223344',channelAccountId:'account-1',bindingRevision:3},
  peer={verifiedByNativeIdentity:true,channelAccountId:'account-1',metaPageId:'11223344',
    pageScopedPsid:'psid1',bindingRevision:3,
    accountRevocationEpoch:1,consentEpoch:2,canonicalK:'canonical-w24-K'},
  body=event
}={})=>{
  const pushed=[];
  const a=createAuthenticatedReadbackIngress({
    resolveCurrentPage:async()=>page,resolveCurrentPeer:async()=>peer,
    pancakeRest:{listMessages:async()=>readback},
    deliverToExistingInbound:async data=>{pushed.push(data);return {accepted:true,ingressId:'native-w25-id1'};}
  });
  return {a,pushed,raw:JSON.stringify(body)};
};
test('verified official REST readback + W24 peer + native W25/W45 port can ingest',async()=>{
  const m=ingress();const x=await m.a.acceptWebhook(m.raw);
  assert.equal(x.status,'ACCEPTED_BY_NATIVE_INBOUND');
  assert.equal(x.sent,false); assert.equal(x.verifiedMetaMid,null);
  assert.equal(m.pushed[0].providerMid,'m-real1');
  assert.equal(m.pushed[0].inboundProof,'PAGES_FM_AUTHENTICATED_REST_READBACK');
  assert.equal(m.pushed[0].attachmentMetadata[0].id,'attach1');
});
test('spoofing webhook without official readback cannot reach native ingress',async()=>{
  const m=ingress({readback:{status:'READ_ONLY_PROVIDER_DATA',
    channelAccountId:'account-1',pageId:'11223344',messages:[]}});
  await bad(m.a.acceptWebhook(m.raw),'NO_VERIFIED_PROVIDER_MESSAGE_READBACK');
  assert.equal(m.pushed.length,0);
});
test('readback with PSID mismatch blocked before W25',async()=>{
  const m=ingress({readback:{status:'READ_ONLY_PROVIDER_DATA',
    channelAccountId:'account-1',pageId:'11223344',messages:[
      {id:'m-real1',from:{id:'other-peer'},message:'hello'}]}});
  await bad(m.a.acceptWebhook(m.raw),'PROVIDER_READBACK_PEER_MISMATCH');
  assert.equal(m.pushed.length,0);
});
test('wrong account authenticated REST binding blocked',async()=>{
  const m=ingress({readback:{status:'READ_ONLY_PROVIDER_DATA',
    channelAccountId:'other-account',pageId:'11223344',messages:[]}});
  await bad(m.a.acceptWebhook(m.raw),'CROSS_ACCOUNT_READBACK_DENIED');
});
test('revoked peer and stale revisions rejected',async()=>{
  const m=ingress({peer:{verifiedByNativeIdentity:true,channelAccountId:'account-1',
    metaPageId:'11223344',pageScopedPsid:'psid1',bindingRevision:2,
    accountRevocationEpoch:1,consentEpoch:2,canonicalK:'old'}});
  await bad(m.a.acceptWebhook(m.raw),'NO_TRUSTED_W24_PEER_BINDING');
  assert.equal(m.pushed.length,0);
});
test('provider message body mismatch prevents attacker-initiated fake AI suggestions',async()=>{
  const m=ingress({readback:{status:'READ_ONLY_PROVIDER_DATA',
    channelAccountId:'account-1',pageId:'11223344',
    messages:[{id:'m-real1',from:{id:'psid1'},message:'different'}]}});
  await bad(m.a.acceptWebhook(m.raw),'PROVIDER_READBACK_CONTENT_MISMATCH');
});
test('no durable native W25/W45 ingress refuses to report acceptance',async()=>{
  const m=ingress();
  const a=createAuthenticatedReadbackIngress({
    resolveCurrentPage:async()=>({verifiedByNativeSession:true,status:'ACTIVE',
      pancakePageId:'667788',metaPageId:'11223344',channelAccountId:'account-1',bindingRevision:3}),
    resolveCurrentPeer:async()=>({verifiedByNativeIdentity:true,channelAccountId:'account-1',
      metaPageId:'11223344',pageScopedPsid:'psid1',bindingRevision:3,
      accountRevocationEpoch:1,consentEpoch:2,canonicalK:'some-K'}),
    pancakeRest:{listMessages:async()=>({
      status:'READ_ONLY_PROVIDER_DATA',channelAccountId:'account-1',pageId:'11223344',
      messages:[{id:'m-real1',conversation_id:'conv1',from:{id:'psid1'},message:'hello'}]})},
    deliverToExistingInbound:async()=>({accepted:false})
  });
  await bad(a.acceptWebhook(m.raw),'ORIGINAL_NATIVE_INBOUND_NOT_ACCEPTED');
});
test('Chatwoot official setup is standby only, not generic API channel',()=>{
  const x=chatwootCloudAuthorizationSetup();
  assert.equal(x.automatedSwitch,false);
  assert.equal(x.officialSignin,'https://app.chatwoot.com/');
});
const cloudBinding={channel:'FB_PAGE',status:'ACTIVE',principalId:'native-user-owner',
  metaPageId:'11223344',channelAccountId:'account-1',bindingRevision:3,
  cloudOrigin:'https://app.chatwoot.com',chatwootAccountId:11};
const cloud=(opts={})=>{
  const req=[];
  const reader=createChatwootCloudReader({
    resolveTrustedSession:async()=>opts.principal??principal,
    resolveAuthorizedStandby:async()=>opts.binding??cloudBinding,
    credentialLease:async()=>opts.lease??({
      provider:'CHATWOOT_CLOUD',channelAccountId:'account-1',bindingRevision:3,
      expiresAtMs:Date.now()+60000,secret:'native-cloud-token'}),
    fetchImpl:async(url,init)=>{
      req.push({url:String(url),init});
      return {status:200,text:async()=>JSON.stringify(opts.body??{payload:[]})};
    }
  });
  return {reader,req};
};
test('Chatwoot API GET inboxes filters FB Page vs generic API channel',async()=>{
  const m=cloud({body:{payload:[{id:7,name:'Our FB Page',channel_type:'Channel::FacebookPage'},
    {id:3,name:'generic',channel_type:'Channel::Api'}]}});
  const r=await m.reader.listFacebookInboxes();
  assert.equal(r.inboxes.length,1);
  assert.equal(r.inboxes[0].metaPageBindingVerified,false);
  assert.equal(r.sendEnabled,false);
  assert.equal(new URL(m.req[0].url).hostname,'app.chatwoot.com');
  assert.equal(m.req[0].init.headers.api_access_token,'native-cloud-token');
});
test('Chatwoot wrong Page principal is denied before token',async()=>{
  const m=cloud({binding:{...cloudBinding,principalId:'other'}});
  await bad(m.reader.listFacebookInboxes(),'NO_APPROVED_CHATWOOT_PAGE_BINDING');
  assert.equal(m.req.length,0);
});
test('Chatwoot conversations can read but cannot mark takeover qualified',async()=>{
  const m=cloud({body:{data:{payload:[{id:9,inbox_id:7},{id:10,inbox_id:8}]}}});
  const r=await m.reader.listConversations({inboxId:7});
  assert.equal(r.conversations.length,1);
  assert.equal(r.eligibleToSwitch,false);
  assert.match(m.req[0].url,/inbox_id=7/);
});

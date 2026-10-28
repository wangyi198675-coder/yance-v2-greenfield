import test from 'node:test';
import assert from 'node:assert/strict';
import {createFacebookPageNativeAuthorization,
  createChatwootStandbyAuthorization} from './native-authorization.mjs';

const principal={authenticated:true,principalId:'native-customer-owner',sessionRevision:7};
const tokens={USER:'secure-personal-user-token',PAGE:'secure-personal-page-token',
  APPLICATION:'secure-personal-cloud-token'};
function factory(opts={}) {
  const operations=[], requests=[];
  let binding=opts.initialBinding===undefined?null:opts.initialBinding;
  const latest={
    status:'ACTIVE',principalId:principal.principalId,
    channel:'FB_PAGE',providerPageId:'12345',bindingRevision:2
  };
  const resolver={
    resolveNativeSession:async()=>opts.principal??principal,
    assertNativeUserAction:async proof=>{
      operations.push('gesture:'+proof.action);
      return opts.denyGesture?null:{...proof,verified:true};
    },
    openExternalOfficialLogin:async v=>{
      operations.push('official:'+v.url);
      return opts.openError?{opened:false}:{opened:true};
    },
    beginProtectedTokenEnrollment:async v=>{
      operations.push('protected-entry:'+v.provider);
      return opts.entryUnavailable?{}:{entryAvailable:true};
    },
    readProtectedCredentialStatus:async()=>{
      operations.push('status:W55');
      return opts.credentialStatus??{
        status:'ACTIVE',userTokenActive:true,pageTokenActive:true
      };
    },
    getProtectedTokenLease:async x=>{
      operations.push('lease:'+x.kind);
      return {provider:x.provider,kind:x.kind,principalId:principal.principalId,
        providerPageId:x.providerPageId,expiresAtMs:Date.now()+60_000,
        secret:tokens[x.kind],version:5,enrollmentSource:'EXPLICIT_NATIVE_USER_ENTRY',...opts.leaseOverride};
    },
    readVerifiedW24Binding:async()=>{
      operations.push('read:W24');
      return binding;
    },
    commitVerifiedW24Binding:async x=>{
      operations.push('commit:W24');
      if(opts.commitDenied)return {committed:false};
      binding={...latest,providerPageId:x.providerPageId};
      return {committed:true,providerPageId:x.providerPageId,
        principalId:principal.principalId,bindingRevision:2};
    },
    revokeW24Binding:async x=>{
      operations.push('revoke:W24');
      if(opts.revokeDenied)return {revoked:false};
      binding={...binding,status:'REVOKED'};
      return {revoked:true};
    },
    revokeProtectedCredentials:async x=>{
      operations.push('revoke:W55');
      if(opts.cleanupDenied)throw Error('native vault inaccessible');
      return {revoked:true};
    },
    fetchImpl:async(u, init)=>{
      requests.push({u:String(u),init});
      const p=new URL(u).pathname;
      let body;
      if(p==='/api/v1/pages')body={pages:[{id:'12345',platform:'facebook',name:'Owned'}]};
      else if(p==='/api/public_api/v1/pages/12345/users')body={users:[]};
      else throw Error('unexpected endpoint '+p);
      if(opts.providerRejected)return {status:401,headers:{get:()=>null},text:async()=>''};
      if(opts.providerNetworkError)throw Error('PRIVATE '+String(u));
      return {status:200,headers:{get:()=>null},text:async()=>JSON.stringify(body)};
    }
  };
  return {controller:createFacebookPageNativeAuthorization(resolver),operations,requests,
    get binding(){return binding;}};
}
const reject=(p,code)=>assert.rejects(p,{code});
test('unconfigured returns WAITING_USER_AUTH without credential reads or auto-login',async()=>{
  const x=factory();const r=await x.controller.connectionStatus();
  assert.equal(r.status,'WAITING_USER_AUTH');
  assert.equal(r.connected,false);
  assert.equal(x.requests.length,0);
  assert.equal(x.operations.includes('lease:USER'),false);
});
test('clicked official login opens real Pancake, then W55 protected native enrollment',async()=>{
  const x=factory();const r=await x.controller.beginAuthorization();
  assert.equal(r.status,'WAITING_USER_AUTH');
  assert.equal(r.entryAvailable,true);
  assert.equal(x.operations[0],'gesture:FB_PAGE_CONNECT');
  assert.equal(x.operations[1],'official:https://pages.fm/');
  assert.equal(x.operations[2],'protected-entry:PANCAKE');
});
test('without trusted local principal, even site cannot open',async()=>{
  const x=factory({principal:{authenticated:false}});
  await reject(x.controller.beginAuthorization(),'NO_AUTHENTICATED_NATIVE_SESSION');
  assert.equal(x.operations.length,0);
});
test('self-declared HTML click cannot bypass W54 gesture evidence',async()=>{
  const x=factory({denyGesture:true});
  await reject(x.controller.beginAuthorization(),'UNVERIFIED_NATIVE_USER_ACTION');
  assert.equal(x.operations.some(z=>z.startsWith('official:')),false);
});
test('official browser not opened prevents pretending authorization started',async()=>{
  const x=factory({openError:true});
  await reject(x.controller.beginAuthorization(),'OFFICIAL_LOGIN_NOT_OPENED');
});
test('W55 native protected token entry absence is HOLD not browser plaintext form',async()=>{
  const x=factory({entryUnavailable:true});
  await reject(x.controller.beginAuthorization(),'NATIVE_TOKEN_ENTRY_UNAVAILABLE');
});
test('user click enumerates real provider list from Pancake official API not synthetic Page',async()=>{
  const x=factory();const r=await x.controller.listVerifiedPageChoices();
  assert.equal(r.status,'PAGE_SELECTION_REQUIRED');
  assert.deepEqual(r.pages,[{providerPageId:'12345',name:'Owned',
    platform:'facebook',source:'PANCAKE_OFFICIAL_USER_API'}]);
  assert.equal(new URL(x.requests[0].u).pathname,'/api/v1/pages');
  assert.equal(new URL(x.requests[0].u).searchParams.get('access_token'),tokens.USER);
  assert.equal(r.canSend,false);
});
test('rejects unowned Page before requesting Page token or committing binding',async()=>{
  const x=factory();
  await reject(x.controller.confirmPageBinding({
    selectedProviderPageId:'999999'}),'PAGE_NOT_OWNED_BY_CURRENT_PANCAKE_USER');
  assert.equal(x.operations.includes('commit:W24'),false);
  assert.equal(x.operations.includes('lease:PAGE'),false);
});
test('valid official User and Page token GET then persistent W24 binding with readback',async()=>{
  const x=factory();
  const r=await x.controller.confirmPageBinding({selectedProviderPageId:'12345'});
  assert.equal(r.status,'AUTHORIZED_READ_ONLY');
  assert.equal(r.providerPageId,'12345');
  assert.equal(r.connected,false);
  assert.equal(r.canSend,false);
  assert.equal(x.operations.indexOf('lease:USER')<x.operations.indexOf('lease:PAGE'),true);
  assert.equal(x.operations.includes('commit:W24'),true);
  assert.equal(x.requests.length,2);
  assert.equal(new URL(x.requests[1].u).pathname,
    '/api/public_api/v1/pages/12345/users');
  assert.equal(new URL(x.requests[1].u).searchParams.get('page_access_token'),tokens.PAGE);
});
test('W24 failed commit is never reported as success',async()=>{
  const x=factory({commitDenied:true});
  await reject(x.controller.confirmPageBinding({
    selectedProviderPageId:'12345'}),'W24_BINDING_NOT_COMMITTED');
});
test('vendor 401 is sanitized; no token in exception',async()=>{
  const x=factory({providerRejected:true});
  await reject(x.controller.listVerifiedPageChoices(),'PROVIDER_CREDENTIAL_REJECTED');
});
test('network failures do not leak query tokens in exception',async()=>{
  const x=factory({providerNetworkError:true});
  try{await x.controller.listVerifiedPageChoices();assert.fail('must reject');}
  catch(e){assert.equal(e.code,'PROVIDER_NETWORK_UNAVAILABLE');
    assert.doesNotMatch(e.message,/secure-personal-user-token/);}
});
test('binding status readback requires W55 valid native credentials',async()=>{
  const x=factory({initialBinding:{
    status:'ACTIVE',principalId:principal.principalId,channel:'FB_PAGE',
    providerPageId:'12345',bindingRevision:2
  },credentialStatus:{status:'REVOKED',userTokenActive:false,pageTokenActive:false}});
  const r=await x.controller.connectionStatus({refreshProvider:true});
  assert.equal(r.status,'WAITING_USER_AUTH');
  assert.equal(x.requests.length,0);
});
test('real provider API success is AUTHORIZED_READ_ONLY not fabricated Meta ONLINE',async()=>{
  const x=factory({initialBinding:{
    status:'ACTIVE',principalId:principal.principalId,channel:'FB_PAGE',
    providerPageId:'12345',bindingRevision:2
  }});
  const r=await x.controller.connectionStatus({refreshProvider:true});
  assert.equal(r.status,'AUTHORIZED_READ_ONLY');
  assert.equal(r.providerApiReadback,'PANCAKE_PAGE_API_AUTHENTICATED');
  assert.equal(r.onlineVerified,false);
  assert.equal(r.canSend,false);
});
test('revoke persists W24 first and then clears W55 credentials; no sender calls',async()=>{
  const x=factory({initialBinding:{
    status:'ACTIVE',principalId:principal.principalId,channel:'FB_PAGE',
    providerPageId:'12345',bindingRevision:2
  }});
  const r=await x.controller.revokeAuthorization();
  assert.equal(r.status,'REVOKED');
  assert.equal(x.binding.status,'REVOKED');
  assert.ok(x.operations.indexOf('revoke:W24')<x.operations.indexOf('revoke:W55'));
  assert.equal(x.requests.length,0);
});
test('revocation needs native click approval, blocks server-only trigger',async()=>{
  const x=factory({denyGesture:true,initialBinding:{
    status:'ACTIVE',principalId:principal.principalId,channel:'FB_PAGE',
    providerPageId:'12345',bindingRevision:2
  }});
  await reject(x.controller.revokeAuthorization(),'UNVERIFIED_NATIVE_USER_ACTION');
  assert.equal(x.binding.status,'ACTIVE');
});
test('W55 cleanup failure does not undo W24 revocation or report cleaned',async()=>{
  const x=factory({cleanupDenied:true,initialBinding:{
    status:'ACTIVE',principalId:principal.principalId,channel:'FB_PAGE',
    providerPageId:'12345',bindingRevision:2
  }});
  const r=await x.controller.revokeAuthorization();
  assert.equal(r.status,'REVOKED_CREDENTIAL_CLEANUP_PENDING');
  assert.equal(x.binding.status,'REVOKED');
  assert.equal(r.canSend,false);
});
test('reconnect opens official login again, no historical tokens automatically restored',async()=>{
  const x=factory({initialBinding:{
    status:'REVOKED',principalId:principal.principalId,channel:'FB_PAGE',
    providerPageId:'12345',bindingRevision:2
  }});
  const r=await x.controller.reconnectAuthorization();
  assert.equal(r.reconnectRequiresFreshNativeCredentials,true);
  assert.equal(r.connected,false);
  assert.equal(x.operations.includes('lease:USER'),false);
});
function cloudFactory(opts={}) {
  const calls=[],req=[];
  let standby=opts.binding??null;
  const c=createChatwootStandbyAuthorization({
    resolveNativeSession:async()=>principal,
    assertNativeUserAction:async p=>({...p,verified:true}),
    openExternalOfficialLogin:async p=>{calls.push('open:'+p.url);return {opened:true};},
    beginProtectedTokenEnrollment:async v=>{calls.push('enter:'+v.provider);return {entryAvailable:true};},
    readProtectedCredentialStatus:async()=>({status:'ACTIVE'}),
    getProtectedTokenLease:async x=>({provider:'CHATWOOT_CLOUD',kind:'APPLICATION',
      principalId:principal.principalId,secret:tokens.APPLICATION,
      expiresAtMs:Date.now()+50000,enrollmentSource:'EXPLICIT_NATIVE_USER_ENTRY'}),
    readVerifiedStandbyBinding:async()=>standby,
    commitVerifiedStandbyBinding:async x=>{
      calls.push('commit:standby');
      standby={status:'ACTIVE_STANDBY',principalId:principal.principalId,
        inboxId:x.inboxId,metaPageId:x.expectedMetaPageId,cloudAccountId:x.cloudAccountId};
      return {committed:true,principalId:principal.principalId,
        inboxId:x.inboxId,metaPageId:x.expectedMetaPageId,sendEnabled:false,
        eligibleToSwitch:false};
    },
    revokeStandbyBinding:async()=>{
      calls.push('revoke:W24');standby={...standby,status:'REVOKED'};
      return {revoked:true};
    },
    revokeProtectedCredentials:async()=>{calls.push('revoke:W55');return {revoked:true};},
    fetchImpl:async(url,init)=>{
      req.push({url:String(url),headers:{...init.headers}});
      return {status:200,headers:{get:()=>null},
        text:async()=>JSON.stringify({payload:[
          {id:7,channel_type:'Channel::FacebookPage'},
          {id:5,channel_type:'Channel::Api'}]})};
    }
  });
  return {c,calls,req,get standby(){return standby;}};
}
test('Chatwoot standby login opens official Cloud through native click action',async()=>{
  const m=cloudFactory();const r=await m.c.beginAuthorization();
  assert.equal(r.status,'WAITING_USER_AUTH');
  assert.equal(m.calls[0],'open:https://app.chatwoot.com/');
  assert.equal(m.calls[1],'enter:CHATWOOT_CLOUD');
});
test('Cloud official app token checks Facebook Inbox before W24 standby bind',async()=>{
  const m=cloudFactory();
  const r=await m.c.verifyAndBindStandby({cloudAccountId:2,inboxId:7,
    expectedMetaPageId:'meta-1'});
  assert.equal(r.status,'STANDBY_READ_ONLY');
  assert.equal(r.metaPageRoutingVerified,false);
  assert.equal(r.eligibleToSwitch,false);
  assert.equal(r.canSend,false);
  assert.equal(m.calls.includes('commit:standby'),true);
  assert.equal(new URL(m.req[0].url).pathname,'/api/v1/accounts/2/inboxes');
  assert.equal(m.req[0].headers.api_access_token,tokens.APPLICATION);
});
test('Cloud generic Inbox is not a Facebook Page Inbox and cannot bind',async()=>{
  const m=cloudFactory();
  await reject(m.c.verifyAndBindStandby({cloudAccountId:2,inboxId:5,
    expectedMetaPageId:'meta-1'}),'CHATWOOT_NO_REAL_FACEBOOK_INBOX');
  assert.equal(m.calls.includes('commit:standby'),false);
});
test('Chatwoot standby status never qualifies Messenger switch without Meta routing',async()=>{
  const m=cloudFactory({binding:{
    status:'ACTIVE_STANDBY',principalId:principal.principalId,
    inboxId:'7',metaPageId:'meta-1',cloudAccountId:'2'
  }});
  const r=await m.c.connectionStatus();
  assert.equal(r.status,'STANDBY_READ_ONLY');
  assert.equal(r.eligibleToSwitch,false);assert.equal(r.canSend,false);
});
test('Chatwoot explicit revocation clears W24 authority before W55 secret',async()=>{
  const m=cloudFactory({binding:{
    status:'ACTIVE_STANDBY',principalId:principal.principalId,
    inboxId:'7',metaPageId:'meta-1',cloudAccountId:'2'
  }});
  const r=await m.c.revokeAuthorization();
  assert.equal(r.status,'REVOKED');
  assert.ok(m.calls.indexOf('revoke:W24')<m.calls.indexOf('revoke:W55'));
});

test('uniform W27 action port describes actual native operations and never exports SEND or failover',async()=>{
  const {createW27FacebookPageActionPort}=await import('./native-authorization.mjs');
  const p=factory(),c=cloudFactory();
  const port=createW27FacebookPageActionPort({pancake:p.controller,chatwoot:c.c});
  const x=port.describe();
  assert.equal(x.sender,'W25_ONLY');
  assert.equal(x.canSend,false);
  assert.deepEqual(x.availableActions.PANCAKE,
    ['START','PAGES','BIND','STATUS','REFRESH','REVOKE','RECONNECT']);
  assert.equal((await port.invoke({provider:'PANCAKE',action:'STATUS'})).status,'WAITING_USER_AUTH');
  assert.equal((await port.invoke({provider:'CHATWOOT_CLOUD',action:'START'})).status,'WAITING_USER_AUTH');
  await reject(port.invoke({provider:'PANCAKE',action:'SEND'}),'UNSUPPORTED_CHANNEL_AUTH_ACTION');
  await reject(port.invoke({provider:'CHATWOOT_CLOUD',action:'SWITCH'}),'UNSUPPORTED_CHANNEL_AUTH_ACTION');
});

test('previously removed social token cannot be restored as fresh native authorization',async()=>{
  const x=factory({leaseOverride:{restoredLegacyAccount:true}});
  await reject(x.controller.listVerifiedPageChoices(),'NATIVE_CREDENTIAL_LEASE_UNAVAILABLE');
  assert.equal(x.requests.length,0);
  assert.equal(x.operations.includes('commit:W24'),false);
});
test('credential without current user-entered native provenance is forbidden',async()=>{
  const x=factory({leaseOverride:{enrollmentSource:'LEGACY_OLD_APP'}});
  await reject(x.controller.listVerifiedPageChoices(),'NATIVE_CREDENTIAL_LEASE_UNAVAILABLE');
  assert.equal(x.requests.length,0);
});
test('native secret lease with revoked status cannot authorize official page read',async()=>{
  const x=factory({leaseOverride:{revoked:true}});
  await reject(x.controller.listVerifiedPageChoices(),'NATIVE_CREDENTIAL_LEASE_UNAVAILABLE');
  assert.equal(x.requests.length,0);
});

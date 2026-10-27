// W27 native official-provider authorization coordinator.
// Owns ZERO credentials, sessions, account DBs, web UIs and send operations.
// Every mutating operation requires W47/W54 proof of a real user action;
// W55 must supply protected native credential entry and narrowly scoped token leases.
// Page ownership is verified by real Pancake official HTTPS endpoints BEFORE W24 bind.
// Chatwoot Cloud remains standby only; no W25 send-owner switch here.

export const PANCAKE_ORIGIN = 'https://pages.fm';
export const CHATWOOT_ORIGIN = 'https://app.chatwoot.com';
const MAX_REPLY = 2_000_000;
const fail = (code, status = 403) => Object.assign(new Error(code), {code, status});
const func = (value, name) => {
  if (typeof value !== 'function') throw fail('MISSING_NATIVE_' + name, 503);
  return value;
};
const identifier = (value, name) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value))
    throw fail('INVALID_' + name, 422);
  return value;
};
const asPrincipal = value => {
  if (!value?.authenticated || typeof value.principalId !== 'string' ||
      !value.principalId || !Number.isSafeInteger(value.sessionRevision) ||
      value.sessionRevision < 1) throw fail('NO_AUTHENTICATED_NATIVE_SESSION', 401);
  return value;
};
function checkLease(lease, {provider, kind, principal, pageId}) {
  if (!lease || lease.provider !== provider || lease.kind !== kind ||
      lease.principalId !== principal.principalId ||
      (pageId && lease.providerPageId !== pageId) ||
      !Number.isSafeInteger(lease.expiresAtMs) || lease.expiresAtMs <= Date.now() ||
      lease.enrollmentSource !== 'EXPLICIT_NATIVE_USER_ENTRY' ||
      lease.revoked === true || lease.restoredLegacyAccount === true ||
      typeof lease.secret !== 'string' || lease.secret.length < 8)
    throw fail('NATIVE_CREDENTIAL_LEASE_UNAVAILABLE', 401);
  return lease;
}
async function getJson(fetchImpl, origin, path, token, tokenName) {
  const u = new URL(origin + path);
  if (u.protocol !== 'https:' || u.username || u.password ||
      ![new URL(PANCAKE_ORIGIN).host, new URL(CHATWOOT_ORIGIN).host].includes(u.host))
    throw fail('UNTRUSTED_OFFICIAL_PROVIDER_ORIGIN', 503);
  const headers = {Accept: 'application/json'};
  if (tokenName === 'access_token' || tokenName === 'page_access_token')
    u.searchParams.set(tokenName, token);
  else if (tokenName === 'api_access_token') headers.api_access_token = token;
  else throw fail('INVALID_PROVIDER_AUTH_SCHEME', 503);
  try {
    const response = await fetchImpl(u, {
      method:'GET', headers, redirect:'error', cache:'no-store',
      signal:AbortSignal.timeout(12000)
    });
    if (!response || typeof response.status !== 'number')
      throw fail('INVALID_PROVIDER_RESPONSE', 503);
    if (response.status === 401 || response.status === 403)
      throw fail('PROVIDER_CREDENTIAL_REJECTED',401);
    if (response.status === 429) throw fail('PROVIDER_RATE_LIMIT',429);
    if (response.status !== 200) throw fail('PROVIDER_OFFLINE',503);
    if (Number(response.headers?.get?.('content-length') || '0') > MAX_REPLY)
      throw fail('PROVIDER_PAYLOAD_TOO_LARGE',503);
    const raw = await response.text();
    if (Buffer.byteLength(raw) > MAX_REPLY) throw fail('PROVIDER_PAYLOAD_TOO_LARGE',503);
    let json;
    try { json = JSON.parse(raw); } catch { throw fail('INVALID_PROVIDER_JSON',503); }
    if (!json || typeof json !== 'object' || Array.isArray(json) || json.success === false)
      throw fail('PROVIDER_REJECTED',503);
    return json;
  } catch (e) {
    if (e?.code) throw e;
    // Native HTTP libraries can include access_token query in exception messages.
    throw fail('PROVIDER_NETWORK_UNAVAILABLE',503);
  } finally {
    u.searchParams.delete('access_token');
    u.searchParams.delete('page_access_token');
    delete headers.api_access_token;
  }
}

export function createFacebookPageNativeAuthorization({
  resolveNativeSession,
  assertNativeUserAction,
  openExternalOfficialLogin,
  beginProtectedTokenEnrollment,
  readProtectedCredentialStatus,
  getProtectedTokenLease,
  readVerifiedW24Binding,
  commitVerifiedW24Binding,
  revokeW24Binding,
  revokeProtectedCredentials,
  fetchImpl=globalThis.fetch
}) {
  const deps={resolveNativeSession,assertNativeUserAction,openExternalOfficialLogin,
    beginProtectedTokenEnrollment,readProtectedCredentialStatus,getProtectedTokenLease,
    readVerifiedW24Binding,commitVerifiedW24Binding,revokeW24Binding,
    revokeProtectedCredentials,fetchImpl};
  for (const [key,fn] of Object.entries(deps)) func(fn,key);
  async function nativePrincipal(action, interactive=false) {
    const principal=asPrincipal(await resolveNativeSession());
    if (interactive) {
      const proof=await assertNativeUserAction({principalId:principal.principalId,
        sessionRevision:principal.sessionRevision,action});
      if (!proof || proof.verified !== true ||
          proof.principalId !== principal.principalId ||
          proof.sessionRevision !== principal.sessionRevision || proof.action !== action)
        throw fail('UNVERIFIED_NATIVE_USER_ACTION');
    }
    return principal;
  }
  async function currentBinding(principal) {
    const b=await readVerifiedW24Binding({principalId:principal.principalId,channel:'FB_PAGE'});
    if (!b) return null;
    if (b.principalId !== principal.principalId || b.channel !== 'FB_PAGE')
      throw fail('W24_CROSS_ACCOUNT_AUTHORITY_REJECTED');
    return b;
  }
  async function credential(principal,kind,providerPageId) {
    return checkLease(await getProtectedTokenLease({
      provider:'PANCAKE',kind,principalId:principal.principalId,
      providerPageId:providerPageId??null,sessionRevision:principal.sessionRevision
    }),{provider:'PANCAKE',kind,principal,pageId:providerPageId});
  }
  async function providerPages(principal) {
    const lease=await credential(principal,'USER');
    const result=await getJson(fetchImpl,PANCAKE_ORIGIN,'/api/v1/pages',
      lease.secret,'access_token');
    if (!Array.isArray(result.pages)) throw fail('INVALID_PROVIDER_PAGES',503);
    // Do not promote vendor page id to Meta Page ownership without W24 authoritative review.
    return result.pages.filter(x=>x&&typeof x.id==='string').map(x=>({
      providerPageId:x.id,name:typeof x.name==='string'?x.name:null,
      platform:typeof x.platform==='string'?x.platform:null,
      source:'PANCAKE_OFFICIAL_USER_API'
    }));
  }
  async function verifiedPageToken(principal,pageId) {
    const lease=await credential(principal,'PAGE',pageId);
    const result=await getJson(fetchImpl,PANCAKE_ORIGIN,
      '/api/public_api/v1/pages/'+encodeURIComponent(pageId)+'/users',
      lease.secret,'page_access_token');
    if (!Array.isArray(result.users)) throw fail('INVALID_AUTHORIZED_PAGE_READBACK',503);
    return Object.freeze({providerPageId:pageId,verified:true,source:'PANCAKE_OFFICIAL_PAGE_API',
      // Never return member identities / Page token to caller.
      currentTokenVersion:lease.version??null});
  }
  async function beginAuthorization() {
    const principal=await nativePrincipal('FB_PAGE_CONNECT',true);
    // The real W54/native host opens this only on verified click, not on startup.
    const opened=await openExternalOfficialLogin({
      principalId:principal.principalId,url:PANCAKE_ORIGIN+'/',provider:'PANCAKE'
    });
    if (opened?.opened !== true) throw fail('OFFICIAL_LOGIN_NOT_OPENED',503);
    const enrollment=await beginProtectedTokenEnrollment({
      principalId:principal.principalId,provider:'PANCAKE',
      tokenKinds:['USER','PAGE'],channel:'FB_PAGE',
      afterOfficialUserLogin:true,source:'NATIVE_USER_ACTION'
    });
    if (enrollment?.entryAvailable !== true) throw fail('NATIVE_TOKEN_ENTRY_UNAVAILABLE',503);
    return Object.freeze({status:'WAITING_USER_AUTH',channel:'FB_PAGE',
      provider:'PANCAKE',officialSite:PANCAKE_ORIGIN,credentialInput:'NATIVE_PROTECTED_ONLY',
      nextAction:'USER_AUTHORIZES_PANCAKE_AND_ENTER_OWN_USER_AND_PAGE_TOKEN',
      pageSelection:'REQUIRED_AFTER_OFFICIAL_VERIFICATION',
      entryAvailable:true,connected:false,canSend:false});
  }
  async function listVerifiedPageChoices() {
    const principal=await nativePrincipal('FB_PAGE_SELECT',true);
    const pages=await providerPages(principal);
    // This is an actual authenticated upstream response, not a fixture/binding.
    return Object.freeze({status:'PAGE_SELECTION_REQUIRED',source:'PANCAKE_OFFICIAL_USER_API',
      pages,connected:false,canSend:false});
  }
  async function confirmPageBinding({selectedProviderPageId}) {
    const principal=await nativePrincipal('FB_PAGE_BIND',true);
    const pageId=identifier(selectedProviderPageId,'PANCAKE_PAGE_ID');
    const pages=await providerPages(principal);
    const matched=pages.find(p=>p.providerPageId===pageId);
    if (!matched) throw fail('PAGE_NOT_OWNED_BY_CURRENT_PANCAKE_USER');
    const pageToken=await verifiedPageToken(principal,pageId);
    const previous=await currentBinding(principal);
    // Account/Page tenant, MetaPageId, consent epochs are created/read by existing
    // W24 authority. Do not mint identities in this transport adapter.
    const result=await commitVerifiedW24Binding({
      principalId:principal.principalId,sessionRevision:principal.sessionRevision,
      channel:'FB_PAGE',provider:'PANCAKE',providerPageId:pageId,
      previousBindingRevision:previous?.bindingRevision??null,
      userAction:'FB_PAGE_BIND',providerIdentityProof:{
        pageId,platform:matched.platform,source:matched.source,
        pageTokenValidated:pageToken.verified,provenance:pageToken.source
      },outboundConsent:false,autoReply:false
    });
    if (!result?.committed || !result.bindingRevision ||
        !Number.isSafeInteger(result.bindingRevision) ||
        result.principalId !== principal.principalId ||
        result.providerPageId !== pageId)
      throw fail('W24_BINDING_NOT_COMMITTED',503);
    const readback=await currentBinding(principal);
    if (readback?.status !== 'ACTIVE' ||
        readback.bindingRevision !== result.bindingRevision ||
        readback.providerPageId !== pageId)
      throw fail('W24_BINDING_READBACK_MISMATCH',409);
    return Object.freeze({status:'AUTHORIZED_READ_ONLY',channel:'FB_PAGE',
      provider:'PANCAKE',providerPageId:pageId,
      bindingRevision:readback.bindingRevision,
      identityVerified:true,contactCount:null,connected:false,
      canSend:false,autoReply:false});
  }
  async function connectionStatus({refreshProvider=false}={}) {
    const principal=await nativePrincipal('FB_PAGE_READ');
    const binding=await currentBinding(principal);
    if (!binding) return Object.freeze({status:'WAITING_USER_AUTH',reason:'NO_W24_PAGE_BINDING',
      channel:'FB_PAGE',provider:'PANCAKE',connected:false,canSend:false});
    if (binding.status === 'REVOKED')
      return Object.freeze({status:'REVOKED',reason:'W24_ACCOUNT_REVOKED',
        channel:'FB_PAGE',provider:'PANCAKE',connected:false,canSend:false});
    if (binding.status !== 'ACTIVE'||!binding.providerPageId||
        !Number.isSafeInteger(binding.bindingRevision))
      return Object.freeze({status:'WAITING_USER_AUTH',reason:'NO_ACTIVE_W24_PAGE_BINDING',
        channel:'FB_PAGE',provider:'PANCAKE',connected:false,canSend:false});
    const creds=await readProtectedCredentialStatus({
      provider:'PANCAKE',principalId:principal.principalId,channel:'FB_PAGE',
      providerPageId:binding.providerPageId
    });
    if (creds?.status!=='ACTIVE'||creds.userTokenActive!==true||
        creds.pageTokenActive!==true)
      return Object.freeze({status:'WAITING_USER_AUTH',reason:'NATIVE_CREDENTIALS_MISSING_OR_REVOKED',
        channel:'FB_PAGE',provider:'PANCAKE',connected:false,canSend:false});
    let liveResult='NOT_REQUESTED';
    if (refreshProvider) {
      try { await verifiedPageToken(principal,binding.providerPageId);liveResult='PANCAKE_PAGE_API_AUTHENTICATED'; }
      catch(e) { return Object.freeze({
        status:'WAITING_USER_AUTH',reason:e?.code||'PROVIDER_NOT_VERIFIED',
        channel:'FB_PAGE',provider:'PANCAKE',connected:false,canSend:false
      }); }
      const fresh=await currentBinding(principal);
      if (!fresh||fresh.status!=='ACTIVE'||fresh.bindingRevision!==binding.bindingRevision)
        return Object.freeze({status:'REVOKED_OR_REBOUND',
          channel:'FB_PAGE',provider:'PANCAKE',connected:false,canSend:false});
    }
    // An authenticated REST request alone is NOT a Meta/Pancake connect_status or
    // an independently authenticated Messenger Page ONLINE event.
    return Object.freeze({
      status:'AUTHORIZED_READ_ONLY',channel:'FB_PAGE',provider:'PANCAKE',
      providerPageId:binding.providerPageId,bindingRevision:binding.bindingRevision,
      providerApiReadback:liveResult,connected:false,onlineVerified:false,
      canSend:false,autoReply:false
    });
  }
  async function revokeAuthorization() {
    const principal=await nativePrincipal('FB_PAGE_REVOKE',true);
    const binding=await currentBinding(principal);
    if (!binding || binding.status==='REVOKED')
      return Object.freeze({status:'REVOKED',connected:false,canSend:false});
    const response=await revokeW24Binding({
      principalId:principal.principalId,channel:'FB_PAGE',
      providerPageId:binding.providerPageId,
      expectedBindingRevision:binding.bindingRevision,
      action:'EXPLICIT_USER_REVOKE'
    });
    if (!response?.revoked) throw fail('W24_REVOCATION_NOT_COMMITTED',503);
    const current=await currentBinding(principal);
    if (current?.status!=='REVOKED') throw fail('W24_REVOCATION_READBACK_MISMATCH',503);
    let credentialCleanup='COMPLETE';
    try {
      const result=await revokeProtectedCredentials({
        principalId:principal.principalId,provider:'PANCAKE',
        channel:'FB_PAGE',providerPageId:binding.providerPageId,
        tokenKinds:['USER','PAGE']
      });
      if (result?.revoked!==true) credentialCleanup='REQUIRES_NATIVE_CLEANUP';
    } catch { credentialCleanup='REQUIRES_NATIVE_CLEANUP'; }
    return Object.freeze({status:credentialCleanup==='COMPLETE'?'REVOKED':'REVOKED_CREDENTIAL_CLEANUP_PENDING',
      credentialCleanup,connected:false,canSend:false,autoReply:false});
  }
  async function reconnectAuthorization() {
    // Never automatically rehydrate old tokens, removed Page or previous sessions.
    const result=await beginAuthorization();
    return Object.freeze({...result,reconnectRequiresFreshNativeCredentials:true});
  }
  return Object.freeze({beginAuthorization,listVerifiedPageChoices,confirmPageBinding,
    connectionStatus,revokeAuthorization,reconnectAuthorization});
}

export function createChatwootStandbyAuthorization({
  resolveNativeSession,assertNativeUserAction,openExternalOfficialLogin,
  beginProtectedTokenEnrollment,readProtectedCredentialStatus,
  getProtectedTokenLease,readVerifiedStandbyBinding,
  commitVerifiedStandbyBinding,revokeStandbyBinding,revokeProtectedCredentials,
  fetchImpl=globalThis.fetch
}) {
  const required={resolveNativeSession,assertNativeUserAction,openExternalOfficialLogin,
    beginProtectedTokenEnrollment,readProtectedCredentialStatus,getProtectedTokenLease,
    readVerifiedStandbyBinding,commitVerifiedStandbyBinding,revokeStandbyBinding,
    revokeProtectedCredentials,fetchImpl};
  for (const [n,f] of Object.entries(required)) func(f,n);
  async function session(action,interactive=false) {
    const p=asPrincipal(await resolveNativeSession());
    if(interactive) {
      const proof=await assertNativeUserAction({principalId:p.principalId,
        sessionRevision:p.sessionRevision,action});
      if(proof?.verified!==true||proof.principalId!==p.principalId||
          proof.sessionRevision!==p.sessionRevision||proof.action!==action)
        throw fail('UNVERIFIED_NATIVE_USER_ACTION');
    }
    return p;
  }
  async function binding(p) {
    const b=await readVerifiedStandbyBinding({principalId:p.principalId,provider:'CHATWOOT_CLOUD'});
    if (b && b.principalId !== p.principalId)
      throw fail('CHATWOOT_CROSS_ACCOUNT_BINDING');
    return b;
  }
  async function beginAuthorization() {
    const p=await session('FB_PAGE_CHATWOOT_CONNECT',true);
    const opened=await openExternalOfficialLogin({
      principalId:p.principalId,url:CHATWOOT_ORIGIN+'/',provider:'CHATWOOT_CLOUD'
    });
    if(opened?.opened!==true)throw fail('CHATWOOT_OFFICIAL_LOGIN_NOT_OPENED',503);
    const entry=await beginProtectedTokenEnrollment({
      principalId:p.principalId,provider:'CHATWOOT_CLOUD',tokenKinds:['APPLICATION'],
      channel:'FB_PAGE',afterOfficialUserLogin:true,source:'NATIVE_USER_ACTION'
    });
    if(entry?.entryAvailable!==true)throw fail('CHATWOOT_NATIVE_TOKEN_ENTRY_UNAVAILABLE',503);
    return Object.freeze({status:'WAITING_USER_AUTH',provider:'CHATWOOT_CLOUD',
      standbyOnly:true,officialSite:CHATWOOT_ORIGIN,connected:false,canSend:false});
  }
  async function verifyAndBindStandby({cloudAccountId,inboxId,expectedMetaPageId}) {
    const p=await session('FB_PAGE_CHATWOOT_BIND',true);
    const cloudAccount=identifier(String(cloudAccountId??''),'CHATWOOT_ACCOUNT');
    const inbox=identifier(String(inboxId??''),'CHATWOOT_INBOX');
    const metaPage=identifier(expectedMetaPageId,'META_PAGE');
    const active=await binding(p);
    const lease=checkLease(await getProtectedTokenLease({
      provider:'CHATWOOT_CLOUD',kind:'APPLICATION',principalId:p.principalId,
      cloudAccountId:cloudAccount,sessionRevision:p.sessionRevision
    }),{provider:'CHATWOOT_CLOUD',kind:'APPLICATION',principal:p});
    const r=await getJson(fetchImpl,CHATWOOT_ORIGIN,
      '/api/v1/accounts/'+encodeURIComponent(cloudAccount)+'/inboxes',
      lease.secret,'api_access_token');
    const a=Array.isArray(r.payload)?r.payload:Array.isArray(r)?r:null;
    if(!a)throw fail('CHATWOOT_INVALID_INBOX_DATA',503);
    const found=a.find(x=>String(x?.id)===inbox&&
      String(x.channel_type||'').toLowerCase().includes('facebook'));
    if(!found)throw fail('CHATWOOT_NO_REAL_FACEBOOK_INBOX');
    const result=await commitVerifiedStandbyBinding({
      principalId:p.principalId,provider:'CHATWOOT_CLOUD',
      cloudAccountId:cloudAccount,inboxId:inbox,
      expectedMetaPageId:metaPage,
      previousRevision:active?.bindingRevision??null,
      facebookInboxProof:'CHATWOOT_OFFICIAL_APPLICATION_GET',
      facebookInboxConnectedToMetaPage:false,
      routingVerified:false,eligibleToSwitch:false,sendEnabled:false
    });
    if(!result?.committed||result.principalId!==p.principalId||
       result.inboxId!==inbox||result.metaPageId!==metaPage ||
       result.sendEnabled===true || result.eligibleToSwitch===true)
      throw fail('W24_CHATWOOT_STANDBY_NOT_COMMITTED',503);
    const check=await binding(p);
    if(check?.status!=='ACTIVE_STANDBY'||check.inboxId!==inbox||
       check.metaPageId!==metaPage)
      throw fail('CHATWOOT_STANDBY_READBACK_MISMATCH',409);
    return Object.freeze({status:'STANDBY_READ_ONLY',
      provider:'CHATWOOT_CLOUD',inboxId:inbox,cloudAccountId:cloudAccount,
      metaPageRoutingVerified:false,eligibleToSwitch:false,canSend:false});
  }
  async function connectionStatus() {
    const p=await session('FB_PAGE_CHATWOOT_READ');
    const b=await binding(p);
    if(!b) return Object.freeze({status:'WAITING_USER_AUTH',
      reason:'NO_CHATWOOT_STANDBY_BINDING',connected:false,canSend:false});
    if(b.status==='REVOKED')return Object.freeze({
      status:'REVOKED',connected:false,canSend:false});
    const credential=await readProtectedCredentialStatus({
      provider:'CHATWOOT_CLOUD',principalId:p.principalId,
      cloudAccountId:b.cloudAccountId
    });
    if(b.status!=='ACTIVE_STANDBY'||credential?.status!=='ACTIVE')
      return Object.freeze({status:'WAITING_USER_AUTH',
        reason:'STANDBY_BINDING_OR_CREDENTIAL_INVALID',connected:false,canSend:false});
    return Object.freeze({status:'STANDBY_READ_ONLY',
      provider:'CHATWOOT_CLOUD',inboxId:b.inboxId,
      cloudAccountId:b.cloudAccountId,connected:false,
      metaPageRoutingVerified:false,eligibleToSwitch:false,canSend:false});
  }
  async function revokeAuthorization() {
    const p=await session('FB_PAGE_CHATWOOT_REVOKE',true);
    const b=await binding(p);
    if (!b || b.status==='REVOKED')
      return Object.freeze({status:'REVOKED',connected:false,canSend:false});
    const result=await revokeStandbyBinding({
      principalId:p.principalId,provider:'CHATWOOT_CLOUD',
      cloudAccountId:b.cloudAccountId,expectedRevision:b.bindingRevision
    });
    if(result?.revoked!==true)throw fail('CHATWOOT_REVOKE_FAILED',503);
    const back=await binding(p);
    if(back?.status!=='REVOKED')throw fail('CHATWOOT_REVOKE_READBACK_MISMATCH',503);
    let cleanup='COMPLETE';
    try {
      const r=await revokeProtectedCredentials({
        provider:'CHATWOOT_CLOUD',principalId:p.principalId,
        cloudAccountId:b.cloudAccountId,tokenKinds:['APPLICATION']});
      if (r?.revoked!==true)cleanup='REQUIRES_NATIVE_CLEANUP';
    } catch {cleanup='REQUIRES_NATIVE_CLEANUP';}
    return Object.freeze({status:cleanup==='COMPLETE'?'REVOKED':'REVOKED_CREDENTIAL_CLEANUP_PENDING',
      credentialCleanup:cleanup,connected:false,canSend:false});
  }
  async function reconnectAuthorization() {
    const result=await beginAuthorization();
    return Object.freeze({...result,reconnectRequiresFreshNativeCredentials:true});
  }
  return Object.freeze({beginAuthorization,verifyAndBindStandby,
    connectionStatus,revokeAuthorization,reconnectAuthorization});
}


// This is the complete W27 integration surface for the existing W47 provider
// gateway: it delegates to the real native authorization coordinator; no HTTP
// server, unauthenticated bearer route, extra login, DB or sender is constructed.
// W47 must authenticate native user gesture/session before invoking each action,
// then pass W54 native gesture attestation into assertNativeUserAction.
export function createW27FacebookPageActionPort({pancake,chatwoot}) {
  const p={
    START:()=>pancake.beginAuthorization(),
    PAGES:()=>pancake.listVerifiedPageChoices(),
    BIND:x=>pancake.confirmPageBinding({selectedProviderPageId:x?.selectedProviderPageId}),
    STATUS:()=>pancake.connectionStatus({refreshProvider:false}),
    REFRESH:()=>pancake.connectionStatus({refreshProvider:true}),
    REVOKE:()=>pancake.revokeAuthorization(),
    RECONNECT:()=>pancake.reconnectAuthorization()
  };
  const s={
    START:()=>chatwoot.beginAuthorization(),
    BIND:x=>chatwoot.verifyAndBindStandby({
      cloudAccountId:x?.cloudAccountId,inboxId:x?.inboxId,
      expectedMetaPageId:x?.expectedMetaPageId
    }),
    STATUS:()=>chatwoot.connectionStatus(),
    REVOKE:()=>chatwoot.revokeAuthorization(),
    RECONNECT:()=>chatwoot.reconnectAuthorization()
  };
  for(const x of Object.values({...p,...s}))func(x,'ACTION_PORT');
  return Object.freeze({
    channel:'FB_PAGE',provider:'PANCAKE',standby:'CHATWOOT_CLOUD',
    async invoke({provider,action,args=null}={}) {
      const actions=provider==='PANCAKE'?p:provider==='CHATWOOT_CLOUD'?s:null;
      if(!actions||typeof action!=='string'||!Object.hasOwn(actions,action))
        throw fail('UNSUPPORTED_CHANNEL_AUTH_ACTION',422);
      // Never delegate a generic "send", "reply", "switch", "resume", "reset".
      return actions[action](args);
    },
    describe() {
      return Object.freeze({
        channel:'FB_PAGE',
        primary:'PANCAKE',
        standby:'CHATWOOT_CLOUD',
        availableActions:Object.freeze({
          PANCAKE:Object.keys(p),CHATWOOT_CLOUD:Object.keys(s)
        }),
        authMethod:'OFFICIAL_USER_SIGNIN_AND_W55_NATIVE_PROTECTED_TOKEN',
        bindingAuthority:'W24_VERIFIED_NATIVE_ACCOUNT',
        sender:'W25_ONLY',
        callbackOwner:'W47_EXISTING_PROVIDER_GATEWAY',
        canSend:false
      });
    }
  });
}

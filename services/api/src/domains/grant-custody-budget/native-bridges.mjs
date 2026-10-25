/**
 * W44 adapter contracts for the ACTUAL W24 IdentityConsent and W25 MessageDelivery
 * domain APIs. No mocks installed or real provider calls.
 * All upstream authority ports must be supplied by owning domains.
 */
import {canonicalK} from './index.mjs';
const positive=x=>Number.isSafeInteger(x)&&x>0;
const text=x=>typeof x==='string'&&x.length>0;
const denied=reason=>({allowed:false,reason});

/** W24 assertCurrent is the identity authority; extra consent epoch/RBAC are
 * intentionally mandatory and remain integration dependencies. */
export function createW24IdentityPorts({
  identityService,trustedContext,readConsentEpoch,authorizeOperator,
}={}) {
  if(typeof identityService?.assertCurrent!=='function'||!trustedContext||
    typeof readConsentEpoch!=='function'||typeof authorizeOperator!=='function')
    throw Error('W24_REAL_AUTHORITY_AND_CONSENT_PORTS_REQUIRED');
  return {
    verifyIdentity(k) {
      canonicalK(k);
      const state=identityService.assertCurrent(trustedContext,k);
      const epoch=readConsentEpoch({trustedContext,k,state});
      if(!positive(epoch))throw Error('W24_CONSENT_EPOCH_UNAVAILABLE');
      return {valid:true,binding_revision:state.binding_revision,
        identity_epoch:state.account_revocation_epoch+1,consent_epoch:epoch};
    },
    authorizeMutation({actor,action,identity}) {
      canonicalK(identity);
      identityService.assertCurrent(trustedContext,identity);
      return authorizeOperator({trustedContext,actor,action,identity})===true;
    }
  };
}

/** Plugged into W24 IdentityConsentService({grantAuthority}) via getStore to
 * break construction order. Agent state is always read from authoritative W43. */
export function createW24GrantAuthority({getStore,readAgentState}={}) {
  if(typeof getStore!=='function'||typeof readAgentState!=='function')
    throw Error('W44_STORE_AND_W43_AGENT_PORT_REQUIRED');
  return {
    evaluate({ctx,k,operation,now}) {
      if(!ctx||!k||!['SEND_MESSAGE','SEND_MEDIA'].includes(operation))
        return denied('UNSUPPORTED_AUTHORITY');
      const store=getStore();
      if(!store)return denied('W44_STORE_UNAVAILABLE');
      const grant=store.inspection(k);
      if(!grant.ok||grant.mode!=='AUTO'||!grant.effectiveGrant)
        return denied(grant.reason||'GRANT_OR_CUSTODY_INVALID');
      const agent=readAgentState({ctx,k,operation});
      if(agent?.active!==true||!text(agent.revision))
        return denied('AGENT_INACTIVE_OR_UNVERIFIED');
      if(!text(k.identity_key)||!positive(grant.effectiveGrant.epoch)||
        !Number.isSafeInteger(grant.effectiveGrant.expiresAt)||grant.effectiveGrant.expiresAt<=now)
        return denied('STALE_GRANT_PROOF');
      return {allowed:true,identity_key:k.identity_key,agent_active:true,
        grant_revision:grant.effectiveGrant.epoch,expires_at:grant.effectiveGrant.expiresAt,revoked:false};
    }
  };
}
function w25ToW24(k) {
  if(!k||typeof k.bindingRevision!=='string'||!(/^[1-9][0-9]*$/).test(k.bindingRevision))
    throw Error('W25_K_REVISION_INVALID');
  const revision=Number(k.bindingRevision);
  const identity={tenant:k.tenantId,account:k.accountId,channel:k.channel,
    peer_id:k.peerId,binding_revision:revision};
  canonicalK(identity);
  return identity;
}

/** W25's real eligibility.check contract. W25 is the sole sender/outbox.
 * AUTO and synthetic SEND_MESSAGE only; HUMAN + media require separate owners.
 * No implicit agent, route, RBAC or consent fallbacks. */
export function createW25EligibilityPort({
  store,identityService,trustedContext,readAgentState,readRouteState,
}={}) {
  if(!store||typeof identityService?.evaluate!=='function'||!trustedContext||
    typeof readAgentState!=='function'||typeof readRouteState!=='function')
    throw Error('W25_W24_W44_W43_ROUTE_PORTS_REQUIRED');
  return {
    async check({k,mode,businessMessageId,phase}) {
      if(mode!=='AUTO'||!['ADMISSION','PRE_NETWORK'].includes(phase))
        return denied('NONPROD_AUTO_ONLY');
      if(!text(businessMessageId)||!businessMessageId.startsWith('fake-'))
        return denied('ONLY_SYNTHETIC_BUSINESS_ID');
      const identity=w25ToW24(k);
      const agent=readAgentState({trustedContext,identity});
      if(agent?.active!==true||!text(agent.revision))
        return denied('AGENT_INACTIVE_OR_UNVERIFIED');
      const route=readRouteState({trustedContext,identity});
      if(!route||route.ready!==true||!text(route.revision)||
        (identity.channel==='FB_PAGE'&&(!text(route.pageOwnerEpoch)||
          !['PANCAKE','CHATWOOT'].includes(route.pageSendOwner))))
        return denied('ROUTE_NOT_AUTHORITATIVE');
      try {
        // W24 reevaluates current binding AND the W44 grantAuthority port.
        const identityProof=identityService.evaluate(trustedContext,
          {k:identity,operation:'SEND_MESSAGE'});
        if(identityProof?.allowed!==true)return denied('W24_SEND_DENIED');
        if(phase==='ADMISSION'){
          const reserved=store.reserve({identity,intentId:businessMessageId,units:1});
          // W25 deduplication rechecks the same business ID. A preexisting
          // RESERVED intent is allowed only if its CURRENT fence still passes.
          if(!reserved.ok&&reserved.reason!=='IDEMPOTENT_RESERVED')
            return denied(reserved.reason);
        }
        const fence=store.checkForSend({identity,intentId:businessMessageId});
        if(!fence.ok)return denied(fence.reason);
        const scope=store.inspection(identity);
        if(!scope.ok||scope.mode!=='AUTO'||!scope.effectiveGrant)
          return denied('CUSTODY_OR_GRANT_INVALID');
        return {allowed:true,k,custodyMode:'AUTO',accountActive:true,
          accountEpoch:String(identityProof.account_revocation_epoch),
          custodyEpoch:String(fence.custodyEpoch),routeRevision:route.revision,
          expiresAt:scope.effectiveGrant.expiresAt,agentActive:true,
          agentRevision:agent.revision,grantRevision:String(fence.grantEpoch),
          grantActive:true,budget:{reserved:true,reservationId:fence.intentKey},
          pageOwnerEpoch:route.pageOwnerEpoch||undefined,
          pageSendOwner:route.pageSendOwner||undefined,
          pageRouteReady:identity.channel==='FB_PAGE'?true:undefined};
      } catch(error) {
        return denied(error?.code||error?.message||'AUTHORITY_UNAVAILABLE');
      }
    }
  };
}

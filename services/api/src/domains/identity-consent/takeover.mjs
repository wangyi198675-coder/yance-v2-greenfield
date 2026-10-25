/**
 * W24 trusted-server HUMAN takeover over existing W24 identity + W44 custody.
 * SYNTHETIC_TEST_ONLY. No DB, grant, budget, outbox, or network listener here.
 * GET -> strict epoch/CAS POST -> GET same K verify; no assumed success.
 */
import {canonicalK,IdentityDenied} from './identity-consent.mjs';

export const TAKEOVER_GET='/api/v2/identity-consent/takeover-state';
export const TAKEOVER_POST='/api/v2/identity-consent/takeover';
export const USER_ACTIONS=Object.freeze([
  'TYPE','IME_COMMIT','PASTE','ATTACH','DROP','VOICE','SEND_ATTEMPT'
]);
const actions=new Set(USER_ACTIONS);
const nonnegative=x=>Number.isSafeInteger(x)&&x>=0;
const deny=(code,status=403)=>{throw new TakeoverDenied(code,status)};
const same=(a,b)=>canonicalK(a)===canonicalK(b);
export class TakeoverDenied extends Error {
  constructor(code,status=403){super(code);this.name='TakeoverDenied';this.code=code;this.status=status}
}
export function parseIdentityKey(key){
  if(typeof key!=='string'||key.length>700)deny('INVALID_IDENTITY_K',422);
  const parts=key.split('|');
  if(parts.length!==5)deny('INVALID_IDENTITY_K',422);
  const revision=Number(parts[4]);
  const identity={tenant:parts[0],account:parts[1],channel:parts[2],
    peer_id:parts[3],binding_revision:revision};
  try{if(canonicalK(identity)!==key)deny('INVALID_IDENTITY_K',422)}
  catch(e){if(e instanceof IdentityDenied)deny(e.code,422);throw e}
  return Object.freeze(identity);
}
function current(identityConsent,trustedContext,identity){
  if(!trustedContext||trustedContext.input_domain!=='CONTACT')deny('TRUSTED_CONTACT_CONTEXT_REQUIRED',401);
  if(trustedContext.tenant!==identity.tenant)deny('TENANT_MISMATCH');
  let state;
  try{state=identityConsent.assertCurrent(trustedContext,identity)}
  catch(e){
    if(e instanceof IdentityDenied){
      if(['STALE_BINDING_REVISION','ACCOUNT_OR_PEER_UNBOUND','ACCOUNT_UNBOUND'].includes(e.code))
        deny(e.code,409);
      deny(e.code);
    }
    throw e;
  }
  if(!state||!same(state,identity)||state.identity_key!==canonicalK(identity))
    deny('CURRENT_IDENTITY_MISMATCH',409);
  return state;
}
function revEpoch(identityConsent,trustedContext,identity){
  const epoch=identityConsent.readConsentEpoch(trustedContext,identity);
  if(!Number.isSafeInteger(epoch)||epoch<1)deny('CONSENT_EPOCH_UNAVAILABLE',503);
  return epoch;
}
/**
 * custodyStore is W44 openEligibilityStore, not an imitation/parallel store.
 * authorizeTakeover must be supplied by trusted app auth, not request data.
 */
export function createNativeTakeoverService({identityConsent,custodyStore,authorizeTakeover}={}){
  if(typeof identityConsent?.assertCurrent!=='function'||
     typeof identityConsent?.readConsentEpoch!=='function'||
     typeof custodyStore?.inspection!=='function'||
     typeof custodyStore?.setCustody!=='function'||
     typeof authorizeTakeover!=='function')
    throw Error('W24_W44_TRUSTED_NATIVE_PORTS_REQUIRED');

  function get({trustedContext,identity}){
    const k=canonicalK(identity);
    const before=current(identityConsent,trustedContext,identity);
    let scope;
    try{scope=custodyStore.inspection(identity)}
    catch(e){
      if(e instanceof IdentityDenied)deny(e.code,409);
      throw e;
    }
    if(!scope||scope.ok!==true||!['AUTO','HUMAN'].includes(scope.mode)||
       !nonnegative(scope.custodyEpoch))deny('CUSTODY_STATE_UNAVAILABLE',503);
    // W44 inspection may synchronously call W24. Refuse if binding changes mid-read.
    const after=current(identityConsent,trustedContext,identity);
    const consent_epoch=revEpoch(identityConsent,trustedContext,identity);
    if(before.account_revocation_epoch!==after.account_revocation_epoch)
      deny('IDENTITY_EPOCH_CHANGED',409);
    const canTakeover=authorizeTakeover({trustedContext,identity,action:'READ_STATE'})===true;
    if(!canTakeover)deny('TAKEOVER_AUTH_DENIED');
    return Object.freeze({
      status:'NATIVE_TAKEOVER_STATE',identity:{...identity},identityKey:k,
      binding_revision:after.binding_revision,
      accountRevocationEpoch:after.account_revocation_epoch,
      consentEpoch:consent_epoch,
      mode:scope.mode,epoch:scope.custodyEpoch,
      accountActive:true,canTakeover:true,canSend:false
    });
  }

  function post({trustedContext,identity,expectedIdentityKey,expectedEpoch,
    expectedAccountRevocationEpoch,expectedConsentEpoch,action,intent}){
    if(intent!=='TAKEOVER_HUMAN_COMPOSER'||!actions.has(action))
      deny('NON_USER_EDIT_ACTION',422);
    if(!nonnegative(expectedEpoch)||!nonnegative(expectedAccountRevocationEpoch)||
       !Number.isSafeInteger(expectedConsentEpoch)||expectedConsentEpoch<1)
      deny('EXPECTED_EPOCHS_REQUIRED',422);
    const before=get({trustedContext,identity});
    if(before.identityKey!==expectedIdentityKey)deny('STALE_TAKEOVER_IDENTITY',409);
    if(before.epoch!==expectedEpoch||
       before.accountRevocationEpoch!==expectedAccountRevocationEpoch||
       before.consentEpoch!==expectedConsentEpoch)
      deny('STALE_TAKEOVER_EPOCH',409);
    if(before.mode==='HUMAN')deny('ALREADY_HUMAN_USE_GET',409);
    if(authorizeTakeover({trustedContext,identity,action})!==true)
      deny('TAKEOVER_ACTION_NOT_AUTHORIZED',403);
    // W44 is the ONE durable custody CAS mutation. Translate W46 action
    // to its existing USER_EDIT authority, never create a second table.
    try{
      const result=custodyStore.setCustody({
        identity,mode:'HUMAN',action:'USER_EDIT',
        actor:trustedContext.principal_id,expectedEpoch
      });
      if(result?.mode!=='HUMAN'||result.epoch!==expectedEpoch+1)
        deny('W44_CUSTODY_NOT_COMMITTED',503);
    }catch(e){
      if(e instanceof TakeoverDenied)throw e;
      if(e instanceof IdentityDenied)deny(e.code,409);
      if(['STALE_CUSTODY_EPOCH','W24_MUTATION_NOT_AUTHORIZED'].includes(e?.message))
        deny(e.message,e.message==='STALE_CUSTODY_EPOCH'?409:403);
      throw e;
    }
    // Required actual second GET; it rechecks same full K AND both epochs.
    const after=get({trustedContext,identity});
    if(!same(after.identity,before.identity)||after.mode!=='HUMAN'||
       after.epoch!==expectedEpoch+1||
       after.accountRevocationEpoch!==expectedAccountRevocationEpoch||
       after.consentEpoch!==expectedConsentEpoch)
      deny('TAKEOVER_POST_VERIFY_FAILED',409);
    return Object.freeze({
      accepted:true,identity:after.identity,identityKey:after.identityKey,
      mode:'HUMAN',epoch:after.epoch,accountRevocationEpoch:after.accountRevocationEpoch,
      consentEpoch:after.consentEpoch,confirmedByGet:true,canSend:false
    });
  }
  return Object.freeze({get,post});
}

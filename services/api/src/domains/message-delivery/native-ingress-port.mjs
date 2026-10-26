/**
 * W25 ISSUE #61: single read-only-to-provider ingress into the EXISTING
 * W24 identity authority and EXISTING message repository. It is not an SDK,
 * Outbox, sender, message database, transport, or a synthetic event adapter.
 *
 * Trust boundary:
 * - call only from a locally trusted W26/W27/W28/W29 native SDK worker;
 * - nativeOwner.verifyInbound MUST authenticate source in that worker, NOT
 *   validate caller-supplied JSON labels or HTTP assertions;
 * - existing W24 strict, durable identity must assert full K + consent;
 * - existing messageRepository must atomically store by full K + provider MID;
 * - without all these real owner ports no write occurs.
 */
export class NativeIngressDenied extends Error {
  constructor(code) { super(code); this.name='NativeIngressDenied'; this.code=code; }
}
const channels=Object.freeze({
  FB_PERSONAL:'MAUTRIX_META',
  FB_PAGE:'PANCAKE',
  WHATSAPP_PERSONAL:'BAILEYS',
  TELEGRAM_PERSONAL:'TDLIB_JSON'
});
const str=x=>typeof x==='string'&&x.length>0&&x.length<=500&&!/[\u0000-\u001f]/.test(x);
const fail=code=>{throw new NativeIngressDenied(code)};
function plain(x){return !!x&&typeof x==='object'&&Object.getPrototypeOf(x)===Object.prototype}
function exactK(k){
  if(!plain(k)||!str(k.tenant)||!str(k.account)||!str(k.peer_id)||
    !Object.hasOwn(channels,k.channel)||!Number.isSafeInteger(k.binding_revision)||
    k.binding_revision<1) fail('CANONICAL_FULL_K_REQUIRED');
  if(k.tenant==='SYNTHETIC_TEST_ONLY'||k.account.startsWith('fake-')||
    k.peer_id.startsWith('fake-'))fail('NON_SYNTHETIC_IDENTITY_REQUIRED');
  return Object.freeze({tenant:k.tenant,account:k.account,channel:k.channel,
    peer_id:k.peer_id,binding_revision:k.binding_revision});
}
function sameK(a,b){
  return a.tenant===b.tenant&&a.account===b.account&&
    a.channel===b.channel&&a.peer_id===b.peer_id&&
    a.binding_revision===b.binding_revision;
}
const trustedDrivers=new Set(Object.values(channels));
/**
 * @param {object} options
 * @param {object} options.identityService existing W24 strict durable identity
 * @param {object} options.trustedContext authenticated in-process W47 context
 * @param {object} options.nativeOwner W26-W29 attested native SDK owner ports
 * @param {object} options.messageRepository existing persisted message owner:
 *     insertOriginalIfAbsent({k, providerMid, rawText, upstream, sourceEventId})
 *     performs DB-atomic K+MID idempotent create and returns {stored,duplicate}
 */
export function createNativeIngressPort({
  identityService,trustedContext,nativeOwner,messageRepository
}={}){
  if(identityService?.isDurableIdentity!==true||
    typeof identityService.assertCurrent!=='function'||
    typeof identityService.evaluate!=='function')
    fail('STRICT_DURABLE_W24_REQUIRED');
  if(!plain(trustedContext)||!str(trustedContext.principal_id)||
    typeof nativeOwner?.verifyInbound!=='function'||
    typeof nativeOwner?.connectionState!=='function'||
    typeof messageRepository?.insertOriginalIfAbsent!=='function')
    fail('NATIVE_OWNER_AND_PERSISTED_MESSAGE_PORTS_REQUIRED');

  async function currentState(k){
    const state=await nativeOwner.connectionState(k);
    if(!plain(state)||state.connected!==true||state.authorized!==true||
      state.channel!==k.channel||state.account!==k.account||
      state.bindingRevision!==k.binding_revision||!str(state.workerIdentity))
      fail('WAITING_USER_AUTH');
    return state;
  }

  async function acceptInbound({k,rawEvent}={}){
    const identity=exactK(k);
    if(!plain(rawEvent)||rawEvent.synthetic===true||
       rawEvent.simulated===true||rawEvent.provenance?.includes?.('SYNTHETIC'))
      fail('REAL_NATIVE_EVENT_REQUIRED');
    const connection=await currentState(identity);
    // Source authority must be checked via live SDK/worker, not event labels.
    const evidence=await nativeOwner.verifyInbound({
      k:identity,rawEvent,workerIdentity:connection.workerIdentity
    });
    if(!plain(evidence)||evidence.verified!==true||
       evidence.upstream!==channels[identity.channel]||
       !sameK(exactK(evidence.k),identity)||
       !str(evidence.providerMid)||!str(evidence.sourceEventId)||
       !str(evidence.workerIdentity)||evidence.workerIdentity!==connection.workerIdentity||
       evidence.synthetic===true||evidence.echo===true||
       typeof evidence.original!=='string'||evidence.original.length>20000)
      fail('NATIVE_SOURCE_VERIFICATION_FAILED');

    // Do not allow SDK owner to skip W24 binding/Consent checks, or to install
    // a fake per-request identity as a substitute for a durable account.
    const current=identityService.assertCurrent(trustedContext,identity);
    if(current?.binding_revision!==identity.binding_revision||
       !sameK(current,identity))
      fail('W24_BINDING_NOT_CURRENT');
    const allowed=identityService.evaluate(trustedContext,{
      k:identity,operation:'READ_INBOUND'
    });
    if(allowed?.allowed!==true)fail('W24_INBOUND_DENIED');
    const after=await currentState(identity);
    if(after.workerIdentity!==connection.workerIdentity)
      fail('NATIVE_CONNECTION_REBOUND');

    const result=await messageRepository.insertOriginalIfAbsent({
      k:identity,providerMid:evidence.providerMid,
      sourceEventId:evidence.sourceEventId,
      rawText:evidence.original,upstream:evidence.upstream,
      workerIdentity:evidence.workerIdentity
    });
    if(!plain(result)||typeof result.stored!=='boolean'||
       typeof result.duplicate!=='boolean'||
       result.stored===result.duplicate)
      fail('AUTHORITATIVE_MESSAGE_STORE_RESULT_REQUIRED');
    return Object.freeze({accepted:true,stored:result.stored,
      duplicate:result.duplicate,providerMid:evidence.providerMid,
      channel:identity.channel,source:'NATIVE_UPSTREAM_VERIFIED'});
  }

  async function readiness(k){
    const identity=exactK(k);
    try {
      const state=await currentState(identity);
      const s=identityService.assertCurrent(trustedContext,identity);
      if(s?.binding_revision!==identity.binding_revision)return Object.freeze({
        ready:false,state:'WAITING_USER_AUTH'
      });
      return Object.freeze({ready:true,state:'UPSTREAM_BOUND',workerIdentity:state.workerIdentity,
        channel:identity.channel});
    }catch{return Object.freeze({ready:false,state:'WAITING_USER_AUTH'});}
  }
  return Object.freeze({acceptInbound,readiness,upstreams:trustedDrivers});
}

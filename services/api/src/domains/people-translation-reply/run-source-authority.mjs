/** W45 trust-port validation of a W43 official Agno cloud Run; NO provider client.
 * Both injected functions MUST come from server-authorized W43 and W24 owners.
 * A browser DTO, a model string, an unsigned W43-shaped receipt, or a caller
 * chosen billing flag NEVER suffices. No W43 native Cloud implementation yet.
 */
import {createHash} from 'node:crypto';
import {fullKKey} from './index.mjs';
const digest=text=>createHash('sha256').update(text,'utf8').digest('hex');
const fail=code=>{const e=new Error(code);e.code=code;throw e};
const str=x=>typeof x==='string' && x.length>0 && x.length<=256;
const positive=x=>Number.isSafeInteger(x)&&x>0;
const same=(a,b)=>fullKKey(a)===fullKKey(b);

/** Verifies the evidence RETURNED from W43 owner-side persisted-native verifier,
 * and current W24 authoritative proof. Any missing port is fail-closed.
 * No cloud model/provider allowlist is maintained in W45.
 */
export function verifyNativeCloudRun({run,record,verifyW43NativeRun,verifyW24CurrentAuthority,nowMs=Date.now()}={}){
  if(typeof verifyW43NativeRun!=='function' || typeof verifyW24CurrentAuthority!=='function')
    fail('W43_W24_CLOUD_ATTESTATION_PORTS_REQUIRED');
  if(!Number.isSafeInteger(nowMs)||nowMs<=0)fail('SERVER_CLOCK_INVALID');
  if(!run||run.engine!=='OFFICIAL_AGNO_SDK'||run.status!=='COMPLETED'||
     !str(run.provider)||!str(run.modelId)||!str(run.runId)||!str(run.sessionId)||
     !str(run.agentId)||!str(run.userId)||!str(run.requestId)||run.sdkPin!=='3.1.10'||
     !run.native_receipt||run.native_receipt.engine!=='OFFICIAL_AGNO_SDK'||
     run.native_receipt.status!=='AGNO_RUN_COMPLETED'||
     run.native_receipt.space!=='CONTACT'||
     run.purpose!=='QUALITY_EVAL'||run.native_receipt.purpose!=='QUALITY_EVAL'||
     run.native_receipt.outbound!=='DISABLED'||
     run.native_receipt.run_id!==run.runId||
     run.native_receipt.session_id!==run.sessionId||
     run.native_receipt.user_id!==run.userId||
     run.native_receipt.provider!==run.provider||
     run.native_receipt.model_id!==run.modelId||
     run.native_receipt.sdk_pin!==run.sdkPin||
     run.native_receipt.provenance?.run_id!==run.runId||
     run.native_receipt.provenance?.source!==run.provider||
     run.native_receipt.provenance?.model_id!==run.modelId||
     run.native_receipt.provenance?.purpose!=='QUALITY_EVAL'||
     !str(run.sourceSHA)||run.sourceSHA!==run.native_receipt.owner_source_sha)
    fail('W43_CLOUD_NATIVE_RECEIPT_INCOMPLETE');
  // Never accept an unverified translation hash or an unrelated original MID.
  const expected={identity:record.identity,sourceMid:record.mid,
    originalSha256:record.original.sha256,
    translationSha256:digest(record.translation.text),
    translationRequestId:record.translation.provenance.request_id,
    translationProvider:record.translation.provenance.provider,
    translationSourceMid:record.translation.provenance.source_mid,
    runId:run.runId,sessionId:run.sessionId,userId:run.userId,agentId:run.agentId,
    requestId:run.requestId,provider:run.provider,modelId:run.modelId,sdkPin:run.sdkPin,
    sourceSHA:run.sourceSHA,purpose:'QUALITY_EVAL'};
  if(!str(run.translationSha256)||run.translationSha256!==expected.translationSha256||
     run.translationRequestId!==expected.translationRequestId||
     run.originalSha256!==expected.originalSha256||run.sourceMid!==record.mid||
     !same(run.identity,record.identity)||record.translation.provenance.synthetic||
     !['LOCAL_ENGINE','AGNO_NATIVE_TRANSLATION'].includes(record.translation.provenance.kind))
    fail('W43_CLOUD_SOURCE_K_MID_OR_TRANSLATION_INVALID');
  let proof;
  try{proof=verifyW43NativeRun({run,expected,nowMs});}
  catch{fail('W43_CLOUD_NATIVE_PROOF_UNAVAILABLE')}
  if(proof&&typeof proof.then==='function')fail('W43_CLOUD_SYNC_NATIVE_PROOF_REQUIRED');
  if(!proof||proof.verified!==true||proof.issuer!=='W43_NATIVE_AGNO'||
     proof.nativePersisted!==true||proof.costScopeApproved!==true||
     proof.status!=='COMPLETED'||proof.sdkPin!=='3.1.10'||
     !same(proof.identity,expected.identity)||
     !['runId','sessionId','userId','agentId','requestId','provider','modelId',
       'sourceMid','originalSha256','translationSha256','translationRequestId']
       .every(f=>proof[f]===expected[f])||
     !positive(proof.accountEpoch)||!positive(proof.consentEpoch)||
     !positive(proof.issuedAtMs)||!positive(proof.expiresAtMs)||
     proof.issuedAtMs>nowMs||proof.expiresAtMs<=nowMs||
     proof.expiresAtMs-proof.issuedAtMs>5*60*1000)
    fail('W43_CLOUD_NATIVE_PROOF_INVALID_OR_EXPIRED');
  let w24;
  try{w24=verifyW24CurrentAuthority({identity:record.identity,mid:record.mid,
    expected,proof,nowMs});}
  catch{fail('W24_CLOUD_CURRENT_AUTHORITY_UNAVAILABLE')}
  if(w24&&typeof w24.then==='function')fail('W24_CLOUD_SYNC_AUTHORITY_REQUIRED');
  if(!w24||w24.valid!==true||
     w24.accountEpoch!==proof.accountEpoch||w24.consentEpoch!==proof.consentEpoch||
     String(w24.bindingRevision)!==String(record.identity.binding_revision))
    fail('W24_CLOUD_AUTHORITY_REVOKED_OR_STALE');
  return Object.freeze({provider:proof.provider,modelId:proof.modelId,
    accountEpoch:proof.accountEpoch,consentEpoch:proof.consentEpoch,
    expiresAtMs:proof.expiresAtMs,requestId:proof.requestId,
    translationSha256:proof.translationSha256});
}

// W46 read-side adaptation of actual W24 and W45 domain objects.
// No extra authority, translator, Agno engine, HTTP server, send path, or Outbox.
import { fullK, synthetic } from './composer-bridge.mjs';
// This adapter is for trusted local integration processes, NEVER a browser bundle.
if(typeof window!=='undefined') throw Error('SERVER_ONLY_NATIVE_CONTEXT');
const fail=code=>{throw Error(code)};
function ownerAuthority(service,trustedContext,id){
  const k=synthetic(id);
  if(!service || typeof service.assertCurrent!=='function' || typeof service.evaluate!=='function' ||
      !trustedContext || trustedContext.input_domain!=='CONTACT' ||
      trustedContext.tenant!==id.tenant)fail('W24_TRUSTED_CONTEXT_REQUIRED');
  // This is an explicitly injected backend trustedContext, NEVER a browser-created claim.
  const current=service.assertCurrent(trustedContext,id);
  if(fullK(current)!==k || current.identity_key!==k)fail('W24_CURRENT_IDENTITY_MISMATCH');
  const decision=service.evaluate(trustedContext,{k:id,operation:'READ_INBOUND'});
  if(decision?.allowed!==true || decision.identity_key!==k ||
     decision.binding_revision!==Number(id.binding_revision) ||
     decision.reversible_snapshot_only!==true)fail('W24_CURRENT_AUTHORITY_DENIED');
  return current;
}
export function createW24ReadOnlyPort({identityConsent,trustedContext}={}){
  if(!identityConsent || typeof identityConsent.assertCurrent!=='function')fail('W24_OWNER_REQUIRED');
  if(!trustedContext || trustedContext.input_domain!=='CONTACT')fail('TRUSTED_SERVER_CONTEXT_REQUIRED');
  return Object.freeze({
    // Returns W24-backed read authority only, explicitly *NOT* a HUMAN/AUTO mode.
    async get(id){
      const current=ownerAuthority(identityConsent,trustedContext,id);
      return Object.freeze({identity:id,identityKey:current.identity_key,
        status:'IDENTITY_READ_VERIFIED',canTakeover:false,canSend:false,
        accountRevocationEpoch:current.account_revocation_epoch});
    }
    // NO post: W24 has no native takeover GET/POST API yet. Never fabricate one.
  });
}
export function readW45ForComposer({identityConsent,trustedContext,peopleService,
  identity,mid,qualifyModelRun=null,qualifyTranslation=null,now=()=>Date.now()}={}){
  ownerAuthority(identityConsent,trustedContext,identity);
  if(typeof peopleService?.getMessage!=='function')fail('W45_OWNER_REQUIRED');
  if(typeof mid!=='string' || !mid.startsWith('fake-'))fail('SYNTHETIC_MID_ONLY');
  const row=peopleService.getMessage(identity,mid);
  if(fullK(row.identity)!==fullK(identity) || row.mid!==mid ||
     row.original?.source_mid!==mid || typeof row.original.text!=='string' ||
     !/^[a-f0-9]{64}$/.test(row.original.sha256) ||
     row.delivery!=='NOT_REQUESTED' || row.draft_only!==true)
     fail('W45_MESSAGE_SOURCE_INVALID');
  const tr=row.translation;
  const proven=tr?.status==='TRANSLATED'&&tr?.provenance?.kind==='LOCAL_ENGINE'&&
    tr.provenance.synthetic===false&&tr.provenance.source_mid===mid&&
    tr.provenance.input_sha256===row.original.sha256&&
    typeof tr.text==='string'&&tr.text.trim().length>0;
  // W45 'LOCAL_ENGINE' is metadata, not model/quality attestation by itself.
  const translationAttestation=proven&&typeof qualifyTranslation==='function'?
    qualifyTranslation({identity:{...row.identity},mid,
      originalSha256:row.original.sha256,provenance:structuredClone(tr.provenance)}):null;
  const displayable=translationAttestation===true||
    (translationAttestation?.verified===true&&
      Number.isSafeInteger(translationAttestation.expiresAt)&&translationAttestation.expiresAt>now());
  const candidates=[];
  for(const c of row.candidates||[]){
    const p=c?.provenance;
    if(!displayable||typeof qualifyModelRun!=='function'||c.action!=='DRAFT_ONLY'||
       p?.engine!=='OFFICIAL_AGNO_SDK'||p.sdk_pin!=='3.1.10'||
       p.model_id!=='qwen3:8b'||!p.run_id||p.source_mid!==mid||
       !Array.isArray(p.sources)||p.sources.length===0||
       p.sources.some(s=>s.mid!==mid||!['ORIGINAL','TRANSLATION'].includes(s.part)))continue;
    const attestation=qualifyModelRun({identity:{...row.identity},mid,
       runId:p.run_id,modelId:p.model_id,provider:p.model_provider,
       provenance:structuredClone(p)});
    if(attestation?.verified!==true||!Number.isSafeInteger(attestation.expiresAt)||
       attestation.expiresAt<=now())continue;
    if(p.model_provider!=='LLAMACPP_LOCAL_QWEN3_8B_FREE'||
       p.quality_qualified!==false||p.quality_status!=='MODEL_QUALITY_UNREVIEWED')continue;
    candidates.push({id:c.id,text:c.text,action:'INSERT_DRAFT_ONLY',
      qualityQualified:false,qualityStatus:'MODEL_QUALITY_UNREVIEWED',
      runExpiresAt:attestation.expiresAt,
      provenance:{kind:'AGNO_RUN',identityKey:fullK(identity),sourceMid:mid,
       runId:p.run_id,sessionId:p.session_id,agentId:p.agent_id,
       provider:p.model_provider,modelId:p.model_id,sourceRefs:p.sources}});
  }
  if(candidates.length>3)fail('W45_CANDIDATE_COUNT_INVALID');
  return Object.freeze({
    identity:{...row.identity},identityKey:fullK(identity),mid,
    original:row.original.text,originalSha256:row.original.sha256,
    zh:displayable&&tr.target_language==='zh-CN'?tr.text:null,
    translated:displayable?tr.text:null,translationStatus:tr?.status||'UNAVAILABLE',
    translationProvenance:displayable?structuredClone(tr.provenance):null,
    translationQuality:'MODEL_QUALITY_UNREVIEWED',
    suggestions:candidates,delivery:'NOT_REQUESTED',canSend:false,
    // Never represent fixture zh as authentic translation or unverified Agno runs as candidates.
  });
}


/** Server-side W45 Owner port; no second draft database, no sending.
 * The caller must supply independent trusted receipt freshness attestations.
 * The current W45 DTO has no signed Run expiry; fail closed without a deadline.
 */
export function createW45DraftPort({identityConsent,trustedContext,peopleService,
  qualifyModelRun,qualifyTranslation,now=()=>Date.now()}={}){
  if(typeof peopleService?.draftCandidate!=='function'||
      typeof peopleService?.getMessage!=='function')fail('W45_DRAFT_OWNER_REQUIRED');
  const get=(identity,mid)=>readW45ForComposer({identityConsent,trustedContext,
      peopleService,identity,mid,qualifyModelRun,qualifyTranslation,now});
  return Object.freeze({
    get,
    draftCandidate(identity,mid,candidateId){
      const current=get(identity,mid);
      const row=current.suggestions.find(c=>c.id===candidateId);
      if(!row)fail('W45_CANDIDATE_NOT_ATTESTED_OR_EXPIRED');
      const receipt=peopleService.draftCandidate(identity,mid,candidateId);
      if(receipt?.destination!=='EXISTING_BC_COMPOSER'||
         receipt.action!=='INSERT_DRAFT_ONLY'||receipt.delivery!=='NOT_REQUESTED'||
         fullK(receipt.identity)!==fullK(identity)||receipt.source_mid!==mid||
         receipt.candidate_id!==row.id||receipt.text!==row.text||
         receipt.provenance?.run_id!==row.provenance.runId||
         receipt.provenance?.source_mid!==mid||
         receipt.provenance?.quality_qualified!==false||
         receipt.provenance?.quality_status!=='MODEL_QUALITY_UNREVIEWED')
         fail('W45_INSERT_DRAFT_CONTRACT_MISMATCH');
      return Object.freeze({
        ...structuredClone(receipt),qualityQualified:false,
        qualityStatus:'MODEL_QUALITY_UNREVIEWED',
        runExpiresAt:row.runExpiresAt
      });
    }
  });
}

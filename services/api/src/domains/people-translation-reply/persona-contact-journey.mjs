// W45 minimal native contact-context/strategy/feedback adapter.
// No persona/learning DB, Agent, channel SDK, timer, HTTP listener or sender.
// All trusted ports must be injected by existing W09/W24/W25/W43/Persona Owners.
import {createHash} from 'node:crypto';
import {nativeKKey} from './native-people-read.mjs';
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
const channels=new Set(['FB_PERSONAL','FB_PAGE','WHATSAPP_PERSONAL','TELEGRAM_PERSONAL']);
const providers=new Set(['mautrix-meta','pancake','baileys','tdlib-json']);
export const CONTACT_STRATEGIES=Object.freeze([
 'DIRECT_ANSWER','WARM_SUPPORT','BOUNDARY','LIGHT_HUMOR','NATURAL_CLOSE','OTHER'
]);
const strategies=new Set(CONTACT_STRATEGIES);
const bad=code=>{const err=new Error(code);err.code=code;throw err};
const str=(x,max=240)=>typeof x==='string'&&x.trim().length>0&&x.length<=max;
const eq=(a,b)=>{try{return nativeKKey(a)===nativeKKey(b)}catch{return false}};
const required=(port,code)=>{if(typeof port!=='function')bad(code);return port};
const identityValid=k=>k&&channels.has(k.channel)&&str(k.tenant)&&str(k.account)&&
 str(k.peer_id)&&/^[1-9]\d*$/.test(String(k.binding_revision));
const presentPrincipal=p=>p?.verified===true&&p.source==='W54_NATIVE_CURRENT_USER'&&
 str(p.principalRef)&&str(p.installationRef)&&Number.isSafeInteger(p.revocationGeneration);
const status=(s,extra={})=>Object.freeze({status:s,candidates:[],canSend:false,
 delivery:'NOT_REQUESTED',...extra});
const sameIdentity=(a,b)=>eq(a,b)&&identityValid(a)&&identityValid(b);
function assertW24(source,principal,identity){
 if(source?.issuer!=='W24_IDENTITY_CONSENT'||source.status!=='AUTHORIZED'||
    source.readInboundConsent!==true||source.principalRef!==principal.principalRef||
    !sameIdentity(source.identity,identity)||!Number.isSafeInteger(source.accountEpoch)||
    source.accountEpoch<1||!Number.isSafeInteger(source.consentEpoch)||
    source.consentEpoch<1)bad('W24_CURRENT_CONTACT_NOT_VERIFIED');
 return source;
}
function assertMessage(m,identity,mid){
 if(!m||m.issuer!=='W25_ORIGINAL_INBOUND'||m.status!=='INBOUND_PERSISTED'||
   !sameIdentity(m.identity,identity)||m.mid!==mid||!str(mid,250)||
   !str(m.recordId,64)||!/^[a-f0-9]{64}$/.test(m.recordId)||
   !providers.has(m.providerSource)||!str(m.original,64000)||
   m.originalSha256!==sha(m.original))bad('W25_PERSISTED_INBOUND_NOT_VERIFIED');
 return m;
}
function validatePersona(x,principal,k){
 if(!x||x.issuer!=='PERSONA_NATIVE_OWNER'||x.status!=='ACTIVE'||
    x.principalRef!==principal.principalRef||!sameIdentity(x.identity,k)||
    !str(x.policy?.personaId)||!Number.isSafeInteger(x.policy?.version)||
    x.policy.version<1||x.policy.approved!==true||x.policy.scope!=='SELF_APPROVED'||
    x.policy.revokedAt!==null||x.policy.active!==true||
    !Number.isSafeInteger(x.contextRevision)||x.contextRevision<1||
    !x.languagePolicy||!['USER_EXPLICIT','CURRENT_INBOUND_LANGUAGE','VERIFIED_CONTACT_HISTORY'].includes(x.languagePolicy.source)||
    !['zh-CN','en','de','pl'].includes(x.languagePolicy.replyLanguage)||
    !Number.isSafeInteger(x.languagePolicy.revision)||x.languagePolicy.revision<1||
    !Array.isArray(x.factRefs)||x.factRefs.length>100||
    x.factRefs.some(y=>!str(y,160))||
    !Array.isArray(x.experts)||x.experts.length>10||
    x.experts.some(y=>!str(y?.expertId)||!Number.isSafeInteger(y?.version)||
      y.version<1||y.installed!==true||y.enabled!==true||y.issuer!=='W43_NATIVE_EXPERT_REGISTRY'))
   bad('PERSONA_EXPERT_CURRENT_PROJECTION_NOT_VERIFIED');
 const relation=x.relationship;
 if(relation && (typeof relation!=='object'||!str(relation.stage,120)||
    !Number.isSafeInteger(relation.revision)||relation.revision<1||
    (relation.currentGoal!==null&&!str(relation.currentGoal,1200))||
    (relation.longTermGoal!==null&&!str(relation.longTermGoal,1200))||
    !Array.isArray(relation.sourceFactRefs)||
    relation.sourceFactRefs.some(f=>!x.factRefs.includes(f))||
    ((relation.currentGoal||relation.longTermGoal)&&relation.sourceFactRefs.length===0)))
   bad('CONTACT_RELATIONSHIP_FACT_SOURCE_NOT_VERIFIED');
 return x;
}
function validTranslation(x,m){
 const p=x?.provenance;
 return x?.status==='TRANSLATED'&&str(x.text,64000)&&x.target_language==='zh-CN'&&
   p&&['LOCAL_ENGINE','AGNO_NATIVE_TRANSLATION'].includes(p.kind)&&p.synthetic===false&&
   p.source_mid===m.mid&&p.input_sha256===m.originalSha256&&
   str(p.provider)&&str(p.request_id);
}
function candidateItems(result,message,ctx){
 if(result?.status!=='AGNO_RUN_COMPLETED'||result.engine!=='OFFICIAL_AGNO_SDK'||
    result.outbound!=='DISABLED'||!sameIdentity(result.identity,ctx.identity)||
    result.sourceMid!==message.mid||result.originalSha256!==message.originalSha256||
    result.personaVersion!==ctx.persona.policy.version||
    result.contextRevision!==ctx.persona.contextRevision||
    !Array.isArray(result.experts)||
    !sameArray(result.experts,ctx.persona.experts.map(e=>({expertId:e.expertId,version:e.version})))||
    !str(result.runId)||!str(result.sessionId)||!str(result.modelProvider)||
    !str(result.modelId)||!Array.isArray(result.candidates)||
    result.candidates.length>3)bad('W43_CONTACT_RUN_PROVENANCE_INVALID');
 const ids=new Set(),plans=new Set(),texts=new Set(),items=[];
 for(const c of result.candidates){
   const natural=typeof c?.text==='string'?c.text.trim().normalize('NFKC').replace(/\s+/g,' ').toLowerCase():'';
   if(!str(c?.id)||!str(c?.text,650)||!strategies.has(c?.strategyId)||
      ids.has(c.id)||plans.has(c.strategyId)||texts.has(natural)||!Array.isArray(c.sources)||
      c.sources.length===0||
      c.sources.some(s=>s.mid!==message.mid||!['ORIGINAL','TRANSLATION'].includes(s.part)||
        (s.part==='TRANSLATION'&&ctx.translation.status!=='TRANSLATED')))
      bad('W45_STRATEGY_OR_SOURCE_INVALID');
   ids.add(c.id);plans.add(c.strategyId);texts.add(natural);
   items.push({id:c.id,text:c.text,language:ctx.replyLanguage,
      strategyId:c.strategyId,sources:structuredClone(c.sources),
      action:'DRAFT_ONLY',quality_qualified:false});
 }
 return items;
}
const sameArray=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
/** W47 calls this only AFTER W25 committed real inbound and W24 resolved the K.
 * W43 must dedupe idempotencyKey in its existing durable request ledger.
 */
export function createPersonaContactJourney({
 readW24Current=null,readW25PersistedInbound=null,readPersonaCurrent=null,
 readW45Translation=null,attestW45Translation=null,
 runW43Contact=null,attestW43ContactRun=null,
 attestSemanticDiversity=null,revalidateW24=null,
 writePersonaFeedback=null,readPersonaFeedback=null,
 readW24LearningConsent=null,attestW25SendAck=null,
 attestW43CandidateSource=null
}={}){
 async function authorize(principal,identity){
   if(!presentPrincipal(principal))return null;
   if(!identityValid(identity))bad('W24_FULL_K_INVALID');
   const a=await required(readW24Current,'W24_NATIVE_PORT_NOT_WIRED')({
      principal,identity,operation:'READ_INBOUND'});
   if(a?.status==='WAITING_USER_AUTH')return null;
   return assertW24(a,principal,identity);
 }
 async function recheck(principal,identity,authority,persona=null){
   const v=await required(revalidateW24,'W24_REVALIDATION_PORT_NOT_WIRED')({
    principal,identity,authority,operation:'READ_INBOUND'});
   if(v!==true)bad('W24_REVOKED_OR_EPOCH_CHANGED');
   if(persona){
     const after=validatePersona(await required(readPersonaCurrent,
       'PERSONA_AUTHORITY_NOT_WIRED')({principal,identity,operation:'READ_PERSONA_CONTEXT'}),
       principal,identity);
     if(after.contextRevision!==persona.contextRevision||
        after.policy.version!==persona.policy.version||
        !sameArray(after.factRefs,persona.factRefs)||
        !sameArray(after.experts,persona.experts)||
        !sameArray(after.relationship,persona.relationship)||
        !sameArray(after.languagePolicy,persona.languagePolicy))
       bad('PERSONA_CONTEXT_CHANGED_DURING_RUN');
   }
 }
 return Object.freeze({
  async onVerifiedInbound({principal,identity,mid,replyLanguage}={}){
    const current=await authorize(principal,identity);
    if(!current)return status('WAITING_USER_AUTH');
    if(!str(mid,250)||!['zh-CN','de','en','pl'].includes(replyLanguage))
      bad('MID_OR_TARGET_LANGUAGE_INVALID');
    const msg=assertMessage(await required(readW25PersistedInbound,
      'W25_NATIVE_INBOUND_PORT_NOT_WIRED')({principal,identity,mid,authority:current}),
      identity,mid);
    if(typeof readPersonaCurrent!=='function')return status('PERSONA_AUTHORITY_NOT_WIRED');
    const persona=validatePersona(await readPersonaCurrent({principal,identity,
      operation:'READ_PERSONA_CONTEXT'}),principal,identity);
    if(persona.languagePolicy.replyLanguage!==replyLanguage)
      bad('CONTACT_NATIVE_LANGUAGE_POLICY_MISMATCH');
    let translation={status:'UNAVAILABLE',text:null};
    if(typeof readW45Translation==='function'){
      const t=await readW45Translation({principal,identity,mid,
        originalSha256:msg.originalSha256,targetLanguage:'zh-CN'});
      if(validTranslation(t,msg)&&typeof attestW45Translation==='function'&&
         await attestW45Translation({principal,identity,mid,translation:t,
           originalSha256:msg.originalSha256,translatedSha256:sha(t.text)})===true)
        translation={status:'TRANSLATED',text:t.text,source:t.provenance.provider,
          requestId:t.provenance.request_id,sha256:sha(t.text)};
    }
    // W43 original native run owner must decide model, cost and actual expert registry.
    if(typeof runW43Contact!=='function'||typeof attestW43ContactRun!=='function')
      return status('W43_NATIVE_CONTACT_RUN_NOT_WIRED',{translation});
    const scope={principalRef:principal.principalRef,identity:structuredClone(identity),
      persona:{personaId:persona.policy.personaId,version:persona.policy.version},
      contextRevision:persona.contextRevision,
      relationship:structuredClone(persona.relationship||null),
      factRefs:structuredClone(persona.factRefs),
      experts:persona.experts.map(e=>({expertId:e.expertId,version:e.version})),
      sourceMid:mid,originalSha256:msg.originalSha256,
      translationSha256:translation.sha256||null,replyLanguage,
      idempotencyKey:sha(nativeKKey(identity)+'\0'+mid+'\0'+msg.originalSha256+
        '\0'+persona.policy.version+'\0'+persona.contextRevision)};
    await recheck(principal,identity,current,persona);
    const receipt=await runW43Contact({principal,scope,original:msg.original,
      verifiedTranslation:translation.status==='TRANSLATED'?translation.text:null});
    if(receipt?.status!=='AGNO_RUN_COMPLETED'){
      await recheck(principal,identity,current,persona);
      return status('RUN_UNAVAILABLE',{translation});
    }
    const verified=await attestW43ContactRun({principal,scope,receipt});
    if(verified?.verified!==true||verified.issuer!=='W43_NATIVE_AGNO'||
       verified.nativePersisted!==true||verified.runId!==receipt.runId||
       verified.sessionId!==receipt.sessionId||verified.idempotencyKey!==scope.idempotencyKey)
      bad('W43_NATIVE_RUN_ATTESTATION_FAILED');
    let candidates=candidateItems(receipt,msg,{identity,persona,translation,replyLanguage});
    let diversity='NOT_APPLICABLE';
    if(candidates.length>1){
      let r;
      if(typeof attestSemanticDiversity==='function')
        r=await attestSemanticDiversity({principal,scope,receipt,
          candidateIds:candidates.map(c=>c.id),strategies:candidates.map(c=>c.strategyId)});
      if(r?.verified!==true||r.issuer!=='W45_INDEPENDENT_DIVERSITY_REVIEW'||
         r.runId!==receipt.runId||
         !sameArray(r.candidateIds,candidates.map(c=>c.id))){
        candidates=candidates.slice(0,1);
        diversity='UNVERIFIED_REDUCED_TO_ONE';
      } else diversity='VERIFIED_INDEPENDENTLY';
    }
    await recheck(principal,identity,current,persona);
    return status('CANDIDATES_PRESENT',{identity:structuredClone(identity),mid,
      originalSha256:msg.originalSha256,translation,runId:receipt.runId,
      sessionId:receipt.sessionId,modelProvider:receipt.modelProvider,
      modelId:receipt.modelId,personaVersion:persona.policy.version,
      contextRevision:persona.contextRevision,expertIds:scope.experts,
      candidates,semanticDiversity:diversity,
      quality:'NATIVE_LANGUAGE_HUMAN_REVIEW_PENDING',draftOnly:true});
  },
  async recordFeedback({principal,identity,mid,originalSha256,candidateId,
    action,eventId,expectedRevision,details=null,w25Ack=null}={}){
    const authority=await authorize(principal,identity);
    if(!authority)return {status:'WAITING_USER_AUTH',persisted:false};
    if(!['SELECT','EDIT','REJECT','ADOPT','SEND_ACK','DO_NOT_LEARN'].includes(action)||
       !str(mid,250)||!str(candidateId)||!str(eventId)||!Number.isSafeInteger(expectedRevision)||
       expectedRevision<0||!str(originalSha256,64)||!/^[a-f0-9]{64}$/.test(originalSha256))
      bad('FEEDBACK_INPUT_INVALID');
    if(typeof writePersonaFeedback!=='function'||typeof readPersonaFeedback!=='function')
      return {status:'PERSISTENCE_UNAVAILABLE',persisted:false};
    const msg=assertMessage(await required(readW25PersistedInbound,
      'W25_NATIVE_INBOUND_PORT_NOT_WIRED')({principal,identity,mid,authority}),identity,mid);
    if(msg.originalSha256!==originalSha256)bad('FEEDBACK_SOURCE_HASH_MISMATCH');
    if(typeof attestW43CandidateSource!=='function'||
       await attestW43CandidateSource({principal,identity,mid,candidateId,
         originalSha256,action})!==true)
      bad('W43_CANDIDATE_SOURCE_NOT_VERIFIED');
    if(action==='SEND_ACK'){
      if(typeof attestW25SendAck!=='function'||
         await attestW25SendAck({principal,identity,sourceMid:mid,candidateId,
           w25Ack})!==true)bad('W25_REAL_PROVIDER_SEND_ACK_REQUIRED');
    }
    const learn=typeof readW24LearningConsent==='function'&&
      await readW24LearningConsent({principal,identity,operation:'PERSISTENT_LEARNING'})===true;
    await recheck(principal,identity,authority);
    const item={identity:structuredClone(identity),sourceMid:mid,
      originalSha256,candidateId,action,eventId,expectedRevision,
      actorRef:principal.principalRef,details:details===null?null:structuredClone(details),
      eligible:learn&&action!=='SELECT'&&action!=='DO_NOT_LEARN',
      doNotLearn:action==='DO_NOT_LEARN',
      outboundVerified:action==='SEND_ACK',w25AckRef:action==='SEND_ACK'?w25Ack?.ackRef:null};
    const stored=await writePersonaFeedback({principal,event:item,authority});
    const persisted=await readPersonaFeedback({principal,identity,eventId});
    await recheck(principal,identity,authority);
    if(stored?.status!=='COMMITTED'||persisted?.status!=='COMMITTED'||
       persisted.event?.eventId!==eventId||persisted.event?.action!==action||
       persisted.event?.sourceMid!==mid||persisted.event?.originalSha256!==originalSha256||
       persisted.event?.actorRef!==principal.principalRef||
       persisted.event?.eligible!==item.eligible)
      bad('PERSONA_FEEDBACK_DURABLE_READBACK_REQUIRED');
    return {status:'RECORDED_NOT_LEARNED',persisted:true,eventId,action,
      eligibleForLaterReview:item.eligible,learned:false};
  }
 });
}

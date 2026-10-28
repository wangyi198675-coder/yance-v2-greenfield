import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPersonaContactJourney} from './persona-contact-journey.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const person={verified:true,source:'W54_NATIVE_CURRENT_USER',
 principalRef:'FIXTURE_PRINCIPAL_W45',installationRef:'FIXTURE_HOST_W45',
 revocationGeneration:1};
const a={tenant:'TEST_ISOLATION',account:'ACCOUNT_FIRST',channel:'TELEGRAM_PERSONAL',
 peer_id:'ALICE_001',binding_revision:1};
const b={...a,peer_id:'BOB_002'};
const c={...a,account:'ACCOUNT_SECOND',peer_id:'CAROL_003'};
const original='Guten Morgen! Wie geht es dir?';
const mid='W29_PERSISTED_NATIVE_MID_TEST';
const w24=k=>({issuer:'W24_IDENTITY_CONSENT',status:'AUTHORIZED',readInboundConsent:true,
 principalRef:person.principalRef,identity:k,accountEpoch:2,consentEpoch:5});
const w25=k=>({issuer:'W25_ORIGINAL_INBOUND',status:'INBOUND_PERSISTED',identity:k,
 mid,original,originalSha256:sha(original),recordId:sha('w25 persistent fixture'),
 providerSource:'tdlib-json'});
const persona=k=>({issuer:'PERSONA_NATIVE_OWNER',status:'ACTIVE',
 principalRef:person.principalRef,identity:k,
 policy:{personaId:'SELF_1',version:7,scope:'SELF_APPROVED',approved:true,
 active:true,revokedAt:null},contextRevision:9,
 languagePolicy:{replyLanguage:'de',source:'CURRENT_INBOUND_LANGUAGE',revision:2},
 factRefs:['FACT_USER_CONFIRMED_001'],
 relationship:{stage:'GETTING_TO_KNOW',revision:3,
   longTermGoal:'了解对方',currentGoal:'回答近况',
   sourceFactRefs:['FACT_USER_CONFIRMED_001']},
 experts:[]});
const strategies=['DIRECT_ANSWER','WARM_SUPPORT','BOUNDARY'];
const texts=['Mir geht es gut, danke. Wie geht es dir?',
 'Schön, von dir zu hören. Mir geht es ganz gut.',
 'Heute möchte ich darüber lieber nicht sprechen.'];
const receipt=(scope,identity=a,n=3)=>({
 status:'AGNO_RUN_COMPLETED',engine:'OFFICIAL_AGNO_SDK',outbound:'DISABLED',
 identity,sourceMid:mid,originalSha256:sha(original),
 personaVersion:7,contextRevision:9,
 experts:scope.experts,runId:'fixture-agno-run-A',
 sessionId:'fixture-agno-session-A',modelProvider:'LLAMACPP_LOCAL_QWEN3_8B_FREE',
 modelId:'qwen3:8b',candidates:strategies.slice(0,n).map((strategyId,i)=>({
 id:'fixture-candidate-'+i,text:texts[i],strategyId,
 sources:[{mid,part:'ORIGINAL'}]}))});
const attestation=({scope,receipt})=>({
 verified:true,issuer:'W43_NATIVE_AGNO',nativePersisted:true,
 runId:receipt.runId,sessionId:receipt.sessionId,idempotencyKey:scope.idempotencyKey});
const diversity=({receipt,candidateIds})=>({
 verified:true,issuer:'W45_INDEPENDENT_DIVERSITY_REVIEW',runId:receipt.runId,
 candidateIds});
const translated={
 status:'TRANSLATED',text:'早上好！你最近怎么样？',target_language:'zh-CN',
 provenance:{kind:'AGNO_NATIVE_TRANSLATION',synthetic:false,
  source_mid:mid,input_sha256:sha(original),provider:'W43_NATIVE_AGNO',
  request_id:'translation-receipt-1'}
};
function fixture(override={}){
 const events=new Map();
 return createPersonaContactJourney({
 readW24Current:async({identity})=>w24(identity),
 readW25PersistedInbound:async({identity})=>w25(identity),
 readPersonaCurrent:async({identity})=>persona(identity),
 revalidateW24:async()=>true,
 runW43Contact:async({scope})=>receipt(scope,scope.identity),
 attestW43ContactRun:async args=>attestation(args),
 attestSemanticDiversity:async args=>diversity(args),
 readW45Translation:async()=>translated,
 attestW45Translation:async()=>true,
 readW24LearningConsent:async()=>true,
 attestW43CandidateSource:async()=>true,
 attestW25SendAck:async({w25Ack})=>w25Ack?.issuer==='W25_MESSAGE_DELIVERY'&&
  w25Ack.status==='ACKED'&&w25Ack.sourceMid===mid,
 writePersonaFeedback:async({event})=>{
   events.set(event.eventId,{status:'COMMITTED',event:structuredClone(event)});
   return {status:'COMMITTED'}},
 readPersonaFeedback:async({eventId})=>events.get(eventId),
 ...override});
}
const on=(o={},k=a)=>fixture(o).onVerifiedInbound({principal:person,identity:k,
 mid,replyLanguage:'de'});
const e=(action='ADOPT',suffix=action)=>({
 principal:person,identity:a,mid,originalSha256:sha(original),
 candidateId:'fixture-candidate-0',action,eventId:'event-'+suffix,
 expectedRevision:2,w25Ack:{issuer:'W25_MESSAGE_DELIVERY',status:'ACKED',
 sourceMid:mid,ackRef:'test-only-ack'}});
test('current signed 5-part K, W25 persisted MID, Persona v7 and W43 Run yield 3 explicit strategies',async()=>{
 const result=await on();
 assert.equal(result.status,'CANDIDATES_PRESENT');
 assert.equal(result.candidates.length,3);
 assert.deepEqual(result.candidates.map(x=>x.strategyId),strategies);
 assert.equal(result.originalSha256,sha(original));
 assert.equal(result.translation.status,'TRANSLATED');
 assert.equal(result.runId,'fixture-agno-run-A');
 assert.equal(result.semanticDiversity,'VERIFIED_INDEPENDENTLY');
 assert.equal(result.quality,'NATIVE_LANGUAGE_HUMAN_REVIEW_PENDING');
 assert.equal(result.canSend,false);
 assert.equal(result.candidates[0].action,'DRAFT_ONLY');
});
test('no authorized W54 principal never calls W24 nor W43',async()=>{
 let calls=0;
 const x=fixture({readW24Current:async()=>{calls++;return w24(a)}});
 const r=await x.onVerifiedInbound({principal:{verified:false},identity:a,
 mid,replyLanguage:'de'});
 assert.equal(r.status,'WAITING_USER_AUTH');assert.equal(calls,0);
});
test('W24 waiting user authorization blocks all social source or model work',async()=>{
 let invoked=false;
 const r=await on({readW24Current:async()=>({status:'WAITING_USER_AUTH'}),
 runW43Contact:async()=>{invoked=true;return null}});
 assert.equal(r.status,'WAITING_USER_AUTH');assert.equal(invoked,false);
});
test('missing W24 authority port fails rather than deriving identity from browser',async()=>{
 await assert.rejects(on({readW24Current:null}),/W24_NATIVE_PORT_NOT_WIRED/);
});
test('W25 unsaved MID, wrong source hash or foreign account aborts BEFORE W43',async()=>{
 for(const patch of [{status:'PENDING'},{originalSha256:'0'.repeat(64)},
   {identity:c},{providerSource:'random'},{recordId:'bad'}]){
  let calls=0;
  const x=fixture({readW25PersistedInbound:async()=>({...w25(a),...patch}),
   runW43Contact:async()=>{calls++;return null}});
  await assert.rejects(x.onVerifiedInbound({principal:person,identity:a,mid,
    replyLanguage:'de'}),/W25_PERSISTED_INBOUND_NOT_VERIFIED/);
  assert.equal(calls,0);
 }
});
test('without Persona signed native Owner port it returns truthful not wired and NO paid/model call',async()=>{
 let count=0;
 const r=await on({readPersonaCurrent:null,runW43Contact:async()=>{count++;return null}});
 assert.equal(r.status,'PERSONA_AUTHORITY_NOT_WIRED');assert.equal(count,0);
});
test('unapproved, revoked and other-contact Persona rejected before W43',async()=>{
 for(const patch of [{policy:{...persona(a).policy,approved:false}},
   {policy:{...persona(a).policy,revokedAt:'2026-01-01'}},{identity:b},
   {principalRef:'OTHER_PRINCIPAL'}]){
  let runs=0;
  const x=fixture({readPersonaCurrent:async()=>({...persona(a),...patch}),
    runW43Contact:async()=>{runs++;return null}});
  await assert.rejects(x.onVerifiedInbound({principal:person,identity:a,mid,
   replyLanguage:'de'}),/PERSONA_EXPERT_CURRENT_PROJECTION_NOT_VERIFIED/);
  assert.equal(runs,0);
 }
});
test('contact goal requires sourced PersonFact in same K',async()=>{
 const p={...persona(a),relationship:{...persona(a).relationship,
   sourceFactRefs:['OTHER_CONTACT_FACT']}};
 await assert.rejects(on({readPersonaCurrent:async()=>p}),
  /CONTACT_RELATIONSHIP_FACT_SOURCE_NOT_VERIFIED/);
});
test('expert is NOT assumed installed from ten design candidates',async()=>{
 const p={...persona(a),experts:[{expertId:'german-natural-chat',
  issuer:'EXPERT_CANDIDATE_ONLY',version:1,installed:false,enabled:false}]};
 await assert.rejects(on({readPersonaCurrent:async()=>p}),
  /PERSONA_EXPERT_CURRENT_PROJECTION_NOT_VERIFIED/);
});
test('W43 receives only current A facts, never B relationship or a fabricated ten-expert list',async()=>{
 const pairs=[];
 const x=fixture({runW43Contact:async({scope})=>{
   pairs.push(scope);
   return receipt(scope,scope.identity,1)}});
 for(const k of [a,b,c,a])await x.onVerifiedInbound({principal:person,identity:k,
  mid,replyLanguage:'de'});
 assert.equal(pairs.length,4);
 assert.notEqual(pairs[0].idempotencyKey,pairs[1].idempotencyKey);
 assert.notEqual(pairs[0].idempotencyKey,pairs[2].idempotencyKey);
 assert.equal(pairs[0].idempotencyKey,pairs[3].idempotencyKey);
 pairs.forEach((s,i)=>{assert.equal(s.identity.peer_id,[a,b,c,a][i].peer_id);
 assert.deepEqual(s.experts,[]);assert.equal(s.persona.version,7)});
});
test('three actual strategies without independent semantic attestation reduce to one real candidate',async()=>{
 const r=await on({attestSemanticDiversity:null});
 assert.equal(r.candidates.length,1);
 assert.equal(r.semanticDiversity,'UNVERIFIED_REDUCED_TO_ONE');
 assert.equal(r.candidates[0].text,texts[0]);
});
test('duplicate strategies, forged sources, same text cannot be shown as 3 authentic strategies',async()=>{
 for(const badResult of [
   r=>({...r,candidates:[r.candidates[0],{...r.candidates[1],strategyId:'DIRECT_ANSWER'}]}),
   r=>({...r,candidates:[{...r.candidates[0],sources:[{mid:'OTHER',part:'ORIGINAL'}]}]}),
   r=>({...r,candidates:[{...r.candidates[0],sources:[{mid,part:'TRANSLATION'}]}]})
 ]){
  const x=fixture({runW43Contact:async({scope})=>badResult(receipt(scope,a,3)),
   readW45Translation:null});
  await assert.rejects(x.onVerifiedInbound({principal:person,identity:a,
    mid,replyLanguage:'de'}),/W45_STRATEGY_OR_SOURCE_INVALID/);
 }
});
test('no authentic translation receipt gives UNAVAILABLE and does not expose Chinese gloss to Agno',async()=>{
 let saw=null;
 const x=fixture({attestW45Translation:null,
  runW43Contact:async({scope,verifiedTranslation})=>{
    saw=verifiedTranslation;return receipt(scope,a,1)}});
 const r=await x.onVerifiedInbound({principal:person,identity:a,mid,replyLanguage:'de'});
 assert.equal(saw,null);assert.equal(r.translation.status,'UNAVAILABLE');
});
test('invalid translator original hash and fabricated text never sent as verified gloss',async()=>{
 const x=fixture({readW45Translation:async()=>({...translated,
  provenance:{...translated.provenance,input_sha256:'X'}}),
  runW43Contact:async({scope,verifiedTranslation})=>{
    assert.equal(verifiedTranslation,null);return receipt(scope,a,1)}});
 const r=await x.onVerifiedInbound({principal:person,identity:a,mid,replyLanguage:'de'});
 assert.equal(r.translation.status,'UNAVAILABLE');
});
test('forged W43 receipt K, personaVersion, source SHA and missing persisted attestor are denied',async()=>{
 for(const patch of [{identity:b},{personaVersion:8},{originalSha256:'wrong'},
   {sourceMid:'FORGED'}]){
  await assert.rejects(on({runW43Contact:async({scope})=>({...receipt(scope,a,1),...patch})}),
   /W43_CONTACT_RUN_PROVENANCE_INVALID/);
 }
 assert.equal((await on({attestW43ContactRun:null})).status,
  'W43_NATIVE_CONTACT_RUN_NOT_WIRED');
 await assert.rejects(on({attestW43ContactRun:async()=>({verified:false})}),
  /W43_NATIVE_RUN_ATTESTATION_FAILED/);
});
test('W24 revoke and Persona version change while Agno await cancels result',async()=>{
 for(const patch of [
  {revalidateW24:async()=>false},
  {readPersonaCurrent:(()=>{let i=0;return async()=>{
    i++;return {...persona(a),contextRevision:i===1?9:10}}})()}
 ]){
  await assert.rejects(on(patch),/W24_REVOKED_OR_EPOCH_CHANGED|PERSONA_CONTEXT_CHANGED_DURING_RUN/);
 }
});
test('W43 runtime absent returns zero suggestions, preserving actual verified source',async()=>{
 const r=await on({runW43Contact:null});
 assert.equal(r.status,'W43_NATIVE_CONTACT_RUN_NOT_WIRED');
 assert.deepEqual(r.candidates,[]);
});
test('durable feedback port absent never reports fake persisted learning success',async()=>{
 const r=await fixture({writePersonaFeedback:null}).recordFeedback(e('ADOPT'));
 assert.equal(r.status,'PERSISTENCE_UNAVAILABLE');assert.equal(r.persisted,false);
});
test('SELECT, EDIT, REJECT, ADOPT, SEND_ACK and DO_NOT_LEARN are distinct readback events',async()=>{
 const x=fixture();
 for(const action of ['SELECT','EDIT','REJECT','ADOPT','SEND_ACK','DO_NOT_LEARN']){
  const out=await x.recordFeedback(e(action));
  assert.equal(out.status,'RECORDED_NOT_LEARNED');
  assert.equal(out.persisted,true);
  assert.equal(out.action,action);
  assert.equal(out.learned,false);
  assert.equal(out.eligibleForLaterReview,!['SELECT','DO_NOT_LEARN'].includes(action));
 }
});
test('SEND_ACK must be a real W25 authoritative provider ACK, not button press',async()=>{
 await assert.rejects(fixture().recordFeedback({
   ...e('SEND_ACK'),w25Ack:{status:'PENDING',issuer:'W25_MESSAGE_DELIVERY'}}),
   /W25_REAL_PROVIDER_SEND_ACK_REQUIRED/);
 await assert.rejects(fixture({attestW25SendAck:null}).recordFeedback(e('SEND_ACK')),
   /W25_REAL_PROVIDER_SEND_ACK_REQUIRED/);
});
test('no W24 learning consent persists feedback as ineligible and NEVER learned',async()=>{
 const r=await fixture({readW24LearningConsent:async()=>false}).recordFeedback(e('EDIT'));
 assert.equal(r.persisted,true);assert.equal(r.learned,false);
 assert.equal(r.eligibleForLaterReview,false);
});
test('foreign message SHA, candidate attestor missing, corrupt readback all fail without learning',async()=>{
 await assert.rejects(fixture().recordFeedback({...e('EDIT'),originalSha256:'f'.repeat(64)}),
   /FEEDBACK_SOURCE_HASH_MISMATCH/);
 await assert.rejects(fixture({attestW43CandidateSource:null}).recordFeedback(e('EDIT')),
   /W43_CANDIDATE_SOURCE_NOT_VERIFIED/);
 await assert.rejects(fixture({readPersonaFeedback:async()=>({status:'FAILED'})})
  .recordFeedback(e('ADOPT')), /PERSONA_FEEDBACK_DURABLE_READBACK_REQUIRED/);
});

test('same natural sentence under different strategy labels cannot masquerade as diversity',async()=>{
 const x=fixture({runW43Contact:async({scope})=>{
  const r=receipt(scope,a,2);r.candidates[1].text='  MIR geht es GUT, Danke. Wie geht es dir?  ';
  return r}});
 await assert.rejects(x.onVerifiedInbound({principal:person,identity:a,mid,
  replyLanguage:'de'}),/W45_STRATEGY_OR_SOURCE_INVALID/);
});
test('user selected or current language policy mismatch cannot silently infer recipient language',async()=>{
 await assert.rejects(fixture().onVerifiedInbound({principal:person,identity:a,
  mid,replyLanguage:'pl'}),/CONTACT_NATIVE_LANGUAGE_POLICY_MISMATCH/);
});
test('actually installed approved expert version must be reflected back in W43 receipt',async()=>{
 const installed={expertId:'german-natural-chat',issuer:'W43_NATIVE_EXPERT_REGISTRY',
  installed:true,enabled:true,version:4};
 const q=fixture({
  readPersonaCurrent:async({identity})=>({...persona(identity),experts:[installed]}),
  runW43Contact:async({scope})=>({...receipt(scope,scope.identity,1),experts:[]})
 });
 await assert.rejects(q.onVerifiedInbound({principal:person,identity:a,mid,
  replyLanguage:'de'}),/W43_CONTACT_RUN_PROVENANCE_INVALID/);
});
test('without W43 reply outcome a verified contact still receives exactly zero source drafts',async()=>{
 const r=await on({runW43Contact:async()=>({status:'MODEL_UNAVAILABLE'})});
 assert.equal(r.status,'RUN_UNAVAILABLE');assert.deepEqual(r.candidates,[]);
});
test('false independent semantic claim cannot promote 3 candidates',async()=>{
 const r=await on({attestSemanticDiversity:async()=>({verified:true,
   issuer:'FAKE_EVALUATOR',runId:'fixture-agno-run-A',candidateIds:['fixture-candidate-0']})});
 assert.equal(r.candidates.length,1);
 assert.equal(r.semanticDiversity,'UNVERIFIED_REDUCED_TO_ONE');
});
test('human-approved style rule rollback during Agno Run invalidates stale contact context',async()=>{
 let reads=0;
 const r=fixture({readPersonaCurrent:async()=>{
  reads++;return {...persona(a),relationship:{...persona(a).relationship,
   currentGoal:reads===1?'回答近况':'不要聊近况'}}}});
 await assert.rejects(r.onVerifiedInbound({principal:person,identity:a,mid,
  replyLanguage:'de'}),/PERSONA_CONTEXT_CHANGED_DURING_RUN/);
});

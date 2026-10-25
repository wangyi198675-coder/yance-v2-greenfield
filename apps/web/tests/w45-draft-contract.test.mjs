import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createComposerBridge,fullK} from '../src/composer-bridge.mjs';
import {createW45DraftPort} from '../src/native-owner-bindings.mjs';
const scope=process.env.YANCE_W24_MODULE&&process.env.YANCE_W45_MODULE;
if(!scope){
 test('real W24/W45 owner modules required for W45 draft integration', {skip:'Set YANCE_W24_MODULE, YANCE_W45_MODULE'},()=>{});
}else{
 const W24=await import(pathToFileURL(process.env.YANCE_W24_MODULE).href);
 const W45=await import(pathToFileURL(process.env.YANCE_W45_MODULE).href);
 const identity={tenant:'SYNTHETIC_TEST_ONLY',account:'fixture-account-1',
    channel:'FB_PERSONAL',peer_id:'fake-w45-zh',binding_revision:1};
 const ctx={tenant:identity.tenant,principal_id:'fake-owner-1',input_domain:'CONTACT'};
 const mid='fake-w45-original-zh';
 const runId='610da3a9-f300-4d8c-95eb-283853617ac5'; // W45 real lab evidence, replayed as a DTO fixture, NOT live model.
 function setup({now=Date.now(),deadline=now+50000}={}){
   const identityConsent=new W24.IdentityConsentService();
   identityConsent.registerAccount(ctx,{...identity,principal_id:ctx.principal_id});
   identityConsent.bindPeer(ctx,identity);
   // Only test-owned, explicit fixture ports; these callbacks are NOT W43 production authority.
   const translator={translate:async args=>({status:'OK',translatedText:'Hello, how have you been recently?',
     sourceLanguage:'zh-CN',targetLanguage:args.targetLanguage,
     provenance:{kind:'LOCAL_ENGINE',provider:'W45_LAB_EVIDENCE_REPLAY_NOT_LIVE',
       requestId:'fake-w45-lab-translation',sourceMid:args.mid,inputSha256:args.inputSha256}})};
   const people=W45.createPeopleTranslationReplyService({
     translator,attestAgnoRun:run=>run.runId===runId});
   const verify=()=>({verified:true,expiresAt:deadline});
   const opts={identityConsent,trustedContext:ctx,peopleService:people,
      qualifyTranslation:verify,qualifyModelRun:verify,now:()=>now};
   return {identityConsent,people,opts};
 }
 async function addLabEvidence(people,withCandidates=true){
   const ingested=await people.ingestInbound({
     identity,mid,original:'你好，最近怎么样？',targetLanguage:'en',
     source:{kind:'SYNTHETIC_FIXTURE',fixture_id:'W45_REPLAY_NOT_SDK_EXECUTION'}});
   const run={engine:'OFFICIAL_AGNO_SDK',status:'COMPLETED',identity,sourceMid:mid,
     originalSha256:ingested.original.sha256,translationRequestId:ingested.translation.provenance.request_id,
     runId,sessionId:'fake-w45-session-replay',agentId:'w43-contact-brain',
     provider:'LLAMACPP_LOCAL_QWEN3_8B_FREE',modelId:'qwen3:8b',
     purpose:'QUALITY_EVAL',sdkPin:'3.1.10',
     candidates:withCandidates?[{id:'w45-lab-zh-1',text:'我很好，谢谢！你最近怎么样？',
       sources:[{mid,part:'ORIGINAL'}]}]:[]};
   people.acceptAgnoRun(identity,mid,run);
 }
 test('W45 actual INSERT_DRAFT_ONLY DTO fills the ONE W46 Composer draft, never posts takeover',async()=>{
   const {people,opts}=setup();await addLabEvidence(people);
   const port=createW45DraftPort(opts);
   const message=port.get(identity,mid);
   assert.equal(message.original,'你好，最近怎么样？');
   assert.equal(message.translated,'Hello, how have you been recently?');
   assert.equal(message.suggestions.length,1);
   const candidate=message.suggestions[0];
   assert.equal(candidate.provenance.runId,runId);assert.equal(candidate.id,'w45-lab-zh-1');
   assert.equal(candidate.qualityQualified,false);
   assert.equal(candidate.qualityStatus,'MODEL_QUALITY_UNREVIEWED');
   const receipt=port.draftCandidate(identity,mid,candidate.id);
   assert.equal(receipt.action,'INSERT_DRAFT_ONLY');
   assert.equal(receipt.destination,'EXISTING_BC_COMPOSER');
   assert.equal(receipt.delivery,'NOT_REQUESTED');
   const takeoverTrace=[],composer=createComposerBridge({takeoverPort:{
     get:async()=>{takeoverTrace.push('GET');throw Error('MUST_NOT_READ_DURING_DRAFT_INSERT')},
     post:async()=>{takeoverTrace.push('POST');throw Error('MUST_NOT_POST_DURING_DRAFT_INSERT')}
   }});
   composer.choose(identity);
   composer.insertW45Draft(identity,mid,candidate,receipt);
   assert.equal(composer.view().draft.text,candidate.text);
   assert.equal(composer.view().draft.provenance.candidateId,candidate.id);
   assert.equal(composer.view().draft.provenance.runId,runId);
   assert.equal(composer.view().draft.provenance.qualityStatus,'MODEL_QUALITY_UNREVIEWED');
   assert.equal(composer.view().canSend,false);
   assert.deepEqual(takeoverTrace,[]);
   assert.equal(typeof composer.send,'undefined');
 });
 test('W45 source-produced zero candidates remains zero; no filler',async()=>{
   const {people,opts}=setup();await addLabEvidence(people,false);
   assert.deepEqual(createW45DraftPort(opts).get(identity,mid).suggestions,[]);
 });
 test('W45 candidate rejected if source MID or identity K differs',async()=>{
   const {people,opts}=setup();await addLabEvidence(people);
   const port=createW45DraftPort(opts),source=port.get(identity,mid).suggestions[0];
   assert.throws(()=>port.draftCandidate(identity,'fake-wrong-mid',source.id),/UNKNOWN_K_OR_MID/);
   assert.throws(()=>port.draftCandidate({...identity,account:'fixture-other'},mid,source.id),/ACCOUNT_UNBOUND/);
   const composer=createComposerBridge();composer.choose(identity);
   const receipt=port.draftCandidate(identity,mid,source.id);
   assert.throws(()=>composer.insertW45Draft(identity,'fake-wrong-mid',source,receipt),/CANDIDATE_PROVENANCE|W45_DRAFT/);
   assert.equal(composer.view().draft.text,'');
 });
 test('expired trusted Run attestation refuses source candidates and draft insertion',async()=>{
   const now=Date.now(),{people,opts}=setup({now,deadline:now-1});
   await addLabEvidence(people);
   const port=createW45DraftPort(opts);
   assert.deepEqual(port.get(identity,mid).suggestions,[]);
   assert.throws(()=>port.draftCandidate(identity,mid,'w45-lab-zh-1'),/EXPIRED|ATTESTED/);
 });
 test('unattested Run and translation cannot be promoted by a visible model label',async()=>{
   const {people,opts}=setup();await addLabEvidence(people);
   const port=createW45DraftPort({...opts,qualifyModelRun:()=>null});
   assert.equal(port.get(identity,mid).suggestions.length,0);
   const port2=createW45DraftPort({...opts,qualifyTranslation:()=>false});
   assert.equal(port2.get(identity,mid).suggestions.length,0);
   assert.equal(port2.get(identity,mid).translated,null);
 });
 test('W45 native parser refuses wrong language, original echo, invalid JSON without suggestions',async()=>{
   const {parseW43Candidates}=await import(pathToFileURL(
     process.env.YANCE_W45_BRIDGE_MODULE).href);
   const response=(str)=>({status:'AGNO_RUN_COMPLETED',run_id:runId,original_response:str});
   const input={mid,replyLanguage:'zh-CN',sourceOriginal:'你好，最近怎么样？',
     sourceTranslation:'Hello, how have you been recently?'};
   const cases=[
     ['{"suggestions":[{"text":"Hello buddy","sources":["ORIGINAL"]}]}','MODEL_LANGUAGE_MISMATCH'],
     ['{"suggestions":[{"text":"你好，最近怎么样？","sources":["ORIGINAL"]}]}','MODEL_ORIGINAL_ECHO'],
     ['{"suggestions":[{"text":"你好","sources":["ORIGINAL"]}]} }','OUTPUT_UNSTRUCTURED']
   ];
   for(const [raw,status] of cases){
     const output=parseW43Candidates({...input,receipt:response(raw)});
     assert.equal(output.status,status);assert.deepEqual(output.candidates,[]);
   }
 });
}

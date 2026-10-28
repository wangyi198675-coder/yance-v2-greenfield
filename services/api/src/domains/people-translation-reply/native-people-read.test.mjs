import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createNativePeopleReadModel,nativeKKey} from './native-people-read.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const alice={tenant:'FIXTURE_W24_TENANT',account:'FIXTURE_ACCOUNT_A',channel:'TELEGRAM_PERSONAL',
 peer_id:'fixture-peer-A',binding_revision:'1'};
const bob={...alice,peer_id:'fixture-peer-B'};
const carol={...alice,account:'FIXTURE_ACCOUNT_B',peer_id:'fixture-peer-C'};
const K=[alice,bob,carol];
const M=[
 ['W29_FAKE_SOURCE_MID_A','Cześć, jak się masz?','tdlib-json'],
 ['W29_FAKE_SOURCE_MID_B','Guten Morgen!','tdlib-json'],
 ['W26_FAKE_SOURCE_MID_C','Hello, how are you?','mautrix-meta']
];
const principal={verified:true,source:'W54_NATIVE_CURRENT_USER',
 principalRef:'FIXTURE_NATIVE_PRINCIPAL',installationRef:'FIXTURE_NATIVE_INSTALL',
 revocationGeneration:1};
const consent=k=>({status:'AUTHORIZED',source:'W24_CURRENT_K',
 principalRef:principal.principalRef,identity:k,w24CurrentKVerified:true,
 readInboundConsent:true,accountEpoch:9,consentEpoch:4});
const inbound=(k,idx)=>({k:{tenantId:k.tenant,accountId:k.account,channel:k.channel,
 peerId:k.peer_id,bindingRevision:k.binding_revision},id:hash('W25 inbound row '+idx),
 providerMid:M[idx][0],original:M[idx][1],source:M[idx][2]});
const asTranslation=(k,mid,orig,override={})=>({status:'TRANSLATED',text:'你好，最近怎么样？',
 source_language:'pl',target_language:'zh-CN',provenance:{
   kind:'LOCAL_ENGINE',synthetic:false,provider:'EXISTING_TRANSLATOR_ENGINE',
   request_id:'W45_REAL_TEST_EXECUTION_RECEIPT',source_mid:mid,input_sha256:hash(orig),
   model_id:'existing-local-model',sdk_run_id:null,sdk_session_id:null,...override}});
const attestedTranslation=({translation,identity,mid,originalSha256,translatedSha256})=>({
 verified:true,source:'W45_ORIGINAL_TRANSLATION_EXECUTION',identity,
 sourceMid:mid,originalSha256,translatedSha256,
 provider:translation.provenance.provider,requestId:translation.provenance.request_id});
const replies=({identity,mid,originalSha256,translation})=>({
 status:'AGNO_RUN_COMPLETED',engine:'OFFICIAL_AGNO_SDK',run_id:'fake-agno-run-'+mid,
 session_id:'fake-agno-session-'+mid,provider:'LLAMACPP_LOCAL_QWEN3_8B_FREE',model_id:'qwen3:8b',
 identity,source_mid:mid,original_sha256:originalSha256,
 translation_sha256:translation.provenance?.text_sha256,
 candidates:[{id:'fake-suggestion-'+mid,text:'Dzień dobry, u mnie dobrze. A u Ciebie?',
 sources:[{mid,part:'ORIGINAL'},{mid,part:'TRANSLATION'}]}]});
const attestRun=({receipt,identity,mid,originalSha256})=>({
 verified:true,issuer:'W43_NATIVE_AGNO',nativePersisted:true,
 identity,sourceMid:mid,runId:receipt.run_id,sessionId:receipt.session_id,
 provider:receipt.provider,modelId:receipt.model_id,originalSha256});
function moduleWith(override={}){
 return createNativePeopleReadModel({
  readW24Contacts:async()=>({status:'AUTHORIZED',principalRef:principal.principalRef,
    contacts:K.map((identity,i)=>({identity,displayName:['Anna','Bernd','Carla'][i],
      w24CurrentKVerified:true,principalRef:principal.principalRef}))}),
  resolveW24Contact:async({identity})=>consent(identity),
  readW25Inbound:async({identity})=>[inbound(identity,K.findIndex(k=>nativeKKey(k)===nativeKKey(identity)))],
  readW45Translation:async({identity,mid,originalSha256})=>
    asTranslation(identity,mid,M[K.findIndex(k=>nativeKKey(k)===nativeKKey(identity))][1]),
  attestW45Translation:attestedTranslation,
  readW43ReplyCandidates:async({identity,mid,originalSha256,translation})=>
    replies({identity,mid,originalSha256,translation}),
  attestW43Run:attestRun,
  revalidateW24:async()=>true,...override});
}
test('real W47-shaped W25 and W24 source DTOs correctly join a Chinese translation and W43-cited draft',async()=>{
 const view=await moduleWith().getThread({principal,identity:alice});
 assert.equal(view.status,'READY');assert.equal(view.authoritative,true);
 assert.equal(view.canSend,false);assert.equal(view.message_count,1);
 assert.equal(view.messages[0].mid,M[0][0]);assert.equal(view.messages[0].original,M[0][1]);
 assert.equal(view.messages[0].original_sha256,hash(M[0][1]));
 assert.equal(view.messages[0].translation.status,'TRANSLATED');
 assert.equal(view.messages[0].translation.text,'你好，最近怎么样？');
 assert.equal(view.messages[0].translation.provenance.source_mid,M[0][0]);
 assert.equal(view.messages[0].suggestions.status,'CANDIDATES_PRESENT');
 assert.equal(view.messages[0].suggestions.candidates.length,1);
 assert.equal(view.messages[0].suggestions.candidates[0].sources[0].mid,M[0][0]);
 assert.equal(view.messages[0].suggestions.candidates[0].action,'DRAFT_ONLY');
 assert.equal(view.delivery,'NOT_REQUESTED');
});
test('switching contacts A→B→C→A never leaks MID, message, translation or native W43 Run',async()=>{
 const api=moduleWith();
 for(const [i,k] of [alice,bob,carol,alice].entries()){
  const o=await api.getThread({principal,identity:k});
  const n=i===3?0:i;
  assert.equal(o.messages[0].mid,M[n][0]);
  assert.equal(o.messages[0].original,M[n][1]);
  assert.equal(o.messages[0].suggestions.run_id,'fake-agno-run-'+M[n][0]);
  assert.equal(o.messages[0].suggestions.candidates[0].source_mid,M[n][0]);
 }
 assert.notEqual(nativeKKey(alice),nativeKKey(carol));
});
test('W24 signed contacts list includes only W24 results; no invented profiles or fake default',async()=>{
 const result=await moduleWith().listContacts({principal});
 assert.equal(result.status,'READY');assert.deepEqual(result.contacts.map(x=>x.displayName),
  ['Anna','Bernd','Carla']);
 assert.equal(result.canSend,false);
});
test('without verified W54 first-party native principal never calls W24/W25',async()=>{
 let accessed=false;
 const model=moduleWith({resolveW24Contact:async()=>{accessed=true;throw Error('SHOULD_NOT_CALL')}});
 const output=await model.getThread({principal:null,identity:alice});
 assert.equal(output.status,'WAITING_USER_AUTH');assert.deepEqual(output.messages,[]);
 assert.equal(accessed,false);
 assert.equal((await model.listContacts({principal:{...principal,source:'HTTP_BROWSER'}})).status,'WAITING_USER_AUTH');
});
test('unconfigured W24 or W25 native Owner ports are NOT_WIRED, not an empty verified contact',async()=>{
 const x=moduleWith({readW25Inbound:null});
 assert.equal((await x.getThread({principal,identity:alice})).status,'NOT_WIRED');
 const y=moduleWith({readW24Contacts:null});
 assert.equal((await y.listContacts({principal})).status,'NOT_WIRED');
});
test('W24 channel not authorized remains WAITING_USER_AUTH and no W25 read',async()=>{
 let called=0;
 const a=moduleWith({resolveW24Contact:async()=>({status:'WAITING_USER_AUTH'}),
 readW25Inbound:async()=>{called++;return [inbound(alice,0)]}});
 const out=await a.getThread({principal,identity:alice});
 assert.equal(out.status,'WAITING_USER_AUTH');assert.equal(called,0);
 assert.deepEqual(out.messages,[]);
});
test('missing original W45 engine receipt never prints a fabricated Chinese translation or model draft',async()=>{
 const a=moduleWith({readW45Translation:null,readW43ReplyCandidates:null});
 const out=await a.getThread({principal,identity:alice});
 assert.equal(out.messages[0].translation.status,'UNAVAILABLE');
 assert.equal(out.messages[0].translation.text,null);
 assert.deepEqual(out.messages[0].suggestions.candidates,[]);
});
test('translator claim without independent W45 execution attestation is not translated content',async()=>{
 const out=await moduleWith({attestW45Translation:null}).getThread({principal,identity:alice});
 assert.equal(out.messages[0].translation.status,'UNAVAILABLE');
 assert.equal(out.messages[0].translation.text,null);
 assert.equal(out.messages[0].suggestions.status,'SOURCE_UNVERIFIED');
});
test('wrong native translator MID, source hash and synthetic text never appear as verified Chinese',async()=>{
 for(const provenance of [{source_mid:'OTHER_MID'}, {input_sha256:'0'.repeat(64)},
  {synthetic:true},{kind:'SYNTHETIC_FIXTURE'}, {request_id:''}]){
  const out=await moduleWith({readW45Translation:async({identity,mid})=>
    asTranslation(identity,mid,M[0][1],provenance)}).getThread({principal,identity:alice});
  assert.equal(out.messages[0].translation.status,'UNAVAILABLE');
  assert.equal(out.messages[0].translation.text,null);
 }
});
test('model suggestion never accepted from a standalone string or unsigned arbitrary Run',async()=>{
 const out=await moduleWith({attestW43Run:null}).getThread({principal,identity:alice});
 assert.equal(out.messages[0].suggestions.status,'RUN_UNAVAILABLE');
 assert.equal(out.messages[0].suggestions.candidates.length,0);
});
test('Agno wrong MID, wrong K, Run/session proof and wrong translation sha all fail closed',async()=>{
 const overrides=[
   {source_mid:'fake-other'},
   {identity:{...alice,peer_id:'fake-other'}},
   {original_sha256:'wrong-hash'},
   {translation_sha256:'bad'},
   {candidates:[{id:'fake-a',text:'Hello',sources:[{mid:'other',part:'TRANSLATION'}]}]}
 ];
 for(const update of overrides){
  const out=await moduleWith({readW43ReplyCandidates:async args=>({
   ...replies({...args,identity:args.identity}),...update
  })}).getThread({principal,identity:alice});
  assert.equal(out.messages[0].suggestions.candidates.length,0);
 }
});
test('W25 wrong account/K/peer rejects entire thread without leaking any messages',async()=>{
 for(const identity of [{...alice,account:'WRONG_ACCOUNT'}, {...alice,peer_id:'WRONG_PEER'},
    {...alice,binding_revision:'2'}]){
  const api=moduleWith({readW25Inbound:async()=>[inbound(identity,0)]});
  await assert.rejects(api.getThread({principal,identity:alice}),/W25_NATIVE_INBOUND_SOURCE_UNVERIFIED/);
 }
});
test('W25 forged physical row proof, duplicated MID and wrong channel source are denied',async()=>{
 for(const rows of [
    [{...inbound(alice,0),id:'not-hash'}],
    [{...inbound(alice,0),source:'UNAUTHORIZED_PROVIDER'}],
    [inbound(alice,0),inbound(alice,0)]
 ]){
  await assert.rejects(moduleWith({readW25Inbound:async()=>rows})
   .getThread({principal,identity:alice}),/W25_NATIVE_INBOUND_SOURCE_UNVERIFIED/);
 }
});
test('W24 revocation during awaited provider read denies the complete result even when W25 returned',async()=>{
 let revoked=false;
 const api=moduleWith({readW25Inbound:async()=>{revoked=true;return [inbound(alice,0)]},
  revalidateW24:async()=>!revoked});
 await assert.rejects(api.getThread({principal,identity:alice}),/W24_READ_REVOKED_DURING_AWAIT/);
});
test('stale W24 principal/account K invalidates the source before W25 access',async()=>{
 let called=false;
 const api=moduleWith({resolveW24Contact:async()=>({...consent(alice),identity:carol}),
  readW25Inbound:async()=>{called=true;return []}});
 await assert.rejects(api.getThread({principal,identity:alice}),/W24_CONTACT_AUTHORITY_NOT_VERIFIED/);
 assert.equal(called,false);
});
test('W24 duplicate contact K blocked, no duplicated contact card padding',async()=>{
 const api=moduleWith({readW24Contacts:async()=>({status:'AUTHORIZED',
 principalRef:principal.principalRef,contacts:[alice,alice].map(identity=>({
 identity,displayName:'Anna',w24CurrentKVerified:true,principalRef:principal.principalRef}))})});
 await assert.rejects(api.listContacts({principal}),/DUPLICATE_CONTACT_K/);
});
test('no actual W25 provider rows means true empty messages (not synthesized placeholders)',async()=>{
 const api=moduleWith({readW25Inbound:async()=>[]});
 const got=await api.getThread({principal,identity:alice});
 assert.equal(got.message_count,0);assert.deepEqual(got.messages,[]);
});
test('no native W43 SDK Run shows original verified inbound and text but zero model suggestions',async()=>{
 const api=moduleWith({readW43ReplyCandidates:async()=>null});
 const got=await api.getThread({principal,identity:alice});
 assert.equal(got.messages[0].original,M[0][1]);
 assert.equal(got.messages[0].suggestions.candidates.length,0);
 assert.equal(got.messages[0].suggestions.status,'RUN_UNAVAILABLE');
});

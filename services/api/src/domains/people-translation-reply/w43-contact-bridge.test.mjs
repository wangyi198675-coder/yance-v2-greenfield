import test from 'node:test';
import assert from 'node:assert/strict';
import {createPeopleTranslationReplyService,createLoopbackLibreTranslateAdapter} from './index.mjs';
import {w43ScopedIds,w43ReplyPrompt,parseW43Candidates,createW43ContactBridge,LOCAL_W43_PROVIDER,LANGUAGES} from './w43-contact-bridge.mjs';

const k=(account='fixture-account-1',peer='fake-peer-001',epoch='1')=>({
 tenant:'SYNTHETIC_TEST_ONLY',account,channel:'FB_PERSONAL',peer_id:peer,binding_revision:epoch
});
const source={kind:'SYNTHETIC_FIXTURE',fixture_id:'fixture-120'};
const texts={'zh-CN':'你好','en':'Hello','de':'Guten Tag','pl':'Dzień dobry'};
const originals={'zh-CN':'你好','en':'Hello','de':'Guten Tag','pl':'Cześć'};
const fixture=()=>({translate:async({mid,inputSha256,attempt,targetLanguage})=>({
 status:'OK',translatedText:texts[targetLanguage],sourceLanguage:'pl',targetLanguage,
 provenance:{kind:'SYNTHETIC_FIXTURE',provider:'fixture-only',requestId:mid+'-'+attempt,sourceMid:mid,inputSha256}
})});
const svc=()=>createPeopleTranslationReplyService({
 translator:fixture(),attestAgnoRun:run=>run?.native_receipt?.run_id===run?.runId
});
const receipt=(identity,content,overrides={})=>{
 const ids=w43ScopedIds(identity);
 return {status:'AGNO_RUN_COMPLETED',engine:'OFFICIAL_AGNO_SDK',sdk_pin:'3.1.10',
   provider:LOCAL_W43_PROVIDER,model_id:'qwen2.5:1.5b',space:'CONTACT',
   user_id:ids.userId,session_id:ids.sessionId,run_id:'fake-run-123',
   original_response:JSON.stringify({suggestions:content}),
   provenance:{run_id:'fake-run-123',source:LOCAL_W43_PROVIDER},
   outbound:'DISABLED',suggestions:[],...overrides};
};
const item=(text,sources=['ORIGINAL'])=>({text,sources});
const msg=(identity=k(),targetLanguage='de')=>({identity,mid:'fake-mid-1',original:originals[targetLanguage],targetLanguage,source});
async function configured({identity=k(),targetLanguage='de',suggestions=[item('Hallo, wie geht es dir?')],runOverrides={}}={}){
 const service=svc();await service.ingestInbound(msg(identity,targetLanguage));
 let calls=0;
 const bridge=createW43ContactBridge({
   service,
   runW43:async({scope,prompt,thread})=>{
     calls++;assert.equal(scope.peer_id,identity.peer_id);assert.ok(prompt.startsWith('fake-'));assert.equal(thread,'default');
     return receipt(identity,suggestions,runOverrides);
   },
   attestNativeReceipt:async({receipt:actual,scope,sourceSHA})=>{
     assert.equal(sourceSHA,'9d09121b8ba41ae73de82ec4d01add2b23e70df7');
     return actual.user_id===w43ScopedIds({...identity}).userId && scope.peer_id===identity.peer_id;
   }
 });
 return {service,bridge,get calls(){return calls;}};
}
test('locale allowlist is exactly Chinese, English, German, Polish',()=>{
 assert.deepEqual(Object.keys(LANGUAGES),['zh-CN','en','de','pl']);
 assert.throws(()=>w43ReplyPrompt({original:'hi',translation:'你好',targetLanguage:'ru'}),/UNSUPPORTED_LANGUAGE/);
});
test('fixture translation for all four languages keeps full K/MID and explicit test provenance',async()=>{
 for(const lang of Object.keys(LANGUAGES)){
   const service=svc();
   const r=await service.ingestInbound(msg(k(),lang));
   assert.equal(r.translation.text,texts[lang]);
   assert.equal(r.translation.target_language,lang);
   assert.equal(r.original.text,originals[lang]);
   assert.equal(r.mid,'fake-mid-1');
   assert.equal(r.translation.provenance.synthetic,true);
   assert.equal(r.delivery,'NOT_REQUESTED');
 }
});
test('four local LibreTranslate language codes are preserved in actual HTTP DTO',async()=>{
 for(const lang of Object.keys(LANGUAGES)){
   let body;
   const adapter=createLoopbackLibreTranslateAdapter({
     fetchImpl:async(_url,opts)=>{
       body=JSON.parse(opts.body);
       return {ok:true,json:async()=>({translatedText:'fixture-only',detectedLanguage:{language:'pl'}})};
     }
   });
   const service=createPeopleTranslationReplyService({translator:adapter});
   const r=await service.ingestInbound(msg(k(),lang));
   assert.equal(body.target,lang==='zh-CN'?'zh':lang);
   assert.equal(r.translation.target_language,lang);
   assert.equal(r.translation.provenance.kind,'LOCAL_ENGINE');
   assert.equal(r.translation.text,'fixture-only'); // Stubbed HTTP response, not model quality
 }
});
test('W43 fixture scope canonical user/session hashes isolate account, peer, epoch and thread',()=>{
 const a=w43ScopedIds(k()),b=w43ScopedIds(k('fixture-account-1','fake-peer-002'));
 assert.equal(a.userId,'w43-contact-user-c383ca141b2b1fa3ae8c4c1dab57d4be4b5c6c5453291aa391ee3481d28944a1');
 assert.equal(a.sessionId,'w43-contact-session-4695719ec60950d40dfb0fb4c2aa76a6612033ebe6371ad4f6b5d4c37c0507e1');
 assert.notEqual(a.userId,b.userId);
 assert.notEqual(a.userId,w43ScopedIds(k('fixture-account-2')).userId);
 assert.notEqual(a.sessionId,w43ScopedIds(k('fixture-account-1','fake-peer-001','2')).sessionId);
 assert.notEqual(a.sessionId,w43ScopedIds(k(),'thread-x').sessionId);
 assert.throws(()=>w43ScopedIds(k('real-account')),/W43_FIXTURE_SCOPE_REQUIRED/);
 assert.throws(()=>w43ScopedIds(k('fixture-account-1','not-fake')),/W43_FIXTURE_SCOPE_REQUIRED/);
 assert.throws(()=>w43ScopedIds(k('fixture-account-1','fake-peer-1','0')),/W43_FIXTURE_SCOPE_REQUIRED/);
});
test('verified-source DTO from model-supplied 1 candidate becomes draft only, with model receipt',async()=>{
 const {service,bridge}=await configured({});
 const result=await bridge.propose({identity:k(),mid:'fake-mid-1',targetLanguage:'de'});
 assert.equal(result.status,'CANDIDATES_PRESENT');assert.equal(result.candidates.length,1);
 assert.equal(result.model.model_id,'qwen2.5:1.5b');assert.equal(result.model.quality_qualified,false);
 assert.equal(result.candidates[0].provenance.model_id,'qwen2.5:1.5b');
 assert.equal(result.candidates[0].provenance.model_provider,LOCAL_W43_PROVIDER);
 assert.equal(result.candidates[0].provenance.run_id,'fake-run-123');
 const draft=service.draftCandidate(k(),'fake-mid-1',result.candidates[0].id);
 assert.equal(draft.action,'INSERT_DRAFT_ONLY');assert.equal(draft.delivery,'NOT_REQUESTED');
 assert.equal(typeof service.send,'undefined');
});
test('0 and 3 truly present model candidates stay 0 and 3 without template padding',async()=>{
 const zero=await configured({suggestions:[]});
 assert.equal((await zero.bridge.propose({identity:k(),mid:'fake-mid-1'})).candidates.length,0);
 const triple=await configured({suggestions:[item('Hallo'),item('Freut mich'),item('Wie läuft es?')]});
 assert.equal((await triple.bridge.propose({identity:k(),mid:'fake-mid-1'})).candidates.length,3);
});
test('malformed model content, duplicate proposals, excess count return zero and never display old drafts',async()=>{
 const sample=await configured();
 await sample.bridge.propose({identity:k(),mid:'fake-mid-1'});
 const initial=sample.service.getMessage(k(),'fake-mid-1').candidates;
 assert.equal(initial.length,1);
 const bad=createW43ContactBridge({service:sample.service,runW43:async()=>receipt(k(),[],{original_response:'model text not JSON'}),
   attestNativeReceipt:async()=>true});
 const r=await bad.propose({identity:k(),mid:'fake-mid-1'});
 assert.equal(r.status,'OUTPUT_UNSTRUCTURED');assert.equal(r.candidates.length,0);
 assert.equal(sample.service.getMessage(k(),'fake-mid-1').candidates.length,0);
 for(const values of [[item('one'),item('one')],[item('a'),item('b'),item('c'),item('d')],[{text:'x',sources:[]}]])
   assert.equal(parseW43Candidates({receipt:receipt(k(),values),mid:'fake-mid-1'}).candidates.length,0);
});
test('no fake success on W43 runtime error or unauthorized native receipt',async()=>{
 const s=await configured({runOverrides:{status:'LOCAL_MODEL_UNAVAILABLE_OR_RUN_FAILED'}});
 const r=await s.bridge.propose({identity:k(),mid:'fake-mid-1'});
 assert.equal(r.status,'W43_RUN_FAILED');assert.equal(r.candidates.length,0);
 const t=await configured({runOverrides:{provider:'OPENAI_PAID_API'}});
 await assert.rejects(t.bridge.propose({identity:k(),mid:'fake-mid-1'}),/W43_RECEIPT_IDENTITY_OR_PROVIDER_INVALID/);
 const u=await configured({runOverrides:{user_id:'another-contact'}});
 await assert.rejects(u.bridge.propose({identity:k(),mid:'fake-mid-1'}),/W43_RECEIPT_IDENTITY_OR_PROVIDER_INVALID/);
});
test('a missing authorized W43 attestor fails rather than accepting a merely shaped receipt',async()=>{
 const s=svc();await s.ingestInbound(msg());
 const bridge=createW43ContactBridge({service:s,runW43:async()=>receipt(k(),[item('hello')]),attestNativeReceipt:async()=>false});
 await assert.rejects(bridge.propose({identity:k(),mid:'fake-mid-1'}),/W43_NATIVE_ATTESTATION_REQUIRED/);
 assert.equal(s.getMessage(k(),'fake-mid-1').candidates.length,0);
});
test('W43 short-input limitation exposed as HOLD, not silently truncating messages',async()=>{
 const s=svc();
 await s.ingestInbound({identity:k(),mid:'fake-long',original:'a'.repeat(300),source});
 const bridge=createW43ContactBridge({service:s,runW43:async()=>{throw Error('never called');},attestNativeReceipt:async()=>true});
 assert.throws(()=>w43ReplyPrompt({original:'a'.repeat(300),translation:'你好'}),/W43_PROMPT_200_CHAR_CAP/);
 assert.throws(()=>w43ReplyPrompt({original:'a|b',translation:'你好'}),/W43_PROMPT_UNSUPPORTED_CHARACTER/);
 await assert.rejects(bridge.propose({identity:k(),mid:'fake-long'}),/W43_PROMPT_200_CHAR_CAP/);
});
test('replayed MID cannot change requested language',async()=>{
 const s=svc();await s.ingestInbound(msg(k(),'de'));
 await assert.rejects(s.ingestInbound(msg(k(),'pl')),/MID_REPLAY_CONFLICT/);
});

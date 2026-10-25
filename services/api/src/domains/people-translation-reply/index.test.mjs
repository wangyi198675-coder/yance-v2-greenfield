import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertFullK,fullKKey,createPeopleTranslationReplyService,createLoopbackLibreTranslateAdapter} from './index.mjs';

const A={tenant:'SYNTHETIC_TEST_ONLY',account:'acct-A',channel:'FB_PERSONAL',peer_id:'peer-A',binding_revision:'epoch-1'};
const B={...A,peer_id:'peer-B'};
const C={...A,account:'acct-B'};
const source={kind:'SYNTHETIC_FIXTURE',fixture_id:'fixture-120-1'};
const msg=(identity=A,mid='fake-001',original='Dzien dobry')=>({identity,mid,original,source});
const fixtureTranslator=()=>({translate:async ({mid,inputSha256,attempt})=>({
 status:'OK',translatedText:'你好',sourceLanguage:'pl',targetLanguage:'zh-CN',
 provenance:{kind:'SYNTHETIC_FIXTURE',provider:'test-fixture-only',requestId:'fixture-'+attempt,sourceMid:mid,inputSha256}
})});
const run=(identity=A,mid='fake-001',candidates=[])=>({
 engine:'OFFICIAL_AGNO_SDK',status:'COMPLETED',identity,sourceMid:mid,
 runId:'run-001',sessionId:'session-A',agentId:'agent-A',translationRequestId:'fixture-1',originalSha256:createHash('sha256').update('Dzien dobry').digest('hex'),candidates
});
const proposal=(id='p1',mid='fake-001')=>({id,text:'Guten Tag',sources:[{mid,part:'ORIGINAL'}]});
const svc=(args={})=>createPeopleTranslationReplyService({translator:fixtureTranslator(),attestAgnoRun:()=>true,...args});

test('shape preserves full tenant/account/channel/peer/binding K',()=>{
 assert.deepEqual(assertFullK(A),A);
 assert.notEqual(fullKKey({...A,peer_id:'x|y'}),fullKKey({...A,peer_id:'x',binding_revision:'y|epoch-1'}));
 assert.throws(()=>assertFullK({...A,tenant:'PRODUCTION'}),/REAL_TENANT_FORBIDDEN/);
 assert.throws(()=>assertFullK({...A,channel:'REAL_PROVIDER'}),/BAD_CHANNEL/);
 assert.throws(()=>assertFullK({...A,binding_revision:''}),/MISSING_K_binding_revision/);
});
test('synthetic source and fake MID only',async()=>{
 const s=svc();
 await assert.rejects(s.ingestInbound({...msg(),mid:'123'}),/REAL_MID_FORBIDDEN/);
 await assert.rejects(s.ingestInbound({...msg(),source:{kind:'PROVIDER',fixture_id:'x'}}),/SYNTHETIC_SOURCE_REQUIRED/);
 await assert.rejects(s.ingestInbound({...msg(),original:''}),/INVALID_ORIGINAL/);
});
test('preserves exact original, MID, full K and truthful fixture provenance',async()=>{
 const r=await svc().ingestInbound(msg());
 assert.equal(r.duplicate,false); assert.deepEqual(r.identity,A); assert.equal(r.mid,'fake-001');
 assert.equal(r.original.text,'Dzien dobry'); assert.equal(r.original.source.source_mid,undefined);
 assert.equal(r.original.source_mid,'fake-001');assert.equal(r.translation.text,'你好');
 assert.equal(r.translation.status,'FIXTURE_ONLY');assert.equal(r.translation.provenance.synthetic,true);
 assert.equal(r.translation.provenance.source_mid,r.mid);
 assert.match(r.original.sha256,/^[0-9a-f]{64}$/);
 assert.equal(r.delivery,'NOT_REQUESTED');assert.deepEqual(r.candidates,[]);
});
test('no installed translation engine fails closed without invented zh',async()=>{
 const s=createPeopleTranslationReplyService();
 const r=await s.ingestInbound(msg());
 assert.equal(r.translation.status,'UNAVAILABLE'); assert.equal(r.translation.text,null);
 assert.equal(r.translation.error_code,'LOCAL_TRANSLATOR_NOT_CONFIGURED');
 assert.deepEqual(r.candidates,[]);
 assert.equal((await s.retryTranslation(A,'fake-001')).translation.status,'UNAVAILABLE');
});
test('failed translate records sanitized failure and retry can recover',async()=>{
 let n=0;const base=fixtureTranslator();
 const s=svc({translator:{translate:async input=>{if(++n===1)throw new Error('SENSITIVE INTERNAL INFO');return base.translate(input);}}});
 const first=await s.ingestInbound(msg());assert.equal(first.translation.status,'FAILED');
 assert.equal(first.translation.attempts,1);assert.equal(first.translation.error_code,'TRANSLATOR_FAILED_OR_INVALID');
 assert.equal(JSON.stringify(first).includes('SENSITIVE INTERNAL INFO'),false);
 const next=await s.retryTranslation(A,'fake-001');
 assert.equal(next.translation.status,'FIXTURE_ONLY');assert.equal(next.translation.attempts,2);
 await assert.rejects(s.retryTranslation(A,'fake-001'),/TRANSLATION_NOT_RETRYABLE/);
});
test('rejects forged translation provenance, wrong source MID or SHA',async()=>{
 const base=fixtureTranslator();
 const r1=await svc({translator:{translate:async inp=>({...await base.translate(inp),provenance:{kind:'LOCAL_ENGINE',provider:'',requestId:'x'}})}}).ingestInbound(msg());
 assert.equal(r1.translation.status,'FAILED');
 const r2=await svc({translator:{translate:async inp=>({...await base.translate(inp),provenance:{kind:'LOCAL_ENGINE',provider:'local',requestId:'x',sourceMid:'fake-other'}})}}).ingestInbound(msg());
 assert.equal(r2.translation.status,'FAILED');
 const r3=await svc({translator:{translate:async inp=>({...await base.translate(inp),provenance:{kind:'LOCAL_ENGINE',provider:'local',requestId:'x',inputSha256:'wrong'}})}}).ingestInbound(msg());
 assert.equal(r3.translation.status,'FAILED');
});
test('same K/MID deduplicates, altered replay fails, same MID different K is isolated',async()=>{
 const s=svc();await s.ingestInbound(msg());const second=await s.ingestInbound(msg());
 assert.equal(second.duplicate,true);
 await assert.rejects(s.ingestInbound(msg(A,'fake-001','tampered')),/MID_REPLAY_CONFLICT/);
 const peer=await s.ingestInbound(msg(B));assert.deepEqual(peer.identity,B);
 const account=await s.ingestInbound(msg(C));assert.deepEqual(account.identity,C);
 assert.deepEqual(s.getMessage(A,'fake-001').identity,A);
 assert.throws(()=>s.getMessage({...A,peer_id:'unknown'},'fake-001'),/UNKNOWN_K_OR_MID/);
});
test('concurrent duplicate waits for same in-flight result instead of double translate',async()=>{
 let resolve;let calls=0;
 const translator={translate:async input=>{calls++;return new Promise(r=>{resolve=()=>r({status:'OK',translatedText:'你好',sourceLanguage:'pl',targetLanguage:'zh-CN',provenance:{kind:'SYNTHETIC_FIXTURE',provider:'fixture',requestId:'r'}});});}};
 const s=svc({translator}),first=s.ingestInbound(msg()),second=s.ingestInbound(msg());
 await Promise.resolve();assert.equal(calls,1);resolve();
 const [a,b]=await Promise.all([first,second]);assert.equal(a.duplicate,false);assert.equal(b.duplicate,true);
 assert.equal(b.translation.status,'FIXTURE_ONLY');
});
test('Agno unavailable never creates candidates or fills template suggestions',async()=>{
 const s=createPeopleTranslationReplyService({translator:fixtureTranslator()});
 await s.ingestInbound(msg());
 assert.throws(()=>s.acceptAgnoRun(A,'fake-001',run(A,'fake-001',[proposal()])),/OFFICIAL_AGNO_RUN_NOT_VERIFIED/);
 assert.deepEqual(s.getMessage(A,'fake-001').candidates,[]);
});
test('not even fixture-attested Agno run accepted if translation failed',async()=>{
 const s=svc({translator:null});await s.ingestInbound(msg());
 assert.throws(()=>s.acceptAgnoRun(A,'fake-001',run()),/TRANSLATION_NOT_READY/);
});
test('consumes ONLY supplied 0, 1, or 3 attested Run candidates, with real source IDs',async()=>{
 const s=svc();await s.ingestInbound(msg());
 assert.deepEqual(s.acceptAgnoRun(A,'fake-001',run()).candidates,[]);
 const one=s.acceptAgnoRun(A,'fake-001',run(A,'fake-001',[proposal()]));
 assert.equal(one.candidates.length,1);
 assert.equal(one.candidates[0].provenance.run_id,'run-001');
 assert.deepEqual(one.candidates[0].provenance.sources,[{mid:'fake-001',part:'ORIGINAL'}]);
 const three=s.acceptAgnoRun(A,'fake-001',run(A,'fake-001',[proposal('p1'),proposal('p2'),proposal('p3')]));
 assert.equal(three.candidates.length,3);assert.equal(three.candidates[2].id,'p3');
});
test('rejects 4 candidate padding, duplicated IDs and absent source',async()=>{
 const s=svc();await s.ingestInbound(msg());
 assert.throws(()=>s.acceptAgnoRun(A,'fake-001',run(A,'fake-001',['p1','p2','p3','p4'].map(x=>proposal(x)))),/AGNO_CANDIDATES_COUNT_INVALID/);
 assert.throws(()=>s.acceptAgnoRun(A,'fake-001',run(A,'fake-001',[proposal(),proposal()])),/AGNO_CANDIDATE_INVALID/);
 assert.throws(()=>s.acceptAgnoRun(A,'fake-001',run(A,'fake-001',[{id:'p1',text:'hello',sources:[]}])),/AGNO_CITATION_INVALID/);
 assert.deepEqual(s.getMessage(A,'fake-001').candidates,[]);
});
test('rejects cross-account, cross-peer, cross-MID, and missing SDK trace',async()=>{
 const s=svc();await s.ingestInbound(msg());
 assert.throws(()=>s.acceptAgnoRun(A,'fake-001',run(B,'fake-001',[proposal()])),/AGNO_K_MID_MISMATCH/);
 assert.throws(()=>s.acceptAgnoRun(A,'fake-001',run(C,'fake-001',[proposal()])),/AGNO_K_MID_MISMATCH/);
 assert.throws(()=>s.acceptAgnoRun(A,'fake-001',run(A,'fake-another',[proposal()])),/AGNO_K_MID_MISMATCH/);
 assert.throws(()=>s.acceptAgnoRun(A,'fake-001',run(A,'fake-001',[proposal('p1','fake-other')])),/AGNO_CITATION_INVALID/);
 assert.throws(()=>s.acceptAgnoRun(A,'fake-001',{...run(),sessionId:''}),/AGNO_TRACE_REQUIRED/);
 assert.throws(()=>s.acceptAgnoRun(A,'fake-001',{...run(),translationRequestId:'old-attempt'}),/AGNO_STALE_TRANSLATION_OR_ORIGINAL/);
 assert.throws(()=>s.acceptAgnoRun(A,'fake-001',{...run(),originalSha256:'other'}),/AGNO_STALE_TRANSLATION_OR_ORIGINAL/);
});
test('draft handoff is only existing B+C Composer; no sender exists',async()=>{
 const s=svc();await s.ingestInbound(msg());s.acceptAgnoRun(A,'fake-001',run(A,'fake-001',[proposal()]));
 const draft=s.draftCandidate(A,'fake-001','p1');
 assert.equal(draft.action,'INSERT_DRAFT_ONLY'); assert.equal(draft.destination,'EXISTING_BC_COMPOSER');
 assert.equal(draft.delivery,'NOT_REQUESTED'); assert.equal(draft.text,'Guten Tag');
 assert.equal(typeof s.send,'undefined');
 assert.throws(()=>s.draftCandidate(B,'fake-001','p1'),/UNKNOWN_K_OR_MID/);
 assert.throws(()=>s.draftCandidate(A,'fake-001','missing'),/CANDIDATE_NOT_FOUND_FOR_K_MID/);
});
test('readonly snapshots are detached from service internal state',async()=>{
 const s=svc();const r=await s.ingestInbound(msg());r.identity.peer_id='tampered';r.translation.text='fake';
 const retrieved=s.getMessage(A,'fake-001');assert.deepEqual(retrieved.identity,A);assert.equal(retrieved.translation.text,'你好');
});
test('local adapter strictly forbids remote HTTP / credentials / query',()=>{
 for(const endpoint of ['https://127.0.0.1:5000/translate','http://example.com/translate','http://user:pass@localhost:5000/translate','http://localhost:5000/translate?api_key=x'])
 assert.throws(()=>createLoopbackLibreTranslateAdapter({endpoint}),/NON_LOOPBACK_TRANSLATOR_FORBIDDEN/);
});
test('loopback LibreTranslate transport passes exact text and records LOCAL_ENGINE provenance',async()=>{
 let call;
 const adapter=createLoopbackLibreTranslateAdapter({fetchImpl:async (url,options)=>{
   call={url,options};
   return {ok:true,json:async()=>({translatedText:'早上好',detectedLanguage:{language:'pl'}})};
 }});
 const s=svc({translator:adapter}),result=await s.ingestInbound(msg());
 assert.equal(call.url,'http://127.0.0.1:5000/translate');
 assert.equal(call.options.redirect,'error');
 assert.deepEqual(JSON.parse(call.options.body),{q:'Dzien dobry',source:'auto',target:'zh',format:'text'});
 assert.equal(result.translation.status,'TRANSLATED');assert.equal(result.translation.text,'早上好');
 assert.equal(result.translation.provenance.provider,'LibreTranslate(loopback)');
 assert.equal(result.translation.provenance.synthetic,false);
});
test('unavailable local server errors cannot create made-up translation',async()=>{
 const adapter=createLoopbackLibreTranslateAdapter({fetchImpl:async()=>{throw Error('Connection refused');}});
 const r=await svc({translator:adapter}).ingestInbound(msg());
 assert.equal(r.translation.status,'FAILED');assert.equal(r.translation.text,null);
 assert.deepEqual(r.candidates,[]);
});

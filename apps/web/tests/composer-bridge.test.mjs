import test from 'node:test';
import assert from 'node:assert/strict';
import {fullK,synthetic,createComposerBridge} from '../src/composer-bridge.mjs';
import {createLoopbackTakeoverPort} from '../src/native-takeover-port.mjs';
const A={tenant:'SYNTHETIC_TEST_ONLY',account:'fixture-account-1',channel:'FB_PERSONAL',
  peer_id:'fake-peer-001',binding_revision:1};
const B={...A,peer_id:'fake-peer-004'};
const C={...A,account:'fixture-account-2',channel:'WHATSAPP_PERSONAL',peer_id:'fake-peer-001'};
function mockPort(custom={}){
 const trace=[],modes=new Map(),epochs=new Map();
 const get=async id=>{
   trace.push('GET '+fullK(id));
   if(custom.get) return custom.get(id,trace);
   return {identity:id,mode:modes.get(fullK(id))||'AUTO',
     epoch:epochs.get(fullK(id))||1,accountActive:true,canTakeover:true};
 };
 const post=async(id,request)=>{
   trace.push('POST '+fullK(id));
   if(custom.post)return custom.post(id,request,trace);
   modes.set(fullK(id),'HUMAN');epochs.set(fullK(id),request.expectedEpoch+1);
   return {accepted:true};
 };
 return {trace,get,post};
}
test('canonical K protects five dimensions, channel and delimiters',()=>{
 assert.notEqual(fullK(A),fullK(B));assert.notEqual(fullK(A),fullK(C));
 assert.throws(()=>fullK({...A,account:'a|b'}),/INVALID_K_account/);
 assert.throws(()=>fullK({...A,channel:'FAKE'}),/INVALID_CHANNEL/);
 assert.throws(()=>fullK({...A,binding_revision:null}),/INVALID_K_binding_revision/);
});
test('nonproduction firewall rejects actual tenant/accounts/peers',()=>{
 assert.equal(synthetic(A),fullK(A));
 for(const id of [{...A,tenant:'prod'},{...A,account:'real-account'},
   {...A,peer_id:'123456789'}]) assert.throws(()=>synthetic(id),/LIVE_IDENTITY_FORBIDDEN/);
});
test('port absent => unavailable; never fake authorization, send or Agent Run',async()=>{
 const bridge=createComposerBridge();bridge.choose(A);
 const r=await bridge.userAction(A,'TYPE',{text:'草稿'});
 assert.equal(r.status,'UNAVAILABLE');assert.equal(bridge.view().draft.text,'草稿');
 assert.equal(r.canSend,false);assert.equal(typeof bridge.send,'undefined');
});
test('focus and reselect preserve draft without GET/POST or human takeover',()=>{
 const p=mockPort(),b=createComposerBridge({takeoverPort:p});
 b.choose(A);b.choose(B);b.choose(A);
 assert.deepEqual(p.trace,[]);assert.equal(b.view().status,'UNAVAILABLE');
});
test('read-only inspect is GET-only and reports AUTO',async()=>{
 const p=mockPort(),b=createComposerBridge({takeoverPort:p});b.choose(A);
 assert.equal((await b.inspect(A)).status,'READ_ONLY_AUTO');
 assert.equal(p.trace.length,1);assert.ok(p.trace[0].startsWith('GET'));
});
test('real typing performs GET -> POST -> GET and verifies HUMAN, never sends',async()=>{
 const p=mockPort(),b=createComposerBridge({takeoverPort:p});b.choose(A);
 const out=await b.userAction(A,'TYPE',{text:'你好'});
 assert.equal(out.status,'READY_HUMAN');assert.equal(out.canSend,false);
 assert.deepEqual(p.trace.map(s=>s.slice(0,4)),['GET ','POST','GET ']);
 assert.equal(b.view().draft.text,'你好');assert.equal(out.verifiedEpoch,2);
});
test('already HUMAN gets status twice without a redundant POST',async()=>{
 const p=mockPort({get:async id=>({identity:id,mode:'HUMAN',epoch:4,
   accountActive:true,canTakeover:true})});
 const b=createComposerBridge({takeoverPort:p});b.choose(A);
 assert.equal((await b.userAction(A,'IME_COMMIT',{text:'中文'})).status,'READY_HUMAN');
 assert.equal(p.trace.filter(x=>x.startsWith('POST')).length,0);
});
test('revoked/unqualified GET fails closed before POST',async()=>{
 const p=mockPort({get:async id=>({identity:id,mode:'AUTO',epoch:1,
   accountActive:false,canTakeover:true})});
 const b=createComposerBridge({takeoverPort:p});b.choose(A);
 assert.equal((await b.userAction(A,'PASTE',{text:'draft'})).status,'BLOCKED');
 assert.equal(p.trace.filter(x=>x.startsWith('POST')).length,0);
});
test('identity rebind mismatch fails closed before POST',async()=>{
 const p=mockPort({get:async id=>({identity:{...id,binding_revision:2},mode:'AUTO',
   epoch:1,accountActive:true,canTakeover:true})});
 const b=createComposerBridge({takeoverPort:p});b.choose(A);
 const out=await b.userAction(A,'TYPE',{text:'draft'});
 assert.equal(out.status,'BLOCKED');assert.match(out.reason,/IDENTITY_MISMATCH/);
 assert.equal(p.trace.filter(x=>x.startsWith('POST')).length,0);
});
test('POST accepted then GET still AUTO: do not claim HUMAN',async()=>{
 const p=mockPort({post:async()=>({accepted:true})});
 const b=createComposerBridge({takeoverPort:p});b.choose(A);
 assert.equal((await b.userAction(A,'TYPE',{text:'draft'})).status,'BLOCKED');
 assert.equal(p.trace.length,3);
});
test('POST rejection/exception => BLOCKED, keep local unsent draft',async()=>{
 const p=mockPort({post:async()=>({accepted:false})});
 const b=createComposerBridge({takeoverPort:p});b.choose(A);
 const out=await b.userAction(A,'TYPE',{text:'keep'});
 assert.match(out.reason,/POST_REJECTED/);assert.equal(b.view().draft.text,'keep');
 assert.equal(out.canSend,false);
});
test('concurrent same-K edits coalesce, preserve latest draft',async()=>{
 const p=mockPort(),b=createComposerBridge({takeoverPort:p});b.choose(A);
 const [a,c]=await Promise.all([
   b.userAction(A,'TYPE',{text:'1'}),b.userAction(A,'TYPE',{text:'12'})]);
 assert.equal(a.status,'READY_HUMAN');assert.equal(c.status,'READY_HUMAN');
 assert.equal(p.trace.filter(x=>x.startsWith('POST')).length,1);
 assert.equal(b.view().draft.text,'12');
});
test('other contact remains isolated while A takeover pending',async()=>{
 let resume;const barrier=new Promise(resolve=>{resume=resolve});
 const p=mockPort({get:async id=>{
   if(fullK(id)===fullK(A))await barrier;
   return {identity:id,mode:'HUMAN',epoch:3,accountActive:true,canTakeover:true};
 }});
 const b=createComposerBridge({takeoverPort:p});b.choose(A);
 const ongoing=b.userAction(A,'TYPE',{text:'A draft'});
 b.choose(B);const result=await b.userAction(B,'TYPE',{text:'B draft'});
 assert.equal(result.status,'READY_HUMAN');
 resume();await ongoing;
 assert.equal(b.view().key,fullK(B));assert.equal(b.view().draft.text,'B draft');
 b.choose(A);assert.equal(b.view().draft.text,'A draft');
});
test('sourced suggestions exactly 0..3; adopt only fills draft without takeover',()=>{
 const p=mockPort(),b=createComposerBridge({takeoverPort:p});b.choose(A);
 const row=n=>({id:'candidate-'+n,text:'reply-'+n,
   provenance:{kind:'AGNO_RUN',runId:'run-'+n,sourceMid:'fake-mid-1',identityKey:fullK(A)}});
 for(let n=0;n<=3;n++)assert.equal(b.candidates(A,'fake-mid-1',
   Array.from({length:n},(_,i)=>row(i))).length,n);
 assert.throws(()=>b.candidates(A,'fake-mid-1',Array.from({length:4},(_,i)=>row(i))),/CANDIDATE_COUNT/);
 assert.throws(()=>b.candidates(A,'fake-mid-1',[{...row(0),provenance:{kind:'MOCK'}}]),/CANDIDATE_PROVENANCE/);
 b.adoptCandidate(A,row(0),'fake-mid-1');assert.equal(b.view().draft.text,'reply-0');
 assert.equal(p.trace.length,0);
});
test('quote must carry same full K and immutable source MID',()=>{
 const b=createComposerBridge();b.choose(A);
 assert.throws(()=>b.quote(A,{identityKey:fullK(B),mid:'fake-mid-1',original:'x'}),/QUOTE_FULL_K/);
 b.quote(A,{identityKey:fullK(A),mid:'fake-mid-1',original:'Hallo',zh:'你好'});
 assert.equal(b.view().draft.quote.mid,'fake-mid-1');
});
test('attach/drop/voice are user actions; attachments metadata validated',async()=>{
 const p=mockPort(),b=createComposerBridge({takeoverPort:p});b.choose(A);
 assert.equal((await b.userAction(A,'ATTACH',{attachments:[{name:'test.png',size:25}]})).status,'READY_HUMAN');
 assert.equal(b.view().draft.attachments.length,1);
 assert.equal((await b.userAction(A,'SEND_ATTEMPT')).canSend,false);
 await assert.rejects(()=>b.userAction(A,'DROP',{attachments:[{name:'bad',size:-1}]}),/BAD_ATTACHMENT/);
});
test('loopback adapter must be disabled by default, never accept external origin',()=>{
 assert.throws(()=>createLoopbackTakeoverPort({baseUrl:'http://127.0.0.1:7777',endpoints:{get:'/x',post:'/y'}}),/NATIVE_PORT_DISABLED/);
 assert.throws(()=>createLoopbackTakeoverPort({enabled:true,baseUrl:'https://api.example.com',endpoints:{get:'/x',post:'/y'}}),/LOOPBACK_ONLY/);
 assert.throws(()=>createLoopbackTakeoverPort({enabled:true,baseUrl:'http://localhost:7777',endpoints:{get:'https://evil',post:'/y'}}),/OWNER_ENDPOINTS_REQUIRED/);
});
test('loopback contract uses exact owner-supplied routes and synthetic key',async()=>{
 const calls=[];
 const fake=async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>({accepted:true})}};
 const port=createLoopbackTakeoverPort({enabled:true,baseUrl:'http://127.0.0.1:7777',
   endpoints:{get:'/identity',post:'/takeover'},fetchImpl:fake});
 await port.get(A);await port.post(A,{expectedEpoch:8});
 assert.equal(calls.length,2);assert.ok(calls[0].url.includes('/identity?k='));
 assert.ok(calls[1].url.endsWith('/takeover'));assert.equal(calls[1].opts.credentials,'omit');
 assert.equal(JSON.parse(calls[1].opts.body).expectedEpoch,8);
});

test('same MID from different account must not populate candidate',()=>{
 const b=createComposerBridge();b.choose(C);
 const row={id:'c1',text:'private reply',provenance:{
   kind:'AGNO_RUN',runId:'real-run-contract',sourceMid:'fake-mid-1',identityKey:fullK(A)}};
 assert.throws(()=>b.adoptCandidate(C,row,'fake-mid-1'),/CANDIDATE_PROVENANCE/);
 assert.equal(b.view().draft.text,'');
});
test('stale epoch after POST accepted is not a verified human takeover',async()=>{
 const p=mockPort({get:async id=>({identity:id,mode:p.trace.length>=3?'HUMAN':'AUTO',
   epoch:1,accountActive:true,canTakeover:true}),
   post:async()=>({accepted:true})});
 const b=createComposerBridge({takeoverPort:p});b.choose(A);
 assert.equal((await b.userAction(A,'TYPE',{text:'human'})).status,'BLOCKED');
});
test('rebind after POST must fail final GET, never allow send',async()=>{
 let calls=0;
 const p=mockPort({get:async id=>{
   calls++;return {identity:calls===1?id:{...id,binding_revision:2},
     mode:calls===1?'AUTO':'HUMAN',epoch:calls,accountActive:true,canTakeover:true};
 },post:async()=>({accepted:true})});
 const b=createComposerBridge({takeoverPort:p});b.choose(A);
 const out=await b.userAction(A,'TYPE',{text:'safe'});
 assert.equal(out.status,'BLOCKED');assert.equal(out.canSend,false);
});

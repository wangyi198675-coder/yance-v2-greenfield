import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {createLocalSessionAuthority,createLocalSessionHttpApi} from './local-session.mjs';
import {createPrivateBrainHttp} from './private-brain-http.mjs';
import {createW43PythonPrivatePort} from './private-python-port.mjs';
const origin='http://127.0.0.1:49091';
const mkCode=()=>randomBytes(32).toString('hex');
const modelReceipt=(threadId='personal')=>({status:'COMPLETED',threadId,
 runId:'actual-w43-owner-run-0001',sessionId:'actual-w43-owner-private-session-0001',
 modelProvider:'LLAMACPP_LOCAL_QWEN3_8B_FREE',modelId:'qwen3:8b',
 assistantText:'TEST_ONLY_MODEL_RESULT',qualityQualified:false,canSend:false});
const historyReceipt=(threadId='personal')=>({status:'HISTORY_PRESENT',threadId,
 sessionId:'actual-w43-owner-private-session-0001',runCount:1,completeTurnCount:1,
 messages:[{role:'user',content:'TEST QUESTION',run_id:'native-test-run'},
  {role:'assistant',content:'TEST_ONLY_MODEL_RESULT',run_id:'native-test-run'}],
 qualityQualified:false,canSend:false});
const profile=(principalRef='W54TEST-REALUSER-PRINCIPAL-A')=>({
 source:'W54_NATIVE_CURRENT_USER',verified:true,principalRef,
 installationRef:'W54TEST-INSTALL-001',appLocalDataRoot:'C:\\TEST_ONLY_APPDATA\\Yance',
 modelBackend:'llamacpp',modelId:'qwen3:8b',modelSelectionEpoch:1
});
function ledger(){
 // Explicit TEST-ONLY map of the W43 API, not a production durable store.
 const rows=new Map();
 const identity=({context,threadId,requestId})=>
  [context.serverScope.installationRef,context.serverScope.principalRef,threadId,requestId].join('|');
 return {
  count:()=>rows.size,
  claim:async(args)=>{
   const key=identity(args),payloadHash=args.text;
   const r=rows.get(key);
   if(r&&r.payloadHash!==payloadHash)return {state:'CONFLICT'};
   if(r)return {state:r.state,receipt:r.receipt};
   rows.set(key,{state:'IN_PROGRESS',payloadHash});
   return {state:'CLAIMED'};
  },
  finish:async(args)=>{
   const key=identity(args),r=rows.get(key);
   if(!r||r.payloadHash!==args.text)throw Error('NO_LEDGER_CLAIM');
   rows.set(key,{state:'COMPLETED',payloadHash:args.text,receipt:args.receipt});
  },
  markUnknown:async(args)=>rows.set(identity(args),{state:'UNKNOWN',payloadHash:args.text}),
  reconcile:async(args)=>{
   const r=rows.get(identity(args));
   return r?.state==='COMPLETED'?{state:'COMPLETED',receipt:r.receipt}:{state:'UNKNOWN'};
  }
 };
}
async function api({enabled=true,profileProvider=null,w43Port=null,requestLedger=null,
 signedModelSelection=null}={}){
 const pairingCode=mkCode();
 const authority=createLocalSessionAuthority({approvePairing:enabled?async value=>value===pairingCode:null});
 const local=createLocalSessionHttpApi({authority,webOrigin:origin});
 const privateApi=createPrivateBrainHttp({sessionAuthority:authority,webOrigin:origin,
  resolveNativePrincipal:profileProvider,w43Port,requestLedger,
  resolveSignedModelSelection:signedModelSelection});
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname.startsWith('/api/v2/local-session/'))return void(await local(req,res,url));
  if(url.pathname.startsWith('/api/v2/private-brain/'))return void(await privateApi(req,res,url));
  res.writeHead(404);res.end('{}');
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+server.address().port;
 async function request(path,{cookie,csrf,method='GET',originValue=origin,body}={}){
  const headers={Origin:originValue};
  if(cookie)headers.Cookie=cookie;
  if(csrf)headers['X-Yance-CSRF']=csrf;
  if(body!==undefined)headers['Content-Type']='application/json';
  const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};
 }
 async function pair(){
  const r=await request('/api/v2/local-session/redeem',{method:'POST',body:{pairingCode}});
  assert.equal(r.status,200);
  return {cookie:r.cookie.split(';')[0],csrf:r.data.csrfToken};
 }
 return {request,pair,authority,close:()=>new Promise(ok=>server.close(ok))};
}
const post=(b,s,p={threadId:'personal',text:'Hello private model',requestId:'request_valid_001'})=>
 b.request('/api/v2/private-brain/turn',{method:'POST',cookie:s.cookie,csrf:s.csrf,body:p});
test('unpaired, fake cookie, revoked, expired Session always 401 before W43 calls',async()=>{
 let models=0;
 const b=await api({profileProvider:async()=>profile(),w43Port:{turn:async()=>{models++;return modelReceipt()},history:async()=>{models++;return historyReceipt()}},requestLedger:ledger()});
 try{
  assert.equal((await b.request('/api/v2/private-brain/history')).status,401);
  assert.equal((await b.request('/api/v2/private-brain/turn',{method:'POST',body:{text:'Hi',requestId:'request_valid_001'}})).status,401);
  assert.equal((await b.request('/api/v2/private-brain/history',{cookie:'yance_local_session='+mkCode()})).status,401);
  const s=await b.pair();
  b.authority.revokeAll();
  assert.equal((await b.request('/api/v2/private-brain/history',{cookie:s.cookie})).status,401);
  assert.equal(models,0);
 }finally{await b.close()}
});
test('valid local Session still fails 503 without signed W54 profile, W43 port and durable ledger',async()=>{
 const sledger=ledger();const base=await api();
 try{const s=await base.pair();assert.equal((await post(base,s)).status,503);
  assert.equal((await base.request('/api/v2/private-brain/history',{cookie:s.cookie})).status,503)}
 finally{await base.close()}
 const w54=await api({profileProvider:async()=>profile()});
 try{const s=await w54.pair();assert.equal((await post(w54,s)).data.error,'W43_ORIGINAL_PRIVATE_PORT_MISSING')}
 finally{await w54.close()}
 const w43=await api({profileProvider:async()=>profile(),w43Port:{
  turn:async()=>modelReceipt(),history:async()=>historyReceipt()}});
 try{const s=await w43.pair();
  assert.equal((await post(w43,s)).data.error,'DURABLE_REQUEST_REPLAY_FENCE_MISSING');
  assert.equal((await w43.request('/api/v2/private-brain/history',{cookie:s.cookie})).status,200)}
 finally{await w43.close()}
});
test('W43 canonical DTO rejects old message/thread and browser identity/path overrides',async()=>{
 const b=await api({profileProvider:async()=>profile(),w43Port:{
 turn:async()=>modelReceipt(),history:async()=>historyReceipt()},requestLedger:ledger()});
 try{
  const s=await b.pair();
  for(const x of [
   {message:'legacy',thread:'personal'},{text:'x',threadId:'personal'},
   {text:'x',threadId:'personal',requestId:'request_valid_001',actor:'admin'},
   {text:'x',requestId:'request_valid_001',sid:'S-1-5-21'},
   {text:'x',requestId:'request_valid_001',dbPath:'C:/private.sqlite'},
   {text:'x',requestId:'request_valid_001',principalRef:'other'},
   {text:'x',requestId:'bad'},{text:'x',requestId:'request_valid_001',threadId:'../escape'},
   {text:'',requestId:'request_valid_001'}
  ])assert.equal((await post(b,s,x)).status,422,JSON.stringify(x));
  for(const q of ['?thread=personal','?principalRef=other','?threadId=../x','?threadId=a&threadId=b'])
   assert.equal((await b.request('/api/v2/private-brain/history'+q,{cookie:s.cookie})).status,422);
  assert.equal((await b.request('/api/v2/private-brain/turn',{method:'POST',cookie:s.cookie,
   body:{text:'x',requestId:'request_valid_001'}})).status,403);
  assert.equal((await b.request('/api/v2/private-brain/history',{cookie:s.cookie,
   originValue:'https://evil.example'})).status,403);
 }finally{await b.close()}
});
test('W43 original field shape, shared requestId reply and history shape plus identity isolation',async()=>{
 let calls=0;const seen=[];
 const w43={turn:async(ctx,thread,text,requestId)=>{
  calls++;seen.push({ctx,thread,text,requestId});return modelReceipt(thread)},
  history:async(ctx,thread)=>{seen.push({ctx,thread});return historyReceipt(thread)}};
 const store=ledger();
 const b=await api({profileProvider:async()=>profile(),w43Port:w43,requestLedger:store});
 try{
  const s=await b.pair();
  const first=await post(b,s);
  assert.equal(first.status,200);assert.equal(first.data.status,'COMPLETED');
  assert.equal(first.data.requestId,'request_valid_001');assert.equal(first.data.assistantText,'TEST_ONLY_MODEL_RESULT');
  assert.equal(first.data.qualityQualified,false);assert.equal(first.data.canSend,false);
  assert.equal(first.data.replayed,false);
  const cached=await post(b,s);
  assert.equal(cached.status,200);assert.equal(cached.data.replayed,true);assert.equal(calls,1);
  const conflict=await post(b,s,{threadId:'personal',text:'Different answer text',requestId:'request_valid_001'});
  assert.equal(conflict.status,409);assert.equal(calls,1);
  const hist=await b.request('/api/v2/private-brain/history?threadId=personal',{cookie:s.cookie});
  assert.equal(hist.status,200);assert.equal(hist.data.runCount,1);
  assert.equal(hist.data.source,'W43_NATIVE_AGNO_CHAT_HISTORY');
  assert.equal(seen[0].ctx.serverScope.principalRef,profile().principalRef);
  assert.equal(seen[0].ctx.serverScope.sessionRevision,1);
  assert.equal(seen[0].ctx.serverScope.revocationGeneration,0);
  assert.equal(seen[0].ctx.serverScope.appLocalDataRoot,profile().appLocalDataRoot);
  assert.equal(seen[0].thread,'personal');assert.equal(seen[0].text,'Hello private model');
  assert.equal(seen[0].requestId,'request_valid_001');
 }finally{await b.close()}
});
test('UNKNOWN, IN_PROGRESS and failure paths never duplicate native Run',async()=>{
 let count=0;
 const store=ledger();
 const bridge={turn:async()=>{count++;throw Error('SDK temporary unknown')},history:async()=>historyReceipt()};
 const b=await api({profileProvider:async()=>profile(),w43Port:bridge,requestLedger:store});
 try{
  const s=await b.pair();
  assert.equal((await post(b,s)).status,503);
  assert.equal((await post(b,s)).data.error,'REQUEST_OUTCOME_UNKNOWN_RECONCILIATION_REQUIRED');
  assert.equal(count,1);
  assert.equal(store.count(),1);
 }finally{await b.close()}
});
test('revocation or Principal generation rotation during awaited Agno Run prevents release',async()=>{
 let unlock,entered;const enteredModel=new Promise(ok=>entered=ok),slow=new Promise(ok=>unlock=ok);
 let current=profile();
 const store=ledger();
 const b=await api({profileProvider:async()=>current,
 w43Port:{turn:async(_ctx,thread)=>{entered();await slow;return modelReceipt(thread)},history:async()=>historyReceipt()},
 requestLedger:store});
 try{
  const s=await b.pair();const pending=post(b,s);
  await enteredModel;
  current=profile('W54TEST-REALUSER-PRINCIPAL-B');
  unlock();
  const outcome=await pending;
  assert.equal(outcome.status,409);
  assert.equal(outcome.data.error,'LOCAL_SESSION_REVISION_CONFLICT');
 }finally{await b.close()}
});
test('fake SDK-shape, incorrect W43 status or synthetic history are rejected',async()=>{
 const b=await api({profileProvider:async()=>profile(),requestLedger:ledger(),
  w43Port:{turn:async()=>({...modelReceipt(),status:'SYNTHETIC_TEST_ONLY'}),
   history:async()=>({...historyReceipt(),messages:[{role:'system',content:'bad'}]})}});
 try{
  const s=await b.pair();
  assert.equal((await post(b,s)).status,503);
  assert.equal((await b.request('/api/v2/private-brain/history',{cookie:s.cookie})).status,503);
 }finally{await b.close()}
});
test('native Python bridge cannot be configured from browser or relative/unverified paths',()=>{
 assert.throws(()=>createW43PythonPrivatePort(),/W43_OWNER_SIGNED_PYTHON_PATHS_REQUIRED/);
 assert.throws(()=>createW43PythonPrivatePort({
  pythonExecutable:'python',w43ModuleRoot:'./fake',protectedKeyFile:'test-key'
 }),/W43_OWNER_SIGNED_PYTHON_PATHS_REQUIRED/);
});
test('signed cloud selection cannot execute original local-only W43 or create durable request claim',async()=>{
 let executes=0;
 const store=ledger();
 const b=await api({profileProvider:async()=>profile(),requestLedger:store,
  signedModelSelection:async()=>({provider:'OPENROUTER_USER_API',modelId:'openai/gpt-4o-mini'}),
  w43Port:{turn:async()=>{executes++;return modelReceipt()},history:async()=>historyReceipt()}});
 try{
  const s=await b.pair();
  const x=await post(b,s);
  assert.equal(x.status,409);
  assert.equal(x.data.error,'NATIVE_MODEL_SELECTION_OR_EPOCH_MISMATCH');
  assert.equal(store.count(),0);
  assert.equal(executes,0);
 }finally{await b.close()}
});

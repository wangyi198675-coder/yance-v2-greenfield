// REAL local Agno SDK test on this authorized Windows computer.
// Gated by original llama-server --api-key-file; no paid API / social send.
// Browser Session is explicitly QA-minted, not a production W54 host claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLocalSessionAuthority} from './local-session.mjs';
import {createPrivateBrainHttp} from './private-brain-http.mjs';
import {createW43PythonPrivatePort} from './private-python-port.mjs';
import {createW43NativeLedgerAdapter} from './private-native-ledger-port.mjs';

test('actual ORIGINAL W43 local Qwen3 Agno 2 turns + native history + cold Python restart',
 {timeout:540000},async t=>{
 const py=process.env.YANCE_W43_TEST_PYTHON;
 const owner=process.env.YANCE_W43_TEST_MODULE_ROOT;
 const localKey=process.env.YANCE_W47_TEST_REAL_LLAMA_KEY_FILE;
 if(!py||!owner||!localKey){t.skip('real local Qwen3 and native protected Key path not configured');return}
 const dir=mkdtempSync(join(tmpdir(),'w47-real-agno-http-two-turn-'));
 const userRoot=join(dir,'original-w43-user-profile');
 mkdirSync(userRoot);
 const local=createLocalSessionAuthority();
 const origin='http://127.0.0.1:49387';
 const binding=randomBytes(32).toString('hex');
 const issued=local.issueNativeWebView(binding);
 const cookie=issued.cookie.split(';')[0],csrf=issued.csrf;
 const profile=()=>{
  const selected=activeModel;
  return {source:'W54_NATIVE_CURRENT_USER',verified:true,
   principalRef:'test-real-agno-native-user-0001',
   installationRef:'test-real-agno-install-0001',appLocalDataRoot:userRoot,
   modelBackend:selected,modelId:selected==='llamacpp'?'qwen3:8b':'',
   modelSelectionEpoch:selectionEpoch,modelUserSelected:selected==='llamacpp',
   extraChargeApproved:false,protectedCredentialAttested:false};
 };
 let activeModel='llamacpp',selectionEpoch=1;
 const nativePort=()=>createW43PythonPrivatePort({pythonExecutable:py,
  w43ModuleRoot:owner,protectedKeyFile:localKey,timeoutMs:290000});
 const port=nativePort(),ledger=createW43NativeLedgerAdapter(port);
 const api=createPrivateBrainHttp({sessionAuthority:local,webOrigin:origin,
  resolveNativePrincipal:async()=>profile(),w43Port:port,requestLedger:ledger,
  resolveSignedModelSelection:async()=>({provider:'LLAMACPP_LOCAL_QWEN3_8B_FREE',
   modelId:'qwen3:8b'})
 });
 const server=createServer((req,res)=>{
  void api(req,res,new URL(req.url,'http://127.0.0.1')).catch(()=>{
   if(!res.headersSent){res.writeHead(503,{'content-type':'application/json'});
    res.end('{"ok":false,"error":"NATIVE_INTERNAL_UNAVAILABLE"}')}
   else res.destroy()
  });
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+server.address().port;
 const get=async()=>{const r=await fetch(base+'/api/v2/private-brain/history?threadId=personal',{
  headers:{Origin:origin,Cookie:cookie}});
  return {status:r.status,json:await r.json()};
 };
 const send=async(text,requestId)=>{
  const r=await fetch(base+'/api/v2/private-brain/turn',{
   method:'POST',headers:{Origin:origin,Cookie:cookie,
    'X-Yance-CSRF':csrf,'Content-Type':'application/json'},
   body:JSON.stringify({threadId:'personal',text,requestId})});
  return {status:r.status,json:await r.json()};
 };
 try{
  const empty=await get();
  assert.equal(empty.status,200);assert.equal(empty.json.source,'W43_NATIVE_AGNO_CHAT_HISTORY');
  assert.equal(empty.json.completeTurnCount,0);
  const first=await send('记住虚构标签：蓝色海鸥。用一句话确认。','qwen_live_native_00001');
  assert.equal(first.status,200,JSON.stringify(first.json));
  assert.equal(first.json.status,'COMPLETED');
  assert.ok(first.json.runId.length>=8);
  assert.ok(first.json.assistantText.trim());
  const second=await send('刚才让你记住的虚构标签是什么？用中文简短回答。','qwen_live_native_00002');
  assert.equal(second.status,200,JSON.stringify(second.json));
  assert.equal(second.json.status,'COMPLETED');
  assert.notEqual(first.json.runId,second.json.runId);
  assert.equal(first.json.sessionId,second.json.sessionId);
  const h=await get();
  assert.equal(h.status,200);assert.equal(h.json.completeTurnCount,2);
  assert.equal(h.json.runCount,2);
  assert.ok(h.json.messages.filter(m=>m.role==='assistant').length>=2);
  // A brand-new actual Python process reads the SAME native W43 ChatHistory.
  const scope=async()=>({checkCurrent:async()=>({
   principalRef:'test-real-agno-native-user-0001',
   installationRef:'test-real-agno-install-0001',
   sessionRef:'w47-live-stored-session-001',sessionRevision:1,
   revocationGeneration:0,expiresAtMs:Date.now()+600000,
   appLocalDataRoot:userRoot,modelBackend:'unconfigured',modelId:'',
   modelSelectionEpoch:2,modelUserSelected:false,
   extraChargeApproved:false,protectedCredentialAttested:false
  })});
  const cold=await nativePort().history(await scope(),'personal');
  assert.equal(cold.completeTurnCount,2);
  assert.equal(cold.sessionId,first.json.sessionId);
  activeModel='unconfigured';selectionEpoch=2;
  const histWithoutModel=await get();
  assert.equal(histWithoutModel.status,200);assert.equal(histWithoutModel.json.completeTurnCount,2);
  const setup=await send('This must NOT invoke the old local model','qwen_live_native_00003');
  assert.equal(setup.status,503);assert.equal(setup.json.error,'MODEL_SETUP_REQUIRED');
  console.log('W47_REAL_W43_AGNO_LOCAL_HTTP_ACK '+JSON.stringify({
   originalAgno:true,model:'qwen3:8b',twoRealRuns:true,
   firstRunId:first.json.runId,secondRunId:second.json.runId,
   sessionId:first.json.sessionId,completeTurnCount:cold.completeTurnCount,
   coldPythonRestart:true,noModelHistory:true,modelSwitchToUnconfigured:true,
   firstAssistantPreview:first.json.assistantText.slice(0,140),
   secondAssistantPreview:second.json.assistantText.slice(0,140),
   cloudCharges:0,socialMessages:0,qaOnlyNativeSession:true
  }));
 }finally{
  await new Promise(ok=>server.close(ok));
  local.revokeNativeHost(binding);
  await new Promise(ok=>setTimeout(ok,700));
  rmSync(dir,{recursive:true,force:true,maxRetries:15,retryDelay:200});
 }
});

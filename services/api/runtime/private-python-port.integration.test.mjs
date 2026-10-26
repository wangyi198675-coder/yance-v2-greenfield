import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createW43PythonPrivatePort} from './private-python-port.mjs';
test('W43 original Agno without ANY model or key reads native History across Python restarts',async t=>{
 const pythonExecutable=process.env.YANCE_W43_TEST_PYTHON;
 const w43ModuleRoot=process.env.YANCE_W43_TEST_MODULE_ROOT;
 if(!pythonExecutable||!w43ModuleRoot){t.skip('W43 Python source missing');return}
 const root=mkdtempSync(join(process.env.YANCE_W47_QA_TEMP_ROOT||tmpdir(),'W47_REAL_AGNO_NO_MODEL_'));
 try{
  const appRoot=join(root,'NATIVE_USER_AGNO_STORAGE');mkdirSync(appRoot);
  const native=()=>({principalRef:'local-person-without-model-001',
   installationRef:'local-one-install-001',sessionRef:'local-private-session-001',
   sessionRevision:1,revocationGeneration:0,expiresAtMs:Date.now()+120000,
   appLocalDataRoot:appRoot,modelBackend:'unconfigured',modelId:'',
   modelSelectionEpoch:0,modelUserSelected:false,
   extraChargeApproved:false,protectedCredentialAttested:false});
  const ctx={checkCurrent:async()=>native()};
  const port=createW43PythonPrivatePort({pythonExecutable,w43ModuleRoot,timeoutMs:45000});
  const first=await port.history(ctx,'personal');
  assert.equal(first.status,'HISTORY_NOT_FOUND');
  assert.equal(first.canSend,false);
  const second=await createW43PythonPrivatePort({
   pythonExecutable,w43ModuleRoot,timeoutMs:45000
  }).history(ctx,'personal');
  assert.equal(second.sessionId,first.sessionId);
  assert.equal(second.runCount,0);
  await assert.rejects(()=>port.turn(ctx,'personal','hello','no_model_test_request_001'),
   err=>String(err?.code).includes('MODEL_SETUP_REQUIRED'));
  const after=await port.history(ctx,'personal');
  assert.equal(after.status,'HISTORY_NOT_FOUND');
  assert.equal(after.runCount,0);
  console.log('W47_W43_REAL_PYTHON_NO_MODEL_HISTORY_PASS '+JSON.stringify({
   pythonSubprocess:true,originalAgnoSQLite:true,localKeyFileRequired:false,
   noLocalModelInitialized:true,setupRequired:true,paidCalls:0,externalMessages:0
  }));
 }finally{
  await new Promise(ok=>setTimeout(ok,150));
  rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:150})
 }
});
test('original signed W43 Python consumer via server-private IPC reads native EMPTY history; never a fake reply',async t=>{
 const pythonExecutable=process.env.YANCE_W43_TEST_PYTHON;
 const w43ModuleRoot=process.env.YANCE_W43_TEST_MODULE_ROOT;
 if(!pythonExecutable||!w43ModuleRoot){t.skip('W43 owner venv/module not configured');return}
 const root=mkdtempSync(join(process.env.YANCE_W47_QA_TEMP_ROOT||tmpdir(),'W47_W43_QA_ONLY_'));
 try{
  const userA=join(root,'W54_FAKE_PROFILE_A'),userB=join(root,'W54_FAKE_PROFILE_B');
  mkdirSync(userA);mkdirSync(userB);
  const key=join(root,'SYNTHETIC_KEY_FOR_BRIDGE_QA_ONLY');
  writeFileSync(key,'synthetic-QA-token-never-real-credential-12345');
  const w43=createW43PythonPrivatePort({pythonExecutable,w43ModuleRoot,protectedKeyFile:key,timeoutMs:20000});
  let checked=0;
  const context=p=>({checkCurrent:async()=>{checked++;return {
   principalRef:p==='A'?'fixture-native-A':'fixture-native-B',
   installationRef:'fixture-install-01',sessionRef:'fixture-session-01',
   sessionRevision:1,revocationGeneration:0,expiresAtMs:Date.now()+60000,
   appLocalDataRoot:p==='A'?userA:userB
  }}});
  const a=await w43.history(context('A'),'personal');
  assert.equal(a.status,'HISTORY_NOT_FOUND');assert.deepEqual(a.messages,[]);
  assert.equal(a.runCount,0);assert.equal(a.canSend,false);
  const b=await w43.history(context('B'),'personal');
  assert.equal(b.status,'HISTORY_NOT_FOUND');assert.deepEqual(b.messages,[]);
  const c=await w43.history(context('A'),'other-thread');
  assert.equal(c.status,'HISTORY_NOT_FOUND');
  assert.ok(checked>=6);
  let versions=0;
  await assert.rejects(()=>w43.history({checkCurrent:async()=>{
   versions++;return {principalRef:'fixture-native-A',installationRef:'fixture-install-01',
     sessionRef:'fixture-session-01',sessionRevision:versions,
     revocationGeneration:0,expiresAtMs:Date.now()+60000,appLocalDataRoot:userA}
  }},'personal'),e=>e?.httpStatus===409);
  console.log('W47_W43_ORIGINAL_PYTHON_NATIVE_HISTORY_IPC_QA_PASS '+JSON.stringify({
   originalW43Consumer:true,w54RealPrincipal:false,qaOnly:true,
   originalAgnoNativeHistorySource:true,realModelCalls:0,crossOsUserTest:false}));
 }finally{await new Promise(ok=>setTimeout(ok,350));rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:250})}
});

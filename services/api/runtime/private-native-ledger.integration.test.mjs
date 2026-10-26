import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createW43PythonPrivatePort} from './private-python-port.mjs';
import {createW43NativeLedgerAdapter} from './private-native-ledger-port.mjs';
test('original W43 3d399 native Agno SQLite claim/replay/UNKNOWN survives Python restart; NO model run',async t=>{
 const pythonExecutable=process.env.YANCE_W43_TEST_PYTHON;
 const w43ModuleRoot=process.env.YANCE_W43_TEST_MODULE_ROOT;
 if(!pythonExecutable||!w43ModuleRoot){t.skip('W43 original runtime not configured');return}
 const root=mkdtempSync(join(process.env.YANCE_W47_QA_TEMP_ROOT||tmpdir(),'W47_NATIVE_DURABLE_QA_'));
 try{
  const uA=join(root,'FAKE_W54_TEST_PRINCIPAL_A'),uB=join(root,'FAKE_W54_TEST_PRINCIPAL_B');
  mkdirSync(uA);mkdirSync(uB);
  const testKey=join(root,'FAKE_MODEL_KEY_QA_ONLY');writeFileSync(testKey,'not-a-production-key');
  const port=()=>createW43PythonPrivatePort({pythonExecutable,w43ModuleRoot,protectedKeyFile:testKey,timeoutMs:40000});
  const ledger=createW43NativeLedgerAdapter(port());
  const serverContext=(user='A',rev=1)=>({
   checkCurrent:async()=>({
    principalRef:user==='A'?'fixture-principal-user-A':'fixture-principal-user-B',
    installationRef:'fixture-install-native-01',
    sessionRef:'fixture-session-native-01',sessionRevision:rev,
    revocationGeneration:0,expiresAtMs:Date.now()+150000,
    appLocalDataRoot:user==='A'?uA:uB,
    modelBackend:'llamacpp',modelId:'qwen3:8b',modelSelectionEpoch:1
   })
  });
  const args={context:serverContext(),threadId:'personal',requestId:'request_ledger_native_A_0001',text:'PRIVATE TEST ONLY'};
  const first=await ledger.claim(args);
  assert.equal(first.state,'CLAIMED');
  const [second,third]=await Promise.all([ledger.claim(args),ledger.claim(args)]);
  assert.equal(second.state,'IN_PROGRESS');assert.equal(third.state,'IN_PROGRESS');
  const sameIdDifferentText=await ledger.claim({...args,text:'OTHER PRIVATE TEST'});
  assert.equal(sameIdDifferentText.state,'CONFLICT');
  const unknown=await ledger.markUnknown(args);
  assert.equal(unknown.state,'UNKNOWN');
  const recovered=await ledger.reconcile(args);
  assert.equal(recovered.state,'UNKNOWN');
  // A fresh Node port/new W43 Python process sees the ORIGINAL persistent fence.
  const restarted=createW43NativeLedgerAdapter(port());
  const stillUnknown=await restarted.claim(args);
  assert.equal(stillUnknown.state,'UNKNOWN');
  assert.equal((await restarted.claim({...args,threadId:'other-thread'})).state,'CLAIMED');
  assert.equal((await restarted.claim({...args,context:serverContext('B')})).state,'CLAIMED');
  let checks=0;
  await assert.rejects(()=>restarted.claim({
   ...args,requestId:'request_ledger_native_rev_02',
   context:{checkCurrent:async()=>{
    checks++;return {...(await serverContext().checkCurrent()),sessionRevision:checks}
   }}
  }),e=>e?.httpStatus===409);
  console.log('W47_W43_ORIGINAL_DURABLE_LEDGER_IPC_PASS '+
   JSON.stringify({realW43NativeSqlite:true,
    nodeToPythonClaim:true,concurrentDuplicateBlocked:true,
    nativeUnknownRecoveryWithoutRerun:true,crossProcessRestart:true,
    differentUserAndThreadIsolation:true,revisionConflict409:true,
    modelCalls:0,w54RealUser:false,externalEffects:0}));
 }finally{
  await new Promise(ok=>setTimeout(ok,200));
  rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:250})
 }
});

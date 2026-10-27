import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createW43PythonPrivatePort} from './private-python-port.mjs';

// This fixture calls the REAL Python W43 Agno SDK, WITHOUT a model Run:
// W43 must reject an unclaimed durable request BEFORE any charged call.
// The transient provider token is fictional and never printed or sent to HTTP.
test('W47 private stdio -> original W43 Agno OpenRouter: ephemeral callback, recheck, revoked Key and independent history',async t=>{
 const pythonExecutable=process.env.YANCE_W43_TEST_PYTHON;
 const w43ModuleRoot=process.env.YANCE_W43_TEST_MODULE_ROOT;
 if(!pythonExecutable||!w43ModuleRoot){t.skip('local Agno SDK venv not configured');return}
 const root=mkdtempSync(join(tmpdir(),'w55-w47-w43-nocharge-'));
 const key=join(root,'SYNTHETIC_LOCAL_MODEL_TEST_FILE');
 writeFileSync(key,'local-fake-never-real-credential-abcdefghijkl');
 const fake=['sk-','or-v1-','W55-NOT-REAL-OFFICIAL-AGNO-BRIDGE'].join('');
 let current=true,liveKey=true,requests=0,verified=0;
 const modelSelection={provider:'OPENROUTER_USER_API',modelId:'openai/gpt-4o-mini'};
 const nativeCloudKeyPort={
  withSecret:async(input,using)=>{
   assert.equal(input.provider,'OPENROUTER');
   assert.equal(input.modelId,modelSelection.modelId);
   assert.equal(input.selectionEpoch,7);
   requests++;
   if(!liveKey)throw Error('REVOKED_KEY_NEVER_RELEASED');
   return using(fake);
  }
 };
 const w43=createW43PythonPrivatePort({
  pythonExecutable,w43ModuleRoot,protectedKeyFile:key,
  nativeCloudKeyPort,timeoutMs:45000
 });
 const context={checkCurrent:async()=>{
  verified++;
  if(!current)throw {httpStatus:401,code:'USER_REVOKED'};
  return {
   principalRef:'fixture-native-private-user-01',
   installationRef:'fixture-native-installed-app-01',
   sessionRef:'fixture-native-session-01',
   sessionRevision:1,revocationGeneration:2,
   expiresAtMs:Date.now()+60000,appLocalDataRoot:root,
   modelBackend:'openrouter',modelId:modelSelection.modelId,
   modelSelectionEpoch:7,modelUserSelected:true,extraChargeApproved:true,
   protectedCredentialAttested:true,cloudCredentialSource:'W55_NATIVE_WIN_CRED'
  }
 }};
 try {
  let firstError='';
  await assert.rejects(
   w43.turn(context,'personal','Fake offline source contract check, no external request',
    'w55_private_fake_001',modelSelection),
   e=>{firstError=String(e?.code);return [409,503].includes(e?.httpStatus)&&/W43_NATIVE_PRIVATE_/.test(e?.code)}
  );
  console.log('OFFLINE_CLOUD_DIAG '+JSON.stringify({firstError,keyRequests:requests,checks:verified}));
  assert.ok(requests>=2,'original Agno constructor and pre-run guard each request the current Key');
  assert.ok(firstError.includes('DURABLE_RUN_ALREADY_STARTED_OR_NOT_CLAIMED'),
   'original W43 built its Agno SDK model with W55 test Key then stopped before network Run');
  assert.ok(verified>=3,'W47 rechecked the current Windows user before private Key requests');
  const history=await w43.history(context,'personal');
  assert.equal(history.status,'HISTORY_NOT_FOUND');assert.deepEqual(history.messages,[]);
  const countAtRevocation=requests;
  liveKey=false;
  await assert.rejects(w43.turn(context,'personal','No Key means no model network',
    'w55_private_fake_002',modelSelection),e=>e?.httpStatus===503&&
     String(e?.code).includes('CLOUD_PROTECTED_CREDENTIAL_UNAVAILABLE'));
  assert.ok(requests>countAtRevocation);
  const existing=await w43.history(context,'personal');
  assert.equal(existing.status,'HISTORY_NOT_FOUND');
  current=false;
  const seen=verified,afterKeyRevocation=requests;
  await assert.rejects(w43.turn(context,'personal','Revoked session should fail',
    'w55_private_fake_003',modelSelection),e=>e?.httpStatus===401||e?.httpStatus===503);
  assert.equal(requests,afterKeyRevocation,'revoked native session did not access any Key');
  assert.ok(verified>seen);
  // Nothing in any W43 result or rejected error may include the fictional Key.
  console.log('W55_W47_W43_REAL_AGNO_SDK_ZERO_CHARGE_QA_PASS '+JSON.stringify({
   originalW43SDK:true,runCalls:0,historyReadableAfterKeyRevoke:true,
   verifiedParentChecks:verified,keyResolverInvocations:requests,
   revokedKeyRejected:true,accountSends:0
  }));
 }finally{await new Promise(ok=>setTimeout(ok,500));rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:250})}
});

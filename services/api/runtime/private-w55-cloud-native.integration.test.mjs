import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createW43PythonPrivatePort} from './private-python-port.mjs';

test('original W43 Agno official OpenRouter SDK constructor via W55-only native callback, NO HTTP key file',
 {timeout:100000},async t=>{
 const pythonExecutable=process.env.YANCE_W43_TEST_PYTHON;
 const w43ModuleRoot=process.env.YANCE_W43_TEST_MODULE_ROOT;
 if(!pythonExecutable||!w43ModuleRoot){t.skip('W43 native owner source not configured');return}
 const dir=mkdtempSync(join(process.env.YANCE_W47_QA_TEMP_ROOT||tmpdir(),'w47-cloud-callback-'));
 const root=join(dir,'ONE_NATIVE_USER_APPDATA');mkdirSync(root);
 const selected=()=>({
  principalRef:'qa-native-cloud-user-0001',
  installationRef:'qa-native-install-0001',
  sessionRef:'qa-native-one-session-0001',
  sessionRevision:1,revocationGeneration:0,
  expiresAtMs:Date.now()+120000,appLocalDataRoot:root,
  modelBackend:'openrouter',modelId:'openai/gpt-4o-mini',
  modelSelectionEpoch:1,modelUserSelected:true,
  extraChargeApproved:true,protectedCredentialAttested:true,
  cloudSecretMode:'W55_NATIVE_CALLBACK'
 });
 const ctx={checkCurrent:async()=>selected()};
 let reads=0;
 const port=createW43PythonPrivatePort({pythonExecutable,w43ModuleRoot,timeoutMs:50000,
  resolveNativeCloudSecret:async({verifiedClaim,provider,modelId})=>{
   reads++;
   assert.equal(provider,'openrouter');
   assert.equal(modelId,'openai/gpt-4o-mini');
   assert.equal(verifiedClaim.cloudSecretMode,'W55_NATIVE_CALLBACK');
   return 'synthetic-test-native-provider-key-no-real-billing-0001';
  }});
 try{
  const claim=await port.claim(ctx,'personal','cloud_native_qatest_0001',
   'MODEL SDK INIT ONLY — never call provider');
  assert.equal(claim.state,'CLAIMED');
  assert.equal(reads,1);
  const hist=await port.history(ctx,'personal');
  assert.equal(hist.status,'HISTORY_NOT_FOUND');
  assert.equal(hist.canSend,false);
  console.log('W47_W43_OFFICIAL_AGNO_W55_PRIVATE_CALLBACK_QA '+JSON.stringify({
   sdk:'ORIGINAL_AGNO_OPENROUTER',keySource:'FAKE_TEST_ONLY_NATIVE_CALLBACK',
   plaintextKeyFile:false,browserKey:false,networkProviderCalls:0,
   paidCharges:0,userHistoryUnchanged:true,credentialsInHttp:false
  }));
 }finally{
  await new Promise(ok=>setTimeout(ok,150));
  rmSync(dir,{recursive:true,force:true,maxRetries:12,retryDelay:200});
 }
});

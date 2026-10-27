import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createW55WebNativeStdioPort} from './w55-web-native-stdio.mjs';
import {createWebPrivateCloudByok} from './web-private-cloud-byok.mjs';
import {createW43PythonPrivatePort} from './private-python-port.mjs';
const cleanup=(exe,provider)=>new Promise(ok=>{
 const p=spawn(exe,[],{windowsHide:true,shell:false,stdio:['pipe','pipe','ignore']});
 p.stdout.resume();p.stdin.end(JSON.stringify({op:'qa_cleanup',provider})+'\n');
 p.once('error',ok);p.once('exit',ok);
});
test('W47 original W55 WinCred lease -> original W43 Agno OpenRouter SDK, ledger denies unclaimed before paid network', {timeout:100000},async t=>{
 const exe=process.env.W55_WEB_QA_NATIVE_EXE,py=process.env.YANCE_W43_TEST_PYTHON;
 const rootModule=process.env.YANCE_W43_TEST_MODULE_ROOT;
 if(!exe||!py||!rootModule){t.skip('W55 native debug host / W43 original runtime required');return}
 const original=process.env.W55_WEB_QA_SCOPE;
 process.env.W55_WEB_QA_SCOPE='W55_WEB_QA_'+randomBytes(16).toString('hex');
 const root=mkdtempSync(join(tmpdir(),'w47-w55-w43-original-sdk-'));
 const profileRoot=join(root,'original-agno-history');mkdirSync(profileRoot);
 const port=createW55WebNativeStdioPort({executable:exe});
 const cloud=createWebPrivateCloudByok({appLocalDataRoot:root,nativeKeyPort:port});
 const fake=['sk-','or-v1-','W47-W55-REAL-WINCRED-OFFLINE-AGNO-FAKE'].join('');
 let called=0;
 const nativeCloudKeyPort={withSecret:async(args,consumer)=>{
  called++;
  return cloud.withSecret(args,consumer);
 }};
 try{
  await cloud.save({provider:'OPENROUTER_USER_API',apiKey:fake});
  const choice=await cloud.select({provider:'OPENROUTER_USER_API',
   modelId:'openai/gpt-4o-mini',confirmPaidCost:true});
  const current=async()=>({
   principalRef:'web_private_original_w55_001',installationRef:'web_install_original_w55_001',
   sessionRef:'web_native_qa_session_001',sessionRevision:1,revocationGeneration:0,
   expiresAtMs:Date.now()+90000,appLocalDataRoot:profileRoot,
   ...await cloud.principalModel()
  });
  const ctx={checkCurrent:current};
  const w43=createW43PythonPrivatePort({
   pythonExecutable:py,w43ModuleRoot:rootModule,
   nativeCloudKeyPort,timeoutMs:55000
  });
  await assert.rejects(()=>w43.turn(ctx,'personal',
   'Check native SDK model construction only, never run provider',
   'w55_web_original_sdk_no_billing_001',
   {provider:choice.provider,modelId:choice.modelId}),
   e=>String(e?.code).includes('DURABLE_RUN_ALREADY_STARTED_OR_NOT_CLAIMED'));
  assert.ok(called>=2,'original W43 Cloud SDK constructor and pre-run guard both request native WinCred');
  const old=await w43.history(ctx,'personal');
  assert.equal(old.status,'HISTORY_NOT_FOUND');
  assert.equal(old.runCount,0);
  const status=await cloud.status('OPENROUTER_USER_API');
  await cloud.revoke({provider:'OPENROUTER_USER_API',expectedRevision:status.revision});
  assert.equal(await cloud.principalModel(),null,'real WinCred revoke immediately removes paid model qualification');
  const after=await w43.history({checkCurrent:async()=>({...await current(),
   modelBackend:'unconfigured',modelId:'',modelSelectionEpoch:0,
   modelUserSelected:false,extraChargeApproved:false,protectedCredentialAttested:false,
   cloudCredentialSource:undefined})},'personal');
  assert.equal(after.runCount,0);
  console.log('W47_W55_NATIVE_WIN_CRED_W43_OFFICIAL_AGNO_MODEL_SDK_PASS '+JSON.stringify({
   nativeWindowsCredential:true,originalAgnoSdk:true,privateLeaseCalls:called,
   durableExecutionGuard:true,revokedCredentialRejected:true,
   historyReadableWithoutKey:true,providerNetworkCalls:0,chargedCalls:0,socialSends:0
  }));
 }finally{
  await cleanup(exe,'OPENROUTER');
  if(original===undefined)delete process.env.W55_WEB_QA_SCOPE;
  else process.env.W55_WEB_QA_SCOPE=original;
  rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:150});
 }
});

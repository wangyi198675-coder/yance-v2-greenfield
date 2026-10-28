import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createW43PythonPrivatePort} from './private-python-port.mjs';
const run=promisify(execFile);

test('ACTUAL Windows WinCred/DPAPI -> W47 PRIVATE stdio -> original W43 Agno SDK, OpenRouter/OpenAI, revoke no billing',async t=>{
 const exe=process.env.W55_NATIVE_QA_PROBE;
 const py=process.env.YANCE_W43_TEST_PYTHON;
 const moduleRoot=process.env.YANCE_W43_TEST_MODULE_ROOT;
 if(!exe||!py||!moduleRoot){t.skip('nonproduction Windows Rust/Python executables not supplied');return}
 const root=mkdtempSync(join(tmpdir(),'w55-wincred-agno-offline-'));
 const localKey=join(root,'FAKE_LOCAL_KEY_FOR_SIGNATURE_ONLY');
 writeFileSync(localKey,'not-real-local-qwen-key-token-abcdefgh123');
 const report=[];
 try{
  for(const provider of [
    {w47:'OPENROUTER_USER_API',native:'OPENROUTER',backend:'openrouter',modelId:'openai/gpt-4o-mini'},
    {w47:'OPENAI_USER_API',native:'OPENAI_API',backend:'openai',modelId:'gpt-4o-mini'}
  ]){
   await run(exe,['seed',provider.native],{windowsHide:true,timeout:15000});
   let secretLeases=0,claimChecks=0;
   const w43=createW43PythonPrivatePort({
    pythonExecutable:py,w43ModuleRoot:moduleRoot,protectedKeyFile:localKey,
    timeoutMs:45000,
    nativeCloudKeyPort:{
     withSecret:async(args,consume)=>{
      assert.equal(args.provider,provider.native);
      assert.equal(args.selectionEpoch,6);
      secretLeases++;
      // Actual W55 Rust OS WinCred+DPAPI reads a deliberately fictional Key.
      // Never pass Key via HTTP, env, URL, shell args or output diagnostics.
      const {stdout}=await run(exe,['lease',provider.native],{
       windowsHide:true,encoding:'utf8',timeout:15000,maxBuffer:1024
      });
      return consume(stdout);
     }
    }
   });
   const current={checkCurrent:async()=>{
    claimChecks++;
    return {
     principalRef:'w55-qa-test-native-user-001',
     installationRef:'w55-qa-test-native-install-001',
     sessionRef:'w55-qa-test-private-session-001',
     sessionRevision:1,revocationGeneration:1,expiresAtMs:Date.now()+60000,
     appLocalDataRoot:root,cloudCredentialSource:'W55_NATIVE_WIN_CRED',
     modelBackend:provider.backend,modelId:provider.modelId,
     modelSelectionEpoch:6,modelUserSelected:true,extraChargeApproved:true,
     protectedCredentialAttested:true
    };
   }};
   const selected={provider:provider.w47,modelId:provider.modelId};
   try{
    await assert.rejects(w43.turn(current,'personal','Only prove native SDK binding; no external model run',
      'qa_real_wincred_001',selected),
     e=>String(e?.code).includes('DURABLE_RUN_ALREADY_STARTED_OR_NOT_CLAIMED'));
    assert.equal(secretLeases,2,'original W43 constructor+pre-run check both read WinCred');
    assert.ok(claimChecks>=5,'original W47 rechecked current source');
    await run(exe,['revoke',provider.native],{windowsHide:true,timeout:15000});
    await assert.rejects(w43.turn(current,'personal','Revoked Key may never run cloud SDK',
      'qa_real_wincred_002',selected),
     e=>e?.httpStatus===503&&String(e?.code).includes('CLOUD_PROTECTED_CREDENTIAL_UNAVAILABLE'));
    const history=await w43.history(current,'personal');
    assert.equal(history.status,'HISTORY_NOT_FOUND');
    assert.deepEqual(history.messages,[]);
    report.push({provider:provider.w47,originalAgnoSdk:true,
      nativeWinCredLeaseCalls:secretLeases,originalCurrentUserChecks:claimChecks,
      revokedKeyRejected:true,historyUnaffected:true,paidCloudRuns:0,realSend:0});
   }finally{
    try{await run(exe,['revoke',provider.native],{windowsHide:true,timeout:15000})}catch{}
   }
  }
  console.log('ACTUAL_W55_WIN_CRED_W47_W43_CLOUD_MODEL_OFFLINE_PASS '+JSON.stringify(report));
 }finally{await new Promise(ok=>setTimeout(ok,450));rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:250})}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createW43PythonPrivatePort} from './private-python-port.mjs';
test('actual original W43 3d399 IPC rejects cloud-selected turn, never falls back to local Agno',async t=>{
 const pythonExecutable=process.env.YANCE_W43_TEST_PYTHON;
 const w43ModuleRoot=process.env.YANCE_W43_TEST_MODULE_ROOT;
 if(!pythonExecutable||!w43ModuleRoot){t.skip('signed W43 Python source absent');return}
 const w43=createW43PythonPrivatePort({
  pythonExecutable,w43ModuleRoot,protectedKeyFile:pythonExecutable,timeoutMs:20000
 });
 let access=0;
 await assert.rejects(
  ()=>w43.turn({checkCurrent:async()=>{access++;throw Error('MUST_NOT_ASK_OR_RUN')}},
   'personal','Do not spend credits','request_cloud_test_001',
   {provider:'OPENROUTER_USER_API',modelId:'openai/gpt-4o-mini'}),
  e=>e?.httpStatus===503&&String(e.code).includes('CLOUD_AGNO_OWNER_ADAPTER_NOT_SIGNED')
 );
 assert.equal(access,0);
 console.log('W47_W43_CLOUD_NO_LOCAL_FALLBACK_QA_PASS '+JSON.stringify({
  originalPythonW43:true,cloudSDKCalls:0,localQwenCalls:0,
  keyAccesses:0,realW54User:false
 }));
});

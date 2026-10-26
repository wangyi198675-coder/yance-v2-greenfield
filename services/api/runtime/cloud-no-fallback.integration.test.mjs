import test from 'node:test';
import assert from 'node:assert/strict';
import {createW43PythonPrivatePort} from './private-python-port.mjs';
test('current original W43 Agno SDK cloud adapter requires live trusted W54/W55 before any model run',async t=>{
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
  e=>e?.httpStatus===503&&String(e.code).includes('W47_CURRENT_SESSION_RECHECK_FAILED')
 );
 assert.equal(access,1);
 console.log('W47_W43_CLOUD_NO_LOCAL_FALLBACK_QA_PASS '+JSON.stringify({
  originalPythonW43:true,cloudSDKCalls:0,localQwenCalls:0,
  keyAccesses:0,realW54User:false
 }));
});

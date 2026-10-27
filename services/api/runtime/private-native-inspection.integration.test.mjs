import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLocalSessionAuthority} from './local-session.mjs';
import {createW43PythonPrivatePort} from './private-python-port.mjs';
import {createPrivateNativeInspectionHttp} from './private-brain-http.mjs';

test('original W43 Agno Tool registry and scoped persisted Run/Trace via W47 GET, no model needed', {timeout:120000},async t=>{
 const python=process.env.YANCE_W43_TEST_PYTHON;
 const moduleRoot=process.env.YANCE_W43_TEST_MODULE_ROOT;
 if(!python||!moduleRoot){t.skip('Original W43 Python source and venv not configured');return}
 const folder=mkdtempSync(join(tmpdir(),'w47-native-agno-read-'));
 const origin='http://127.0.0.1:49375';
 const authority=createLocalSessionAuthority();
 const binding='a'.repeat(64); // TEST-ONLY native private verifier fixture
 const session=authority.issueNativeWebView(binding);
 const cookie=session.cookie.split(';')[0];
 const principal=Object.freeze({verified:true,source:'W54_NATIVE_CURRENT_USER',
  principalRef:'w54-native-inspection-original-001',
  installationRef:'w54-native-inspection-install-001',
  appLocalDataRoot:folder,modelBackend:'unconfigured',modelId:'',
  modelSelectionEpoch:0,modelUserSelected:false,extraChargeApproved:false,
  protectedCredentialAttested:false});
 const port=createW43PythonPrivatePort({pythonExecutable:python,w43ModuleRoot:moduleRoot,
  timeoutMs:45000});
 const gateway=createPrivateNativeInspectionHttp({sessionAuthority:authority,
  webOrigin:origin,resolveNativePrincipal:async()=>principal,w43Port:port});
 const server=createServer(async(req,res)=>{
  try{const used=await gateway(req,res,new URL(req.url,'http://localhost'));
   if(!used){res.writeHead(404);res.end()} }
  catch{if(!res.headersSent){res.writeHead(503);res.end()}}
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const url='http://127.0.0.1:'+server.address().port;
 const get=async(path,authed=true)=>{
  const res=await fetch(url+path,{headers:{Origin:origin,...(authed?{Cookie:cookie}:{})}});
  return {status:res.status,body:await res.json()};
 };
 try{
  assert.equal((await get('/api/v2/private-brain/tools',false)).status,401);
  const tools=await get('/api/v2/private-brain/tools');
  assert.equal(tools.status,200,JSON.stringify(tools.body));
  assert.equal(tools.body.source,'W43_NATIVE_AGNO_SDK');
  assert.equal(tools.body.registeredTools.length,3);
  assert.equal(tools.body.registeredTools.filter(x=>x.businessExecutable).length,0);
  assert.equal(tools.body.canSend,false);
  const runs=await get('/api/v2/private-brain/runs?threadId=personal&limit=10');
  assert.equal(runs.status,200,JSON.stringify(runs.body));
  assert.equal(runs.body.status,'NATIVE_RUNS_READ');
  assert.deepEqual(runs.body.runs,[]);
  const foreign=await get('/api/v2/private-brain/runs/some_unknown_run_id?threadId=personal');
  assert.equal(foreign.status,404,JSON.stringify(foreign.body));
  assert.equal((await get('/api/v2/private-brain/runs?limit=999')).status,422);
  authority.revokeAll();
  assert.equal((await get('/api/v2/private-brain/tools')).status,401);
  console.log('W47_W43_ORIGINAL_AGNO_TOOLS_RUN_TRACE_READ_PASS '+JSON.stringify({
   originalAgnoSdk:true,registeredTools:tools.body.registeredTools.length,
   businessExecutable:0,privateRunCount:runs.body.runs.length,
   noModelRequired:true,foreignRunDenied:true,revocationDenied:true,
   paidCalls:0,socialSends:0
  }));
 }finally{
  await new Promise(ok=>server.close(ok));
  rmSync(folder,{recursive:true,force:true,maxRetries:8,retryDelay:100});
 }
});

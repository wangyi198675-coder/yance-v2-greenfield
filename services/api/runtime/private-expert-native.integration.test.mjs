import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLocalSessionAuthority} from './local-session.mjs';
import {createW43PythonPrivatePort} from './private-python-port.mjs';
import {createPrivateNativeExpertHttp,createContactNativeAuthorityHoldHttp} from './private-brain-http.mjs';

test('W47 real W43 expert directory and original Agno SQLite enable/re-read; no unauthorized Run/contact grant',{timeout:120000},async t=>{
 const python=process.env.YANCE_W43_TEST_PYTHON;
 const moduleRoot=process.env.YANCE_W43_TEST_MODULE_ROOT;
 if(!python||!moduleRoot){t.skip('Original W43 installed Python not configured');return}
 const folder=mkdtempSync(join(tmpdir(),'w47-original-experts-'));
 const origin='http://127.0.0.1:49375';
 const authority=createLocalSessionAuthority();
 const session=authority.issueNativeWebView('a'.repeat(64));
 const cookie=session.cookie.split(';')[0];
 const current=Object.freeze({verified:true,source:'W54_NATIVE_CURRENT_USER',
  principalRef:'w54-native-expert-identity-001',
  installationRef:'w54-native-expert-installation-001',
  appLocalDataRoot:folder,modelBackend:'unconfigured',modelId:'',
  modelSelectionEpoch:0,modelUserSelected:false,extraChargeApproved:false,
  protectedCredentialAttested:false});
 const port=createW43PythonPrivatePort({pythonExecutable:python,w43ModuleRoot:moduleRoot,timeoutMs:45000});
 const expert=createPrivateNativeExpertHttp({sessionAuthority:authority,webOrigin:origin,
  resolveNativePrincipal:async()=>current,w43Port:port});
 const contact=createContactNativeAuthorityHoldHttp({sessionAuthority:authority,webOrigin:origin});
 const server=createServer(async(req,res)=>{
  try{
   const parsed=new URL(req.url,'http://localhost');
   const used=await expert(req,res,parsed)||await contact(req,res,parsed);
   if(!used){res.writeHead(404);res.end()}
  }catch{if(!res.headersSent){res.writeHead(503);res.end()}}
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const root='http://127.0.0.1:'+server.address().port;
 const query=async(path,{method='GET',authorized=true,csrf=true,headers={},data}={})=>{
  const response=await fetch(root+path,{method,headers:{
   Origin:origin,...(authorized?{Cookie:cookie}:{}),
   ...(csrf?{'x-yance-csrf':session.csrf}:{}),
   ...(data?{'content-type':'application/json'}:{}),...headers
  },...(data?{body:JSON.stringify(data)}:{})});
  return {http:response.status,data:await response.json()}
 };
 try{
  assert.equal((await query('/api/v2/private-brain/experts',{authorized:false})).http,401);
  assert.equal((await query('/api/v2/private-brain/experts',{headers:{Origin:'http://evil.example'}})).http,403);
  const first=await query('/api/v2/private-brain/experts');
  assert.equal(first.http,200,JSON.stringify(first.data));
  assert.equal(first.data.source,'W43_NATIVE_AGNO_EXPERT');
  assert.equal(first.data.cataloguedCount,10);
  assert.equal(first.data.registeredCount,1);
  assert.equal(first.data.installedReadOnlyCount,1);
  assert.equal(first.data.canSend,false);
  assert.equal(first.data.experts.filter(x=>x.canInvoke).length,1);
  assert.equal(first.data.experts.find(x=>x.expertId==='oss-discovery').canInvoke,true);
  assert.equal(first.data.experts.filter(x=>!x.installed).length,9);
  const toggleUrl='/api/v2/private-brain/experts/oss-discovery/enable';
  assert.equal((await query(toggleUrl,{method:'POST',csrf:false,data:{enabled:false}})).http,403);
  assert.equal((await query('/api/v2/private-brain/experts/german-natural-chat/enable',{
   method:'POST',data:{enabled:true}})).http,409);
  const disabled=await query(toggleUrl,{method:'POST',data:{enabled:false}});
  assert.equal(disabled.http,200,JSON.stringify(disabled.data));
  assert.equal(disabled.data.enabled,false);
  const reRead=await query('/api/v2/private-brain/experts');
  assert.equal(reRead.data.experts.find(x=>x.expertId==='oss-discovery').canInvoke,false);
  assert.equal((await query('/api/v2/private-brain/experts/oss-discovery/turn',{
   method:'POST',data:{requestId:'w47expert00001',stableId:'W43',threadId:'personal',
    usageScope:'THIS_TASK'}})).http,409);
  const reenabled=await query(toggleUrl,{method:'POST',data:{enabled:true}});
  assert.equal(reenabled.http,200);
  assert.ok(reenabled.data.revision>=2);
  const noModel=await query('/api/v2/private-brain/experts/oss-discovery/turn',{
   method:'POST',data:{requestId:'w47expert00002',stableId:'W43',threadId:'personal',usageScope:'THIS_TASK'}});
  assert.equal(noModel.http,503);
  assert.equal(noModel.data.error,'EXPERT_MODEL_SETUP_REQUIRED');
  const contactModel=await query('/api/v2/contact-context/model-config');
  assert.equal(contactModel.http,503);
  assert.equal(contactModel.data.error,'W24_W44_SIGNED_CONTACT_GRANT_BUDGET_MODE_PORT_NOT_CONNECTED');
  assert.equal((await query('/api/v2/contact-context/effective-mode',{authorized:false})).http,401);
  assert.equal((await query('/api/v2/contact-context/change-mode',{method:'POST',csrf:false,data:{mode:'AUTO'}})).http,403);
  assert.equal((await query('/api/v2/contact-context/change-mode',{method:'POST',data:{mode:'AUTO'}})).http,503);
  authority.revokeAll();
  assert.equal((await query('/api/v2/private-brain/experts')).http,401);
  assert.equal((await query('/api/v2/contact-context/model-config')).http,401);
  console.log('W47_W43_REAL_EXPERT_CONTRACT_PASS '+JSON.stringify({
   catalogued:10,realInstalled:1,uninstalled:9,originalNativeSQLite:true,
   nativeToggleReadback:true,originalW43Port:true,modelRunDenied:true,
   contactPrivateIsolation:true,unauthorizedModesDenied:true,paidCalls:0,sends:0}));
 }finally{await new Promise(ok=>server.close(ok));
  rmSync(folder,{recursive:true,force:true,maxRetries:6,retryDelay:200})}
});

// On actual Windows with W55's original debug isolated-namespace Rust executable,
// exercise the REAL W47 server.mjs HTTP + WebPrivate cookie + WinCred/DPAPI.
// Never uses a real provider Key or issues a paid Agno Run.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {createServer as createTcpServer} from 'node:net';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
const here=fileURLToPath(new URL('.',import.meta.url));
const root=resolve(here,'../../..');
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const nativeCleanup=(exe,provider,env)=>new Promise(ok=>{
 const p=spawn(exe,[],{windowsHide:true,shell:false,stdio:['pipe','pipe','ignore'],env});
 p.stdout.resume();p.stdin.end(JSON.stringify({op:'qa_cleanup',provider})+'\n');
 p.once('error',ok);p.once('exit',ok);
});
test('REAL W47 localhost WEB_PRIVATE API to REAL W55 Rust WinCred/DPAPI, fake Key + cold status + W43 native History, no billed model', {timeout:120000}, async t=>{
 const exe=process.env.W55_WEB_QA_NATIVE_EXE;
 const python=process.env.YANCE_W43_TEST_PYTHON;
 const moduleRoot=process.env.YANCE_W43_TEST_MODULE_ROOT;
 if(!exe||!python||!moduleRoot){t.skip('W55 isolated original Rust host and original W43 SDK Python needed');return}
 const namespace='W55_WEB_QA_'+randomBytes(16).toString('hex');
 const qa=mkdtempSync(join(tmpdir(),'w47-w55-real-web-api-'));
 const appdata=join(qa,'AppDataLocal');mkdirSync(appdata);
 const fakeKey=['sk-','or-v1-','NOT-REAL-W47-WEB-HTTP-WINCRED-ABC123'].join('');
 const fakeKey2=['sk-','or-v1-','NOT-REAL-W47-WEB-HTTP-WINCRED-DEF456'].join('');
 const allocator=createTcpServer();
 await new Promise(ok=>allocator.listen(0,'127.0.0.1',ok));
 const port=allocator.address().port;
 await new Promise(ok=>allocator.close(ok));
 const origin='http://127.0.0.1:'+port;
 const env={...process.env,
  W55_WEB_QA_SCOPE:namespace,LOCALAPPDATA:appdata,
  YANCE_W55_WEB_NATIVE_EXE:exe,YANCE_W47_WEB_PRIVATE_SINGLE_USER:'1',
  YANCE_W47_W43_PYTHON_EXECUTABLE:python,
  YANCE_W47_W43_MODULE_ROOT:moduleRoot,
  YANCE_W47_RUNTIME_MODE:'development',YANCE_W47_API_PORT:String(port),
  YANCE_W47_WEB_ORIGIN:origin};
 delete env.YANCE_W47_W43_LOCAL_KEY_FILE;
 delete env.YANCE_W47_OPERATOR_PAIRING;
 let child=null;
 try{
  child=spawn(process.execPath,[join(here,'server.mjs')],{
   windowsHide:true,shell:false,stdio:['ignore','pipe','pipe'],env});
  let txt='';
  const ready=await new Promise((ok,fail)=>{
   const timer=setTimeout(()=>fail(Error('W47_REAL_W55_WEB_BOOT_TIMEOUT')),14000);
   child.stdout.on('data',x=>{
    txt+=String(x);
    for(const line of txt.split(/\r?\n/))if(line.includes('V2_API_READY')){
     clearTimeout(timer);try{ok(JSON.parse(line))}catch(e){fail(e)}return
    }
   });
   child.once('error',e=>{clearTimeout(timer);fail(e)});
   child.once('exit',n=>{clearTimeout(timer);fail(Error('W47_W55_EARLY_EXIT_'+n))});
  });
  assert.equal(ready.apiGitSha,sha);
  let cookie='',csrf='';
  const req=async(path,{method='GET',body,headers={}}={})=>{
   const r=await fetch(origin+path,{method,
    headers:{Origin:origin,'Sec-Fetch-Site':'same-origin',
     ...(cookie?{Cookie:cookie}:{}),
     ...(method==='GET'?{}:{'Content-Type':'application/json',
      'X-Yance-CSRF':csrf}),...headers},
    ...(method==='GET'?{}:{body:JSON.stringify(body??{})})
   });
   return {code:r.status,response:r,data:await r.json()};
  };
  assert.equal((await req('/api/v2/private-brain/cloud-keys')).code,401);
  const started=await req('/api/v2/local-session/web-private-start',{method:'POST',body:{}});
  assert.equal(started.code,200);
  cookie=started.response.headers.get('set-cookie').split(';')[0];
  csrf=started.data.csrfToken;
  assert.ok(cookie.startsWith('yance_web_private_session='));
  const before=await req('/api/v2/private-brain/cloud-keys');
  assert.equal(before.code,200);
  assert.equal(before.data.providers[0].configured,false);
  const old=await req('/api/v2/private-brain/history?threadId=personal');
  assert.equal(old.code,200);
  assert.equal(old.data.source,'W43_NATIVE_AGNO_CHAT_HISTORY');
  const bad=await req('/api/v2/private-brain/cloud-keys',{method:'POST',
   body:{provider:'OPENROUTER_USER_API',apiKey:fakeKey},
   headers:{'X-Yance-CSRF':'0'.repeat(64)}});
  assert.equal(bad.code,403);
  let result=await req('/api/v2/private-brain/cloud-keys',{method:'POST',
   body:{provider:'OPENROUTER_USER_API',apiKey:fakeKey}});
  assert.equal(result.code,200);
  assert.equal(result.data.revision,1);
  assert.equal(JSON.stringify(result.data).includes(fakeKey),false);
  assert.equal((await req('/api/v2/private-brain/model-selection',{method:'POST',
   body:{provider:'OPENROUTER_USER_API',modelId:'openai/gpt-4o-mini'}})).code,422);
  result=await req('/api/v2/private-brain/model-selection',{method:'POST',
   body:{provider:'OPENROUTER_USER_API',modelId:'openai/gpt-4o-mini',
    confirmPaidCost:true}});
  assert.equal(result.code,200,JSON.stringify(result.data));
  const config=await req('/api/v2/private-brain/model-config');
  assert.equal(config.code,200);
  assert.equal(config.data.selectedProvider,'OPENROUTER_USER_API');
  assert.equal(config.data.selectedModelId,'openai/gpt-4o-mini');
  assert.equal(config.data.secureCredentialStorage,true);
  const lateHistory=await req('/api/v2/private-brain/history?threadId=personal');
  assert.equal(lateHistory.code,200,'real WinCred selection never blocks native Agno History');
  result=await req('/api/v2/private-brain/cloud-keys',{method:'POST',
   body:{provider:'OPENROUTER_USER_API',apiKey:fakeKey2,expectedRevision:1}});
  assert.equal(result.code,200);assert.equal(result.data.revision,2);
  const deselected=await req('/api/v2/private-brain/model-config');
  assert.equal(deselected.data.selectedProvider,'');
  result=await req('/api/v2/private-brain/cloud-keys',{method:'DELETE',
   body:{provider:'OPENROUTER_USER_API',expectedRevision:2}});
  assert.equal(result.code,200);
  assert.equal(result.data.revoked,true);
  const history=await req('/api/v2/private-brain/history?threadId=personal');
  assert.equal(history.code,200);
  const locked=await req('/api/v2/private-brain/model-selection',{method:'POST',
   body:{provider:'OPENROUTER_USER_API',modelId:'openai/gpt-4o-mini',confirmPaidCost:true}});
  assert.equal(locked.code,409);
  const logout=await req('/api/v2/local-session/logout',{method:'POST',body:{}});
  assert.equal(logout.code,200);
  assert.equal((await req('/api/v2/private-brain/cloud-keys')).code,401);
  console.log('W47_REAL_WEB_HTTP_TO_W55_WIN_CRED_ACK '+JSON.stringify({
   nodeApiSha:sha,oneOriginHttp:true,webSessionNoPair:true,
   originalW55RustWinCred:true,originalW43History:true,
   storeRotateRevoke:true,keyRevisionFinal:3,keyNeverReturned:true,
   cloudCostConsent:true,billingCalls:0,socialSend:0
  }));
 }finally{
  if(child?.exitCode===null){
   child.kill();
   await Promise.race([new Promise(ok=>child.once('exit',ok)),
    new Promise(ok=>setTimeout(ok,1700))]);
  }
  await nativeCleanup(exe,'OPENROUTER',{...env});
  rmSync(qa,{recursive:true,force:true,maxRetries:8,retryDelay:120});
 }
});

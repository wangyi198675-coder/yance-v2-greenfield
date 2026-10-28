import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,cpSync,readdirSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseW54LocalBoot} from './native-private-startup.mjs';

const here=dirname(fileURLToPath(import.meta.url));
test('startup frame rejects forged/invalid input, never a browser-owned Principal',()=>{
 assert.throws(()=>parseW54LocalBoot('{}',{installed:true}),/W54_LOCAL_NATIVE_BOOT_INVALID/);
 assert.throws(()=>parseW54LocalBoot('{"version":1}',{installed:false}),/W54_LOCAL_NATIVE_BOOT_MISSING/);
 const native={version:1,source:'W54_NATIVE_CURRENT_USER',
   principalRef:'w54u_unit_user_0000001',
   installationRef:'w54i_unit_installed_0001',
   sessionRevision:1,nativeRevocationGeneration:4,appLocalDataRoot:'C:\\\\Users\\\\example\\\\AppData\\\\Local\\\\Yance'};
 const base=parseW54LocalBoot(JSON.stringify(native),{installed:true});
 assert.equal(base.modelBackend,'unconfigured');
 assert.equal(base.extraChargeApproved,false);
 const good=parseW54LocalBoot(JSON.stringify({...native,
   localModel:{backend:'llamacpp',modelId:'qwen3:8b',selectionEpoch:1}
 }),{installed:true});
 assert.equal(good.modelBackend,'llamacpp');
 assert.equal(good.protectedCredentialAttested,false);
 assert.throws(()=>parseW54LocalBoot(JSON.stringify({...native,
   localModel:{backend:'openrouter',modelId:'gpt-4o',selectionEpoch:1}
 }),{installed:true}),/W54_NATIVE_LOCAL_MODEL_SELECTION_INVALID/);
});
const port=async()=>await new Promise((resolve,reject)=>{
 const s=createServer();s.on('error',reject);
 s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(()=>resolve(n))});
});
test('genuine W47 installed-mode process consumes private W54 QA stdin, CookieStore result is NOT available from localhost HTTP', {timeout:80000},async()=>{
 const tmp=mkdtempSync(join(tmpdir(),'w47-w54-original-private-actual-'));
 const appRoot=join(tmp,'native-current-user-data');mkdirSync(appRoot);
 const runtime=join(tmp,'runtime');mkdirSync(runtime);
 for(const name of readdirSync(here).filter(s=>s.endsWith('.mjs')&&!s.includes('.test.')))
  cpSync(join(here,name),join(runtime,name));
 cpSync(join(here,'w47-w43-private-child.py'),join(runtime,'w47-w43-private-child.py'));
 writeFileSync(join(runtime,'runtime-build.json'),JSON.stringify({
  format:1,product:'YanceV2',source_sha:'02adaec9f72f28aa1c974a3537be626632015c34'
 }));
 const frame={version:1,source:'W54_NATIVE_CURRENT_USER',
  principalRef:'w54u_real_windows_qa_local_00001',
  installationRef:'w54i_real_windows_qa_install_01',
  sessionRevision:1,nativeRevocationGeneration:8,appLocalDataRoot:appRoot};
 const originPort=await port(),origin='http://127.0.0.1:'+originPort;
 const py=process.env.W54_QA_W43_PYTHON;
 const w43Root=process.env.W54_QA_W43_MODULE;
 let running=null;
 const start=async()=>{
  const env={...process.env,YANCE_W47_RUNTIME_MODE:'installed',
   YANCE_W47_API_PORT:String(originPort),YANCE_W47_WEB_ORIGIN:origin,
   YANCE_W47_W54_LOCAL_BOOT:'1'};
  if(py&&w43Root){env.YANCE_W47_W43_PYTHON_EXECUTABLE=py;env.YANCE_W47_W43_MODULE_ROOT=w43Root}
  const child=spawn(process.execPath,[join(runtime,'server.mjs')],{
   windowsHide:true,env,stdio:['pipe','pipe','pipe']
  });
  child.stdin.end(JSON.stringify(frame));
  let output='',err='';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data',x=>err+=x.slice(0,1000));
  const ready=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('real W47 startup timeout')),11000);
   child.once('error',reject);child.once('exit',n=>reject(Error('real W47 exited before READY '+n+' '+err.slice(0,500))));
   child.stdout.on('data',chunk=>{
    output+=chunk;
    for(const line of output.split('\n')){
     if(!line.trim())continue;
     let event;try{event=JSON.parse(line)}catch{continue}
     if(event.event==='V2_API_READY'){clearTimeout(timer);resolve(event);return}
    }
   });
  });
  assert.equal(ready.apiGitSha,'02adaec9f72f28aa1c974a3537be626632015c34');
  assert.match(ready.nativeHttpOnlyCookie,/^yance_local_session=[a-f0-9]{64}; HttpOnly; SameSite=Strict;/);
  return {child, cookie:ready.nativeHttpOnlyCookie.split(';')[0]};
 };
 const stop=async child=>{
  const closed=new Promise(done=>child.once('exit',done));
  child.kill();await closed;
 };
 try{
  running=await start();
  const illegal=await fetch(origin+'/api/v2/local-session/first-party',{
   method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
  assert.equal(illegal.status,503);
  assert.equal(illegal.headers.get('set-cookie'),null);
  const status=await fetch(origin+'/api/v2/local-session/status',{headers:{Cookie:running.cookie}});
  assert.equal(status.status,200);
  const s=await status.json();
  assert.equal(s.paired,true);assert.equal(s.sessionKind,'NATIVE_FIRST_PARTY');
  assert.equal(s.canSend,false);
  const history=async cookie=>{
   const r=await fetch(origin+'/api/v2/private-brain/history?threadId=personal',{headers:{Cookie:cookie}});
   return {status:r.status,response:await r.json()};
  };
  const h=await history(running.cookie);
  if(py&&w43Root){assert.equal(h.status,200,JSON.stringify(h.response));assert.equal(h.response.canSend,false);assert.equal(h.response.completeTurnCount,0)}
  else{assert.equal(h.status,503);assert.equal(h.response.error,'W43_ORIGINAL_PRIVATE_PORT_MISSING')}
  const r=await fetch(origin+'/api/v2/private-brain/turn',{
   method:'POST',headers:{Origin:origin,Cookie:running.cookie,'X-Yance-CSRF':s.csrfToken,
    'Content-Type':'application/json'},body:JSON.stringify({threadId:'personal',text:'Do not call any model',requestId:'w54qa_no_model_001'})});
  assert.equal(r.status,503);
  assert.equal((await r.json()).error,(py&&w43Root)?'MODEL_SETUP_REQUIRED':'W43_ORIGINAL_PRIVATE_PORT_MISSING');
  await stop(running.child);running=null;
  running=await start();
  const after=await history(running.cookie);
  if(py&&w43Root)assert.equal(after.status,200,JSON.stringify(after.response));
  else assert.equal(after.status,503);
  console.log('W54_W47_ORIGINAL_PRIVATE_STDIN_NATIVE_HTTP_HISTORY_GATE_PASS '+JSON.stringify({
   actualNodeProcess:true,realOriginalAgnoHistory:!!(py&&w43Root),
   browserFirstPartyDenied:true,noModelSetup:true,noBilledCalls:true,realSenderDisabled:true
  }));
 }finally{
  if(running){try{await stop(running.child)}catch{}}
  rmSync(tmp,{recursive:true,force:true,maxRetries:12,retryDelay:150});
 }
});

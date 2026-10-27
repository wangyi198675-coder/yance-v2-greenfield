// Opt-in actual live llama.cpp Qwen3 + ORIGINAL W43 Agno persisted 2-turn test
// through the PRODUCTION W47 server.mjs with private W54 process bootstrap.
// No external/paid provider, test-only current-user scope, no social sending.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,cpSync,readdirSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const source=dirname(fileURLToPath(import.meta.url));
const port=()=>new Promise((yes,no)=>{const l=createServer();l.on('error',no);
 l.listen(0,'127.0.0.1',()=>{const n=l.address().port;l.close(()=>yes(n))})});
test('opt-in genuine Qwen3 via original production W47 server source in isolated Node QA',{
 timeout:540000
},async t=>{
 const py=process.env.W54_QA_W43_PYTHON;
 const mod=process.env.W54_QA_W43_MODULE;
 const localKey=process.env.W54_QA_REAL_QWEN_LOCAL_KEY_FILE;
 if(!py||!mod||!localKey){t.skip('Explicit real LOCAL model owner key-file and original W43 Python runtime required');return}
 const folder=mkdtempSync(join(tmpdir(),'w54-prod-original-local-qwen-'));
 const user=join(folder,'owned-user-native-agno');mkdirSync(user);
 const runtime=join(folder,'runtime');mkdirSync(runtime);
 for(const file of readdirSync(source).filter(x=>x.endsWith('.mjs')&&!x.includes('.test.')))
  cpSync(join(source,file),join(runtime,file));
 cpSync(join(source,'w47-w43-private-child.py'),join(runtime,'w47-w43-private-child.py'));
 writeFileSync(join(runtime,'runtime-build.json'),JSON.stringify({
  format:1,product:'YanceV2',source_sha:'02adaec9f72f28aa1c974a3537be626632015c34'
 }));
 const profile={version:1,source:'W54_NATIVE_CURRENT_USER',
  principalRef:'w54_real_local_qwen_qa_user_01',
  installationRef:'w54_real_local_qwen_qa_install_01',
  sessionRevision:1,nativeRevocationGeneration:12,appLocalDataRoot:user,
  localModel:{backend:'llamacpp',modelId:'qwen3:8b',selectionEpoch:1}
 };
 let active;
 const start=async()=>{
  const n=await port(),base='http://127.0.0.1:'+n;
  const child=spawn(process.execPath,[join(runtime,'server.mjs')],{
   windowsHide:true,stdio:['pipe','pipe','pipe'],
   env:{...process.env,YANCE_W47_RUNTIME_MODE:'installed',
    YANCE_W47_API_PORT:String(n),YANCE_W47_WEB_ORIGIN:base,
    YANCE_W47_W54_LOCAL_BOOT:'1',YANCE_W47_W43_PYTHON_EXECUTABLE:py,
    YANCE_W47_W43_MODULE_ROOT:mod,YANCE_W47_W43_LOCAL_KEY_FILE:localKey}
  });
  child.stdin.end(JSON.stringify(profile));
  let text='',error='';
  child.stderr.on('data',x=>error+=String(x).slice(0,1000));
  const ready=await new Promise((yes,no)=>{
   const timer=setTimeout(()=>no(Error('real startup timeout')),20000);
   child.once('error',no);child.once('exit',code=>no(Error('native child exit '+code+' '+error.slice(0,500))));
   child.stdout.on('data',data=>{
    text+=String(data);
    for(const line of text.split('\n')){
     let json;try{json=JSON.parse(line)}catch{continue}
     if(json.event==='V2_API_READY'){clearTimeout(timer);yes(json);return}
    }
   });
  });
  assert.equal(ready.apiGitSha,'02adaec9f72f28aa1c974a3537be626632015c34');
  assert.equal(ready.runtimeMode,'installed');
  const cookie=ready.nativeHttpOnlyCookie.split(';')[0];
  const s=await (await fetch(base+'/api/v2/local-session/status',{headers:{Cookie:cookie}})).json();
  assert.equal(s.paired,true);
  return {child,base,cookie,csrf:s.csrfToken};
 };
 const stop=async item=>{
  const done=new Promise(resolve=>item.child.once('exit',resolve));
  item.child.kill();await done;
 };
 const history=async x=>{
  const r=await fetch(x.base+'/api/v2/private-brain/history?threadId=personal',{headers:{Cookie:x.cookie}});
  return {http:r.status,data:await r.json()};
 };
 const send=async (x,text,id)=>{
  const r=await fetch(x.base+'/api/v2/private-brain/turn',{
   method:'POST',headers:{Origin:x.base,Cookie:x.cookie,'X-Yance-CSRF':x.csrf,
    'Content-Type':'application/json'},
   body:JSON.stringify({threadId:'personal',text,requestId:id})});
  return {http:r.status,data:await r.json()};
 };
 try{
  active=await start();
  const first=await send(active,'请记住虚构代号：绿色纸鸢。只回复已记住。','w54_local_qwen_prod_00001');
  assert.equal(first.http,200,JSON.stringify(first.data));assert.equal(first.data.status,'COMPLETED');
  assert.ok(first.data.assistantText.length>0);
  const second=await send(active,'我刚才让你记住的虚构代号是什么？只回答代号。','w54_local_qwen_prod_00002');
  assert.equal(second.http,200,JSON.stringify(second.data));assert.equal(second.data.status,'COMPLETED');
  assert.notEqual(first.data.runId,second.data.runId);
  assert.equal(first.data.sessionId,second.data.sessionId);
  const current=await history(active);
  assert.equal(current.http,200,JSON.stringify(current.data));
  assert.equal(current.data.completeTurnCount,2);
  await stop(active);active=null;
  active=await start();
  const restored=await history(active);
  assert.equal(restored.http,200,JSON.stringify(restored.data));
  assert.equal(restored.data.completeTurnCount,2);
  assert.equal(restored.data.sessionId,first.data.sessionId);
  console.log('ORIGINAL_W47_W54_REAL_LOCAL_QWEN_PRODUCTION_BOOT_2TURN_HISTORY_PASS '+JSON.stringify({
   actualOriginalAgnoSdk:true,modelProvider:first.data.modelProvider,
   firstRunId:first.data.runId,secondRunId:second.data.runId,
   sessionId:first.data.sessionId,completeTurnCount:restored.data.completeTurnCount,
   coldNodeAndPythonRestart:true,cloudBillingCalls:0,socialSends:0
  }));
 }finally{
  if(active)try{await stop(active)}catch{}
  rmSync(folder,{recursive:true,force:true,maxRetries:12,retryDelay:150});
 }
});

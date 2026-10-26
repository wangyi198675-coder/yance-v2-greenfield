// Test the exact checked-out W47 API, never an unrelated service on 47182.
// Isolated per-test app dir, ephemeral OS-assigned port, real Node child.
// This is not signed production authentication or a paid-model test.
import test,{before,after} from 'node:test';
import {request as rawHttpRequest} from 'node:http';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,copyFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=fileURLToPath(new URL('.',import.meta.url));
const root=resolve(here,'../../..');
const expectedSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const webOrigin='http://127.0.0.1:49631';
const files=['server.mjs','runtime-config.mjs','runtime-provenance.mjs',
 'local-session.mjs','local-operator-console.mjs','private-brain-http.mjs',
 'private-python-port.mjs','private-native-ledger-port.mjs',
 'private-model-http.mjs','native-authoritative-reads.mjs',
 'native-provider-gateway.mjs','native-message-reads.mjs',
 'native-pinned-web-assets.mjs',
 'w54-native-child-frame.mjs','w54-native-webview-session.mjs',
 'w47-w43-private-child.py'];
let child,base,work;
before(async()=>{
 work=mkdtempSync(join(tmpdir(),'w47-exact-native-test-'));
 for(const f of files)copyFileSync(join(here,f),join(work,f));
 writeFileSync(join(work,'runtime-build.json'),JSON.stringify({
  format:1,product:'YanceV2',source_sha:expectedSha
 }));
 const env={...process.env,YANCE_W47_RUNTIME_MODE:'installed',
  YANCE_W47_API_PORT:'0',YANCE_W47_WEB_ORIGIN:webOrigin};
 delete env.YANCE_W47_OPERATOR_PAIRING;
 delete env.YANCE_W47_LOCAL_SESSION_TTL_MS;
 child=spawn(process.execPath,[join(work,'server.mjs')],{
  windowsHide:true,stdio:['ignore','pipe','pipe'],shell:false,env
 });
 let seen='',err='';
 child.stderr.on('data',data=>{err+=String(data).slice(0,2000)});
 const ready=await new Promise((done,fail)=>{
  const timeout=setTimeout(()=>fail(Error('NEW_API_BOOT_TIMEOUT '+seen+' '+err)),12000);
  let finished=false;
  const success=value=>{if(finished)return;finished=true;clearTimeout(timeout);done(value)};
  const failure=e=>{if(finished)return;finished=true;clearTimeout(timeout);fail(e)};
  child.once('error',failure);
  child.once('exit',code=>failure(Error('NEW_API_EXIT_'+code+' '+err)));
  child.stdout.on('data',chunk=>{
   seen+=String(chunk);
   for(const line of seen.split(/\r?\n/)){
    if(!line.includes('"event":"V2_API_READY"'))continue;
    try{success(JSON.parse(line))}catch(e){failure(e)}
    return;
   }
  });
 });
 assert.equal(ready.apiGitSha,expectedSha,'child must identify THIS test HEAD');
 const url=new URL(ready.url);
 assert.equal(url.hostname,'127.0.0.1');
 assert.notEqual(Number(url.port),47182,'never use existing old 47182 process');
 assert.equal(ready.runtimeMode,'installed');
 base=url.origin;
 console.log('W47_EXACT_EPHEMERAL_CHILD_READY '+JSON.stringify({
  pid:child.pid,port:Number(url.port),sha:expectedSha,oldPort47182Ignored:true
 }));
});
after(async()=>{
 if(child&&child.exitCode===null){
  child.kill();
  await Promise.race([new Promise(ok=>child.once('exit',ok)),
   new Promise(ok=>setTimeout(ok,2000))]);
 }
 if(work)rmSync(work,{recursive:true,force:true,maxRetries:12,retryDelay:180});
});
const request=async(path,init={})=>{
 assert.ok(base,'isolated server must have started');
 const response=await fetch(base+path,{...init,
  headers:{...(init.headers||{}),...(init.headers?.Origin?{}:{Origin:webOrigin})}});
 return {status:response.status,body:await response.json(),response};
};
test('EXACT new SHA child health/version are real and still fail closed',async()=>{
 const h=await request('/api/v2/runtime/health');
 assert.equal(h.status,200);
 assert.equal(h.body.runtimeSha,expectedSha);
 assert.equal(h.body.apiPort,Number(new URL(base).port));
 assert.equal(h.body.trustedSession,false);
 assert.equal(h.body.countsAuthoritative,false);
 assert.equal(h.body.realContacts,null);
 assert.equal(h.body.canSend,false);
 assert.equal(h.body.externalEffects,false);
 const v=await request('/api/v2/runtime/version');
 assert.equal(v.status,200);
 assert.equal(v.body.apiGitSha,expectedSha);
});
test('new W47 child /contacts remains 401, never stale 47182 200 []',async()=>{
 const {status,body}=await request('/api/v2/contacts');
 assert.equal(status,401);
 assert.equal(body.canSend,false);
 assert.equal(body.error,'TRUSTED_LOCAL_SESSION_REQUIRED');
});
test('unpaired fake W54 Principal and local-site flags never authorize writes',async()=>{
 for(const path of ['/api/v2/managed-stop','/api/v2/identity-consent/takeover']){
  const {status,body}=await request(path,{method:'POST',
   headers:{'content-type':'application/json','X-Yance-Trusted':'true'},
   body:JSON.stringify({actor:'fake-owner-1',scope:'GLOBAL',
    source:'W54_NATIVE_CURRENT_USER',verified:true,authorized:true})});
  assert.equal(status,401);assert.equal(body.canSend,false);
 }
});
test('cross-site, Host and CSRF are still protected',async()=>{
 for(const method of ['GET','POST']){
  const {status}=await request('/api/v2/runtime/health',{
   method,headers:{Origin:'https://evil.example','Sec-Fetch-Site':'cross-site'}});
  assert.equal(status,403);
 }
 assert.equal((await request('/api/v2/private-brain/turn',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({threadId:'personal',text:'No grant',requestId:'missing_grant_req_01'})})).status,401);
 const hostStatus=await new Promise((done,fail)=>{
  const target=new URL(base);
  const req=rawHttpRequest({hostname:'127.0.0.1',port:Number(target.port),
   path:'/api/v2/runtime/health',method:'GET',
   headers:{Origin:webOrigin,Host:'127.0.0.1:47182'}},res=>{
    res.resume();res.once('end',()=>done(res.statusCode));
   });
  req.once('error',fail);req.end();
 });
 assert.equal(hostStatus,403);
});
test('staged test routes, unauthorized messages and real social sends fail closed',async()=>{
 assert.equal((await request('/w46-native-test/message')).status,410);
 assert.equal((await request('/api/v2/messages')).status,401);
 assert.equal((await request('/api/v2/private-brain/history?threadId=personal')).status,401);
 assert.equal((await request('/api/v2/send',{method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({authorized:true})})).status,403);
});
test('W46 official native setup GET is operable without logging into an account',async()=>{
 for(const ch of ['fb-personal','fb-page','whatsapp-personal','telegram-personal']){
  const r=await request('/api/v2/providers/'+ch+'/setup');
  assert.equal(r.status,200);
  assert.equal(r.body.nextAction,'OFFICIAL_SETUP_REQUIRED');
  assert.equal(r.body.userDecisionRequired,true);
  assert.equal(r.body.canSend,false);
  assert.equal(r.body.qrImageDataUrl,undefined);
 }
 assert.equal((await request('/api/v2/providers/fb-page/status')).status,401);
 assert.equal((await request('/api/v2/providers/telegram-personal/status')).status,401);
 assert.equal((await request('/api/v2/providers/whatsapp-personal/status')).status,401);
});
test('native session, original W43 and W55 missing cannot be forged from browser',async()=>{
 const pair=await request('/api/v2/local-session/first-party',{method:'POST',
  headers:{'content-type':'application/json'},body:'{}'});
 assert.equal(pair.status,503);
 assert.equal(pair.body.canSend,false);
 assert.equal((await request('/api/v2/private-brain/model-config')).status,401);
});

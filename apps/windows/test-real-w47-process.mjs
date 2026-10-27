// W54 P0 REAL W47 child negative acceptance test (no test-only W47 mock).
// Spawns EXACT W47 server.mjs with isolated ephemeral Windows loopback port,
// checks genuine first-party stays 503, then sends official W54 framed stdin
// bootstrap. A real W47 child READY frame will be detected; no success is
// asserted unless the ORIGINAL server actually implements the protocol.
import {spawn} from 'node:child_process';
import {createHash, randomBytes} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {request} from 'node:http';
import {createServer as probeServer} from 'node:net';
import {strict as assert} from 'node:assert';

const runtimeRoot=process.env.W54_QA_W47_RUNTIME_DIR;
if(!runtimeRoot||!existsSync(join(runtimeRoot,'server.mjs')))
  throw Error('W47_REAL_SOURCE_DIRECTORY_REQUIRED');
const serverFile=resolve(runtimeRoot,'server.mjs');
const sha=createHash('sha256').update(readFileSync(serverFile)).digest('hex');
const pid=process.pid;
const origin='http://127.0.0.1:44760';
let stdout='',stderr='',child;
const freePort=await new Promise((resolve,reject)=>{const s=probeServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port))})});
function http(port,method,path,body){
 return new Promise((done,reject)=>{
  const req=request({hostname:'127.0.0.1',port,method,path,timeout:3000,headers:{
   Host:'127.0.0.1:'+port,Origin:origin,
   ...(method==='POST'?{'content-type':'application/json','content-length':Buffer.byteLength(body)}:{})
  }},res=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>done({status:res.statusCode,body:b}))});
  req.on('error',reject);req.on('timeout',()=>req.destroy(Error('W47_HTTP_TIMEOUT')));
  req.end(body||undefined);
 });
}
try{
 child=spawn(process.execPath,[serverFile],{
  cwd:runtimeRoot,windowsHide:true,env:{
   ...process.env,
   YANCE_W47_RUNTIME_MODE:'development',
   YANCE_W47_API_PORT:String(freePort),
   YANCE_W47_WEB_ORIGIN:origin,
   YANCE_W47_OPERATOR_PAIRING:''
  },stdio:['pipe','pipe','pipe']
 });
 child.stdout.on('data',chunk=>stdout+=chunk.toString('utf8'));
 child.stderr.on('data',chunk=>stderr+=chunk.toString('utf8'));
 const started=Date.now();let ready=null;
 while(Date.now()-started<5000){
  for(const line of stdout.split(/\r?\n/)){
   try{const obj=JSON.parse(line);if(obj.event==='V2_API_READY')ready=obj}catch{}
  }
  if(ready||child.exitCode!==null)break;
  await delay(50);
 }
 assert.ok(ready,'REAL_W47_CHILD_START_FAILED '+stderr.slice(0,200));
 const url=new URL(ready.url);
 assert.equal(url.hostname,'127.0.0.1');
 const port=Number(url.port);
 assert.ok(port>0 && port<65536);
 const health=await http(port,'GET','/api/v2/runtime/health');
 assert.equal(health.status,200);
 const state=JSON.parse(health.body);
 assert.equal(state.canSend,false);
 assert.equal(state.trustedSession,false);
 const first=await http(port,'POST','/api/v2/local-session/first-party','{}');
 assert.equal(first.status,503,'REAL_W47_UNEXPECTED_AUTO_SESSION: FAIL RELEASE');
 const f=JSON.parse(first.body);assert.equal(f.canSend,false);
 // Native framed data is delivered over the actual child inherited stdin,
 // not to HTTP. This test CANNOT impersonate Tauri OS authority.
 const fakeUser='w54u_'+randomBytes(32).toString('hex');
 const frame={
  protocol:'W54_W47_NATIVE_CHILD_V1',
  challenge:randomBytes(32).toString('hex'),
  principalRef:fakeUser,
  installationRef:'w54i_'+randomBytes(32).toString('hex'),
  nativeSessionRef:'w54s_'+randomBytes(32).toString('hex'),
  nativeSessionRevision:1,nativeRevocationGeneration:2,
  appLocalDataRoot:'C:\\Users\\TEST_ONLY_QA\\AppData\\Local\\com.yance.v2.native-session-lab\\data'
 };
 const json=Buffer.from(JSON.stringify(frame));const prefix=Buffer.alloc(4);prefix.writeUInt32BE(json.length);
 child.stdin.write(Buffer.concat([prefix,json]));child.stdin.end();
 await delay(400);
 // No accepted binary W54 child ACK has been seen. Because server.mjs does
 // not import w54-native-child-frame.mjs this cannot be assumed implemented.
 // Runtime startup log is textual JSON, not the W54 child binary ACK protocol.
 const nativeAckObserved=stdout.includes('"status":"CHILD_READY"');
 assert.equal(nativeAckObserved,false,'REAL_W47_CHILD_READY_REQUIRES_SECURITY_REVIEW');
 const after=await http(port,'POST','/api/v2/local-session/first-party','{}');
 assert.equal(after.status,503,'FAKE_NATIVE_FRAME_MUST_NOT_AUTHORIZE_LOCALHOST');
 console.log(JSON.stringify({
  status:'REAL_W47_PROCESS_NEGATIVE_QA_PASS_POSITIVE_NATIVE_PAIR_HOLD',
  actualNodeExe:process.execPath,actualW47ServerSha256:sha,
  childPid:child.pid,qaRunnerPid:pid,isolationPort:port,
  realW47Health:health.status,actualSessionAvailable:false,
  beforeFakePipe:first.status,afterFakePipe:after.status,
  W47ChildAckObserved:nativeAckObserved,webviewSession:false,
  canSend:false,chargeableProviderInvocations:0
 }));
} finally {
 if(child){
  child.stdin?.destroy();child.kill();
  for(let i=0;i<30&&child.exitCode===null;i++)await delay(100);
  if(child.exitCode===null)child.kill('SIGKILL');
 }
}

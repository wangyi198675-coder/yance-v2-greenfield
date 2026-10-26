// Explicit on-device QA only: real W26 running official maitrix-meta bridge
// status -> real isolated W47 child -> unchanged W46 DTO validator.
// NOT an account authorization test and NEVER a Platform login/send.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,copyFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseChannelState,parseChannelSetup} from '../../../apps/web/src/channel-setup-contract.mjs';
const here=fileURLToPath(new URL('.',import.meta.url));
const root=resolve(here,'../../..');
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const files=['server.mjs','runtime-config.mjs','runtime-provenance.mjs','local-session.mjs',
 'local-operator-console.mjs','private-brain-http.mjs','private-python-port.mjs',
 'private-native-ledger-port.mjs','private-model-http.mjs',
 'native-authoritative-reads.mjs','native-provider-gateway.mjs','native-message-reads.mjs',
 'native-pinned-web-assets.mjs',
 'w54-native-child-frame.mjs','w54-native-webview-session.mjs','w47-w43-private-child.py'];
test('real W26 bridge RUNNING but account WAITING_USER_AUTH through actual isolated W47 HTTP',async t=>{
 const externalPort=process.env.YANCE_W47_TEST_REAL_W26_PORT;
 if(!externalPort){t.skip('explicit Windows-only original W26 SDK availability test');return}
 if(!/^\d{4,5}$/.test(externalPort)||+externalPort<1024||+externalPort>65535)
  throw Error('W26_ACTUAL_PORT_REQUIRED');
 const webOrigin='http://127.0.0.1:44766';
 const work=mkdtempSync(join(tmpdir(),'w47-w26-actual-'));
 let child;
 try{
  for(const f of files)copyFileSync(join(here,f),join(work,f));
  writeFileSync(join(work,'runtime-build.json'),JSON.stringify({
   format:1,product:'YanceV2',source_sha:sha
  }));
  const env={...process.env,YANCE_W47_RUNTIME_MODE:'installed',
   YANCE_W47_API_PORT:'0',YANCE_W47_WEB_ORIGIN:webOrigin,
   YANCE_W47_W26_READONLY_PORT:externalPort};
  delete env.YANCE_W47_OPERATOR_PAIRING;
  child=spawn(process.execPath,[join(work,'server.mjs')],{
   windowsHide:true,shell:false,stdio:['ignore','pipe','pipe'],env
  });
  let raw='',err='';
  child.stderr.on('data',c=>{err+=String(c)});
  const ready=await new Promise((ok,fail)=>{
   const timeout=setTimeout(()=>fail(Error('W47_CHILD_BOOT_TIMEOUT '+raw+' '+err)),12000);
   child.once('exit',n=>{clearTimeout(timeout);fail(Error('W47_CHILD_EXIT_'+n+' '+err))});
   child.stdout.on('data',x=>{
    raw+=String(x);
    for(const line of raw.split(/\r?\n/))if(line.includes('"event":"V2_API_READY"')){
     clearTimeout(timeout);try{ok(JSON.parse(line))}catch(e){fail(e)}return
    }
   });
  });
  assert.equal(ready.apiGitSha,sha);
  const endpoint=ready.url;
  assert.notEqual(new URL(endpoint).port,'47182');
  async function read(path){
   const result=await fetch(endpoint+path,{headers:{Origin:webOrigin}});
   return {status:result.status,value:await result.json()}
  }
  const page=await read('/api/v2/providers/fb-personal/status');
  assert.equal(page.status,200);
  assert.equal(parseChannelState('FB_PERSONAL',page.value).state,'WAITING_USER_AUTH');
  assert.equal(page.value.bridgeState,'RUNNING_OFFICIAL_APP_SERVICE_REGISTERED');
  assert.equal(page.value.authorizedByNativeOwner,false);
  assert.equal(page.value.accountIdentityVerified,false);
  assert.equal(page.value.sdkReportedOnly,true);
  const setup=await read('/api/v2/providers/fb-personal/setup');
  assert.equal(setup.status,200);
  assert.equal(parseChannelSetup('FB_PERSONAL',setup.value).nextAction,'OFFICIAL_SETUP_REQUIRED');
  assert.equal((await read('/api/v2/contacts')).status,401);
  const unauthPrivate=await fetch(endpoint+'/api/v2/private-brain/turn',{
   method:'POST',headers:{Origin:webOrigin,'content-type':'application/json'},
   body:JSON.stringify({threadId:'personal',text:'not authorized',
    requestId:'w47_real_w26_no_model_01'})
  });
  assert.equal(unauthPrivate.status,401);
  assert.equal((await read('/api/v2/providers/whatsapp-personal/status')).status,401);
  assert.equal((await read('/api/v2/providers/telegram-personal/status')).status,401);
  console.log('W47_REAL_W26_OFFICIAL_HTTP_ACK '+JSON.stringify({
   childPid:child.pid,childPort:Number(new URL(endpoint).port),apiSha:sha,
   w26State:page.value.bridgeState,w26Account:'WAITING_USER_AUTH',
   w46OriginalDTO:true,canSend:false,realContacts:0,
   actualUserLogin:false}));
 }finally{
  if(child?.exitCode===null){
   child.kill();await Promise.race([new Promise(ok=>child.once('exit',ok)),
     new Promise(ok=>setTimeout(ok,2000))]);
  }
  rmSync(work,{recursive:true,force:true,maxRetries:10,retryDelay:100});
 }
});

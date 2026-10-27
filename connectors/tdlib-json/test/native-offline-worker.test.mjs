// Real official tdjson.dll process worker test. No login, phone, api_hash,
// Telegram database path, network sendMessage or user account.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectInstalledTDJson} from '../src/native-tdjson.mjs';

const enabled=process.env.YANCE_W29_EXPECT_NATIVE==='1';
const runtime=resolve(dirname(fileURLToPath(import.meta.url)),'../runtime');
test('real TDJsonHost worker lifecycle via official td_send and td_receive, no user account',{
  skip:enabled?false:'Requires real x64 Windows pinned native TDLib and W29 opt-in',
},async()=>{
  const proof=await inspectInstalledTDJson(runtime);
  const child=spawn(proof.hostExecutable,['--worker'],{
    cwd:runtime,windowsHide:true,stdio:['pipe','pipe','pipe'],shell:false});
  const received=[];
  const stream=createInterface({input:child.stdout});
  let stopped=false;
  let resolved=false;
  let timeout;
  try{
    const exit=await new Promise((yes,no)=>{
      timeout=setTimeout(()=>{child.kill();no(Error('NATIVE_WORKER_TIMEOUT'))},8000);
      child.once('error',no);
      child.once('close',code=>yes(code));
      stream.on('line',line=>{
        let event;
        try{event=JSON.parse(line)}catch{return;}
        received.push(event);
        if(event.kind==='native_tdjson_worker_started'){
          // Official TDLib request. This cannot send a Telegram message.
          child.stdin.write(JSON.stringify({action:'tdlib',
            query:{'@type':'getOption',name:'version','@extra':'w29-offline-version'}})+'\n');
        }
        if(event.kind==='tdlib_update' &&
          event.data?.['@type']==='optionValueString' &&
          event.data?.['@extra']==='w29-offline-version'){
          resolved=event.data.value==='1.8.69';
        }
        const state=received.some(x=>x.kind==='tdlib_auth_state'&&
          x.state==='authorizationStateWaitTdlibParameters');
        if(!stopped && state && resolved){
          stopped=true;
          child.stdin.write(JSON.stringify({action:'stop'})+'\n');
        }
      });
    });
    assert.equal(exit,0);
    assert.ok(Number.isInteger(child.pid)&&child.pid>0);
    assert.equal(stopped,true,'must see both official auth state and getOption response');
    assert.ok(received.some(x=>x.kind==='native_tdjson_worker_started'&&x.authorized===false));
    assert.ok(received.some(x=>x.kind==='native_request_accepted'&&x.method==='getOption'));
    assert.ok(received.some(x=>x.kind==='tdlib_auth_state'&&
      x.state==='authorizationStateWaitTdlibParameters'&&x.authorized===false));
    assert.equal(resolved,true);
    assert.ok(received.every(x=>x.canSend!==true));
    console.log('REAL_TDJSON_OFFLINE_WORKER_LIFECYCLE_PASS',{
      nativePid:child.pid,sha:proof.dllSha256,
      events:received.map(x=>x.kind).filter(Boolean)});
  }finally{
    clearTimeout(timeout);
    stream.close();
    if(child.exitCode===null)child.kill();
  }
});

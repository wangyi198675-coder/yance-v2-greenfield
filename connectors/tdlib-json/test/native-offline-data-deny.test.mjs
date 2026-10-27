// Actual official TDLib Windows P/Invoke binary. Before a user logs in,
// ALL SDK private contacts/chats/history/avatar methods must fail closed.
// No Telegram phone, QR, API key, database or real account session is created.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {createInterface} from 'node:readline';
import {inspectInstalledTDJson} from '../src/native-tdjson.mjs';

const root=resolve(fileURLToPath(new URL('../runtime/',import.meta.url)));
const enabled=process.env.YANCE_W29_EXPECT_NATIVE==='1';
test('REAL tdjson worker denies private chat/history/avatar SDK calls until user auth',{
  skip:enabled?false:'requires an official Windows tdjson.dll and explicit native test opt-in',
},async()=>{
  const file=await inspectInstalledTDJson(root);
  const child=spawn(file.hostExecutable,['--worker'],{
    cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe'],shell:false});
  const expect=5,seen=new Set(),nativeStates=[];
  const requests=[
    {'@type':'getChats',chat_list:{'@type':'chatListMain'},limit:1},
    {'@type':'getChatHistory',chat_id:88888,from_message_id:0,offset:0,limit:1,only_local:true},
    {'@type':'getContacts'},
    {'@type':'getUserProfilePhotos',user_id:88888,offset:0,limit:1},
    {'@type':'downloadFile',file_id:1,priority:1,offset:0,limit:0,synchronous:false},
  ];
  const reader=createInterface({input:child.stdout,crlfDelay:Infinity});
  let stopSent=false;
  let timeout;
  try{
    const exit=await new Promise((done,fail)=>{
      timeout=setTimeout(()=>{child.kill();fail(Error('OFFLINE_NATIVE_DENIAL_TIMEOUT'));},10000);
      child.once('error',fail);
      child.once('close',code=>done(code));
      reader.on('line',raw=>{
        let e;try{e=JSON.parse(raw)}catch{return;}
        if(e.kind==='native_tdjson_worker_started'){
          child.stdin.write(JSON.stringify({action:'tdlib',
            query:{'@type':'getOption',name:'version'}})+'\n');
          for(const q of requests)child.stdin.write(JSON.stringify({
            action:'tdlib',query:q})+'\n');
        }
        if(e.kind==='tdlib_auth_state')nativeStates.push(e.state);
        if(e.kind==='error' && e.code==='WAITING_USER_AUTH'){
          // Every private read is denied from the REAL C# native host;
          // these are not synthetic TDLib events.
          seen.add(seen.size);
        }
        if(seen.size===expect &&
          nativeStates.includes('authorizationStateWaitTdlibParameters') &&
          !stopSent){
          stopSent=true;
          child.stdin.write('{"action":"stop"}\n');
        }
      });
    });
    assert.equal(exit,0);
    assert.equal(seen.size,expect);
    assert.ok(nativeStates.includes('authorizationStateWaitTdlibParameters'));
    console.log('W29_REAL_NATIVE_SDK_UNAUTHORIZED_DATA_DENIED',{
      pid:child.pid,deniedMethods:expect,
      officialState:'authorizationStateWaitTdlibParameters',
      loadedBinarySha256:file.dllSha256});
  }finally{
    clearTimeout(timeout);reader.close();
    if(child.exitCode===null)child.kill();
  }
});

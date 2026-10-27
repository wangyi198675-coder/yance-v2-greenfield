import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createW29TelegramAuthorizationPort} from '../src/native-telegram-auth-flow.mjs';

const runtime = fileURLToPath(new URL('../runtime/',import.meta.url));
const nativeRequired=process.env.YANCE_W29_EXPECT_NATIVE==='1';
function fake({
  nativeAuthorizationState='authorizationStateWaitPhoneNumber',
  platformUserIdExact=null,accountIdentityVerified=false,
  load=async()=>({freshUserApproved:false}),
}={}){
  const requests=[];let beginCalls=0,logouts=[];
  const c={
    status:()=>({nativeRunning:beginCalls>0,canSend:false}),
    begin:async arg=>{beginCalls++;requests.push(['begin',arg]);return {nativeRunning:true,
      telegramAuthorized:false,canSend:false,stage:'AUTH_IN_PROGRESS'};},
    readPrivateAccountState:async()=>({
      nativeRunning:true,nativeAuthorizationState,
      accountIdentityVerified,platformUserIdExact,logoutPending:false,
      qrLoginLink:nativeAuthorizationState==='authorizationStateWaitOtherDeviceConfirmation'?
        'tg://login?token=TDLIB_ONLY_TEST_TOKEN':null,
    }),
    authorizeStep:async arg=>{requests.push(['td_send',arg.request]);return {nativeCommandAccepted:true,
      providerAck:false,canSend:false};},
    disconnect:async arg=>{logouts.push(arg);return {nativeAuthorizationState:'authorizationStateLoggingOut'};},
  };
  return {port:createW29TelegramAuthorizationPort({
    runtimeDir:runtime,controller:c,
    loadApprovedNativeConfig:load,
  }),requests,logouts,getBegins:()=>beginCalls};
}
test('W29 owner setup port cannot create auth session from read-only setup',async()=>{
  // No actual native binary is needed to validate side-effect semantics here.
  const f=fake();
  const before=f.getBegins();assert.equal(before,0);
  const s=await f.port.state({});
  assert.equal(s.status,'WAITING_USER_AUTH');
  assert.equal(s.nextAction,'USER_CLICK_CONNECT');
  assert.equal(f.getBegins(),0);
});
test('only click connect enters previously implemented native controller',{skip:!nativeRequired},async()=>{
  const f=fake();const s=await f.port.connect({sessionHandle:'w47',gestureId:'click'});
  assert.equal(s.nativeRunning,true);
  assert.equal(f.requests[0][0],'begin');
  assert.equal(f.requests[0][1].gestureId,'click');
});
test('native official QR request not fake rendered QR',async()=>{
  const f=fake();await f.port.act({action:'qr'});
  assert.deepEqual(f.requests[0][1],{'@type':'requestQrCodeAuthentication',other_user_ids:[]});
  assert.equal(f.requests[0][1].sendMessage,undefined);
});
test('only actual TDLib other-device authorization state exposes native QR link',{skip:!nativeRequired},async()=>{
  const f=fake({nativeAuthorizationState:'authorizationStateWaitOtherDeviceConfirmation'});
  await f.port.connect({gestureId:'click'});
  const s=await f.port.state({sessionHandle:'local-session'});
  assert.equal(s.nextAction,'SCAN_OFFICIAL_QR');
  assert.match(s.qrLoginLink,/^tg:\/\/login\?token=/);
  assert.equal(s.status,'WAITING_USER_AUTH');assert.equal(s.canSend,false);
});
test('wrong official state rejects QR and verification codes',async()=>{
  const f=fake({nativeAuthorizationState:'authorizationStateWaitPassword'});
  await assert.rejects(f.port.act({action:'qr'}),{code:'TDLIB_AUTH_STATE_MISMATCH'});
  await assert.rejects(f.port.act({action:'code',data:{code:'1234'}}),
    {code:'TDLIB_AUTH_STATE_MISMATCH'});
  assert.equal(f.requests.length,0);
});
test('real configure request requires original W55 approved user credentials',async()=>{
  const f=fake({nativeAuthorizationState:'authorizationStateWaitTdlibParameters'});
  await assert.rejects(f.port.act({action:'configure'}),
    {code:'USER_APPROVED_TDLIB_CONFIGURATION_REQUIRED'});
  assert.equal(f.requests.length,0);
});
test('validated configuration generates real official TDLib v1.8.69 parameter schema',async()=>{
  const f=fake({nativeAuthorizationState:'authorizationStateWaitTdlibParameters',
    load:async()=>({freshUserApproved:true,apiId:12345,apiHash:'a'.repeat(32),
      databaseDirectory:'C:\\MyProfile\\TDLib\\fresh1',
      filesDirectory:'C:\\MyProfile\\TDLib\\fresh1\\files',
      databaseEncryptionKey:'protected-user-material',
    })});
  await f.port.act({action:'configure',gestureId:'click'});
  const req=f.requests[0][1];
  assert.equal(req['@type'],'setTdlibParameters');
  assert.equal(req.api_id,12345);
  assert.equal(req.use_test_dc,false);
  assert.equal(req.use_message_database,true);
  assert.equal(req.database_encryption_key,'protected-user-material');
  assert.equal(req.device_model,'Yance V2 Desktop');
  assert.equal(f.requests.length,1);
});
test('phone, code, password use official TDLib methods, no provider send intent',async()=>{
  for(const [state,action,data,method]of [
    ['authorizationStateWaitPhoneNumber','phone',{phoneNumber:'+12345678900'},'setAuthenticationPhoneNumber'],
    ['authorizationStateWaitCode','code',{code:'12345'},'checkAuthenticationCode'],
    ['authorizationStateWaitPassword','password',{password:'only-user-chosen'},'checkAuthenticationPassword'],
    ['authorizationStateWaitEmailCode','emailCode',{code:'6digits'},'checkAuthenticationEmailCode'],
  ]){
    const f=fake({nativeAuthorizationState:state});
    await f.port.act({action,data});
    assert.equal(f.requests[0][1]['@type'],method);
    assert.equal(f.requests[0][1].sendMessage,undefined);
  }
});
test('actual W24-attested account identity only in private session state',{skip:!nativeRequired},async()=>{
  const f=fake({nativeAuthorizationState:'authorizationStateReady',
    accountIdentityVerified:true,platformUserIdExact:'123123123'});
  await f.port.connect({});
  const s=await f.port.state({});
  assert.equal(s.platformUserIdExact,'123123123');
  assert.equal(s.status,'ONLINE_VERIFIED');
  assert.equal(s.canSend,false);
});
test('owner account remove queues only native logOut, not falsely confirmed',async()=>{
  const f=fake();await f.port.disconnect({gestureId:'owner-click',removeAccount:true});
  assert.equal(f.logouts.length,1);
  assert.equal(f.logouts[0].logout,true);
});
test('attempted direct Telegram sendMessage rejected at auth surface',async()=>{
  const f=fake();await assert.rejects(f.port.act({action:'sendMessage',data:{text:'hello'}}),
    {code:'TDLIB_ACTION_NOT_ALLOWED'});
  assert.equal(f.requests.length,0);
});

test('actual official tdjson worker returns original AuthorizationState detail (no login)',{
  skip:!nativeRequired,
},async()=>{
  const {spawn}=await import('node:child_process');
  const {resolve}=await import('node:path');
  const {createInterface}=await import('node:readline');
  const {inspectInstalledTDJson}=await import('../src/native-tdjson.mjs');
  const sdk=await inspectInstalledTDJson(runtime);
  const child=spawn(sdk.hostExecutable,['--worker'],{
    cwd:runtime,windowsHide:true,stdio:['pipe','pipe','pipe'],shell:false});
  let read=null;
  const lines=createInterface({input:child.stdout});
  const code=await new Promise((ok,no)=>{
    const timeout=setTimeout(()=>{child.kill();no(Error('NATIVE_AUTH_PROBE_TIMEOUT'));},7000);
    lines.on('line',line=>{
      let e;try{e=JSON.parse(line)}catch{return}
      if(e.kind==='native_tdjson_worker_started'){
        // Real TDLib initialization is lazy; request a read-only native option.
        child.stdin.write(JSON.stringify({action:'tdlib',
          query:{'@type':'getOption',name:'version'}})+'\n');
      }
      if(e.kind==='tdlib_auth_state'){
        read=e;
        child.stdin.write('{"action":"stop"}\n');
      }
    });
    child.once('error',e=>{clearTimeout(timeout);no(e)});
    child.once('close',e=>{clearTimeout(timeout);ok(e)});
  });
  assert.equal(code,0);
  assert.equal(read?.state,'authorizationStateWaitTdlibParameters');
  assert.equal(read?.details?.['@type'],'authorizationStateWaitTdlibParameters');
  assert.equal(read?.authorized,false);
  assert.equal(read?.canSend,false);
});

test('actual native SDK setup metadata read never opens user login',{skip:!nativeRequired},async()=>{
  const f=fake();
  const s=await f.port.setup();
  assert.equal(s.nativeSdkInstalled,true);
  assert.equal(s.version,'1.8.69');
  assert.match(s.nativeDllSha256,/^[0-9a-f]{64}$/);
  assert.equal(s.nextAction,'USER_CLICK_CONNECT');
  assert.equal(s.actualQrReady,false);
  assert.equal(s.connected,null); // no public account identity assertion
  assert.equal(f.getBegins(),0);
});

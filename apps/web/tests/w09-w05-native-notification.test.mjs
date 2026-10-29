import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 createW05NativeNotificationPort,notifyVerifiedAgnoInBackground
} from '../src/w05-native-notification-port.mjs';
const text=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const validSession={nativeOsVerified:true,nativeSessionActive:true,canSend:false};
function fake(perm=true,session=validSession){
 const calls=[];
 const tauri={core:{invoke:async(cmd,payload)=>{
  calls.push({cmd,payload});
  if(cmd==='session_status')return session;
  if(cmd==='plugin:notification|is_permission_granted')return perm;
  if(cmd==='plugin:notification|request_permission')return 'granted';
  if(cmd==='plugin:notification|notify')return null;
  throw Error('UNKNOWN_NATIVE_COMMAND');
 }}};
 return {calls,port:createW05NativeNotificationPort({tauri})};
}
test('browser gets no native IPC, permission or Toast impersonation',async()=>{
 const x=createW05NativeNotificationPort({tauri:{}});
 assert.equal(x.available,false);
 await assert.rejects(()=>x.nativeTest(),/W05_NATIVE_HOST_UNAVAILABLE/);
});
test('native Windows permission and Toast require original current-user session',async()=>{
 const bad=fake(true,{nativeOsVerified:false,nativeSessionActive:true,canSend:false});
 await assert.rejects(()=>bad.port.permission(),/CURRENT_WINDOWS_PRINCIPAL_NOT_VERIFIED/);
 assert.equal(bad.calls.length,1);
 const denied=fake(false);assert.equal(await denied.port.permission(),'denied');
 await assert.rejects(()=>denied.port.nativeTest(),/OS_PERMISSION_NOT_GRANTED/);
 assert.equal(denied.calls.some(x=>x.cmd==='plugin:notification|notify'),false);
});
test('native test is a silent local generic Toast and does not claim delivery',async()=>{
 const {port,calls}=fake();
 const r=await port.nativeTest();
 assert.deepEqual(r,{submitted:true,delivered:false,status:'OS_TOAST_SUBMITTED_NOT_DELIVERY_ACK'});
 const send=calls.find(x=>x.cmd==='plugin:notification|notify');
 assert.ok(send);
 assert.match(send.payload.options.title,/Windows 通知测试/);
 assert.equal(send.payload.options.silent,true);
 assert.doesNotMatch(JSON.stringify(send),/sessionId|contact|messageId|customer|token/);
});
test('private Agno notification only after valid original W43 receipt and persisted history',async()=>{
 const {port,calls}=fake();
 const receipt={status:'COMPLETED',canSend:false,runId:'abcdef123456',replayed:false};
 const args={receipt,historyVerified:true,hidden:true,native:port};
 assert.equal(await notifyVerifiedAgnoInBackground({...args,historyVerified:false}),'NO_NOTICE');
 assert.equal(await notifyVerifiedAgnoInBackground({...args,receipt:{...receipt,replayed:true}}),'NO_NOTICE');
 assert.equal(await notifyVerifiedAgnoInBackground({...args,receipt:{...receipt,status:'FAILED'}}),'NO_NOTICE');
 assert.equal(await notifyVerifiedAgnoInBackground({...args,receipt:{...receipt,canSend:true}}),'NO_NOTICE');
 assert.equal(await notifyVerifiedAgnoInBackground({...args,hidden:false}),'NO_NOTICE');
 assert.equal(calls.length,0);
 assert.equal(await notifyVerifiedAgnoInBackground(args),'NATIVE_SUBMITTED');
 assert.equal(calls.some(x=>x.cmd==='plugin:notification|notify'),true);
});
test('browser Agno completion requires preexisting grant, no permission prompts on replay',async()=>{
 const created=[];
 class Notification{
  static permission='granted';
  constructor(title,opts){created.push({title,opts})}
 }
 const args={hidden:true,historyVerified:true,receipt:{status:'COMPLETED',
  canSend:false,runId:'abcdef123456',replayed:false},
  native:createW05NativeNotificationPort({tauri:{}}),browser:Notification};
 assert.equal(await notifyVerifiedAgnoInBackground(args),'BROWSER_SUBMITTED');
 assert.equal(created.length,1);
 assert.equal(created[0].opts.silent,true);
 assert.ok(!JSON.stringify(created[0]).includes('secret'));
});
test('V2 native Tauri plugin is official and only current main origin has notification capability',()=>{
 const cargo=text('../../windows/src-tauri/Cargo.toml');
 const rust=text('../../windows/src-tauri/src/main.rs');
 const perm=JSON.parse(text('../../windows/src-tauri/capabilities/main.json'));
 assert.match(cargo,/tauri-plugin-notification = "=2.6.0"/);
 assert.match(rust,/tauri_plugin_notification::init/);
 assert.match(rust,/notification:allow-is-permission-granted/);
 assert.match(rust,/notification:allow-request-permission/);
 assert.match(rust,/notification:allow-notify/);
 assert.ok(perm.permissions.includes('notification:allow-notify'));
 assert.doesNotMatch(text('../src/w05-native-notification-port.mjs'),/new WebSocket|fetch\(|sendMessage/);
 const originalBrain=text('../src/BCPrivateBrainWorkspace.vue');
 assert.match(originalBrain,/notifyVerifiedAgnoInBackground/);
 assert.match(originalBrain,/loadState\.value==='ready'/);
 assert.match(originalBrain,/messages\.value\.some\(m=>m\.role==='assistant'&&m\.content===reply\.assistantText\)/);
});

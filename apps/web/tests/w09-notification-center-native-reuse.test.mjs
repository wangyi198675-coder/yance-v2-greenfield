import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readAgnoNotificationEnabled,setAgnoNotificationEnabled,
 notifyVerifiedAgnoInBackground} from '../src/w05-native-notification-port.mjs';
const source=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const panel=source('../src/BCNotificationCenter.vue');
const settings=source('../src/BCSettingsWorkspace.vue');

test('nine original settings remain; notification screen is compact and production-ready',()=>{
 assert.match(settings,/import BCNotificationCenter/);
 assert.match(settings,/category==='notify'/);
 assert.match(settings,/<BCNotificationCenter/);
 assert.match(settings,/requestNotificationPermission/);
 assert.match(panel,/class="nc-grid"/);
 assert.doesNotMatch(panel,/nc-hero|nc-hero-art|nc-hero-tags|PREFERENCES \/ NOTIFICATIONS/);
 for(const placeholder of ['待接入','待订阅','待实机核验','开发','W05 原生设置','仅展示','01 \/ CHANNELS','DEMO','type="range"','nc-placeholder','nc-footer','nc-group-note']){
  assert.equal(panel.includes(placeholder),false,placeholder);
 }
});

test('shown controls are real user actions, no imaginary API or mock preferences',()=>{
 for(const action of ['notify-refresh-permission','settings-request-notifications',
  'notify-test-browser','notify-native-authorize','notify-native-test','notify-agno-toggle']){
  assert.ok(panel.includes('data-test="'+action+'"'),action);
 }
 assert.match(panel,/emit\('request-permission'\)/);
 assert.match(panel,/new window.Notification\(/);
 assert.match(panel,/await native\.nativeTest\(\)/);
 assert.match(panel,/await native\.askPermission\(\)/);
 assert.match(panel,/setAgnoNotificationEnabled\(next\)/);
 assert.match(panel,/native\.available/);
 assert.match(panel,/!browserGranted\|\|testPending/);
 assert.match(panel,/onMounted\(\(\)=>\{void refreshPermissions\(\)\}\)/);
 assert.doesNotMatch(panel,/new WebSocket|new AudioContext|fetch\(|new Agent/);
});
test('real device preference survives reload and rejects unsupported storage',()=>{
 const m=new Map();
 const storage={getItem:key=>m.get(key)??null,setItem:(key,val)=>m.set(key,val)};
 assert.equal(readAgnoNotificationEnabled({storage}),true);
 assert.equal(setAgnoNotificationEnabled(false,{storage}),true);
 assert.equal(readAgnoNotificationEnabled({storage}),false);
 assert.equal(setAgnoNotificationEnabled(true,{storage}),true);
 assert.equal(readAgnoNotificationEnabled({storage}),true);
 assert.equal(setAgnoNotificationEnabled(false,{storage:null}),false);
});
test('suppressed Agno completion really blocks original background notice',async()=>{
 const old=globalThis.localStorage;
 const storage=new Map();
 globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
 try{
  setAgnoNotificationEnabled(false);
  let calls=0;
  const x=await notifyVerifiedAgnoInBackground({
   receipt:{status:'COMPLETED',runId:'run_123456',canSend:false,replayed:false},
   historyVerified:true,hidden:true,
   native:{available:true,agnoCompleted:async()=>{calls++;return true;}}
  });
  assert.equal(x,'NO_NOTICE');assert.equal(calls,0);
  setAgnoNotificationEnabled(true);
  assert.equal(await notifyVerifiedAgnoInBackground({
   receipt:{status:'COMPLETED',runId:'run_123456',canSend:false,replayed:false},
   historyVerified:true,hidden:true,native:{available:true,agnoCompleted:async()=>{calls++;return true;}}
  }),'NATIVE_SUBMITTED');
  assert.equal(calls,1);
 }finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old}
});

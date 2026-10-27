import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const panel=source('../src/BCNotificationCenter.vue');
const settings=source('../src/BCSettingsWorkspace.vue');
const owner=source('../../../services/api/runtime/w47-native-settings-capabilities.mjs');
test('original nine setting categories reused; native W05 entry not falsely marked ready',()=>{
 assert.match(settings,/import BCNotificationCenter/);
 assert.match(settings,/category==='notify'/);
 assert.match(settings,/<BCNotificationCenter/);
 assert.match(settings,/requestNotificationPermission/);
 assert.match(owner,/W05_NATIVE_NOTIFICATION_SETTINGS_OWNER_PORT_NOT_CONNECTED/);
 assert.match(owner,/persistedWrite:false/);
 assert.match(panel,/待实机核验/);
 assert.match(panel,/待订阅/);
});
test('native browser permission and optional test alone perform user-initiated notifications',()=>{
 assert.match(panel,/Notification/);
 assert.match(panel,/permission==='default'/);
 assert.match(panel,/emit\('request-permission'\)/);
 assert.match(panel,/data-test="notify-test-browser"/);
 assert.match(panel,/new window.Notification/);
 assert.match(panel,/!browserGranted\.value\|\|testPending\.value/);
 assert.match(panel,/silent:true/);
 assert.match(panel,/已向浏览器提交测试通知/);
 assert.doesNotMatch(panel,/new Agent|new WebSocket|new AudioContext|localStorage|sessionStorage|fetch\(/);
});
test('agreed settings concepts are visible but not counterfeit active switches',()=>{
 for(const s of ['消息提醒','声音与节奏','专注与免打扰','闺蜜大脑事件',
 '浏览器通知','Windows 桌面通知','重复消息去重','音量','当前网页不能代表 Windows','不创建新的消息订阅器'])
  assert.ok(panel.includes(s),s);
 assert.match(panel,/data-test="notify-volume-native-unavailable"/);
 assert.match(panel,/type="range"[^>]*disabled/);
 assert.match(panel,/prefers-reduced-motion/);
 assert.match(panel,/aria-label="通知中心"/);
});

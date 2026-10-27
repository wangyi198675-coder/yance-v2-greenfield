import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const settings=readFileSync(new URL('../src/BCSettingsWorkspace.vue',import.meta.url),'utf8');
const model=readFileSync(new URL('../src/BCFunctionModelRouting.vue',import.meta.url),'utf8');
test('model settings reuses already-authorized original W47 local-session bootstrap only in current localhost',()=>{
 assert.match(settings,/category\.value==='model'&&s\?\.authorized!==true/);
 assert.match(settings,/window\.location\.hostname==='127\.0\.0\.1'/);
 assert.match(settings,/\/api\/v2\/local-session\/web-private-start/);
 assert.match(settings,/method:'POST',headers:\{'content-type':'application\/json'\},body:'\{\}'/);
 assert.match(settings,/if\(started\.ok&&alive&&t===seq\)/);
 assert.match(settings,/s=await getJson\('\/api\/v2\/local-session\/status'\)/);
 assert.match(settings,/csrf\.value=s\?\.authorized===true&&typeof s\.csrfToken==='string'/);
 assert.doesNotMatch(settings,/64位配对|扫描设备二维码|请输入设备验证码/);
});
test('no model/key permission is granted by session bootstrap; original W55 and W43 remain authorities',()=>{
 assert.match(settings,/BCNativeCloudKeySettings v-if="csrf"/);
 assert.match(settings,/BCFunctionModelRouting :active="active" :csrf="csrf"/);
 assert.match(model,/\/api\/v2\/model-routing/);
 assert.match(model,/x-yance-csrf/);
 assert.match(model,/routing-runtime-boundary/);
});

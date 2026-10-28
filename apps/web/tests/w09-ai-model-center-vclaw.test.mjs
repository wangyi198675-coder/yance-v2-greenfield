import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const base=resolve(import.meta.dirname,'../../..');
const req=createRequire(resolve(base,'design/nonproduction/approved-clickable-abc-bc/package.json'));
const {parse,compileScript,compileTemplate}=req('@vue/compiler-sfc');
const source=filename=>readFileSync(resolve(base,'apps/web/src',filename),'utf8');
test('source: model center is a valid Vue SFC with template and script',()=>{
 const filename='BCModelCenter.vue',s=source(filename);
 const {descriptor,errors}=parse(s,{filename});assert.equal(errors.length,0);
 assert.ok(descriptor.template);assert.ok(descriptor.scriptSetup);
 assert.ok(compileScript(descriptor,{id:'w09-model-center'}).content.includes('readStatus')===false);
 const template=compileTemplate({source:descriptor.template.content,filename,id:'w09-model-center'});
 assert.deepEqual(template.errors,[]);
});
test('model center reuses W47 routing and W55 key status; no mock success or direct paid request',()=>{
 const s=source('BCModelCenter.vue');
 assert.match(s,/\/api\/v2\/model-routing/);
 assert.match(s,/\/api\/v2\/private-brain\/model-config/);
 assert.match(s,/\/api\/v2\/private-brain\/cloud-keys/);
 assert.match(s,/expectedRevision:routing\.value\.revision/);
 assert.match(s,/route-save/);
 assert.match(s,/paidConfirmed\.value/);
 assert.match(s,/routingExecution/);
 assert.match(s,/NOT_WIRED_TO_W43|未接线/);
 assert.doesNotMatch(s,/localStorage|sessionStorage|\/v1\/chat\/completions/);
});
test('V-Claw is an inert candidate until W55 + W43 signed source; never accepts keys in browser',()=>{
 const s=source('BCModelCenter.vue');
 assert.match(s,/https:\/\/token\.v-claw\.org\/v1/);
 assert.match(s,/vclaw-pending/);
 assert.match(s,/此处不接受或保存真实 Key/);
 assert.doesNotMatch(s,/VCLAW_USER_API|vclaw-save|apiKey:.*v-claw/);
});
test('refresh keeps last known status; save requires service readback and does not echo keys',()=>{
 const s=source('BCNativeCloudKeySettings.vue');
 assert.match(s,/stale=ref\(false\)/);
 const refresh=s.split('async function refresh(){')[1].split('async function save(){')[0];
 assert.doesNotMatch(refresh,/current\.value=null;/);
 assert.match(s,/cloud-redacted-status/);
 assert.match(s,/cloud-refresh-pending/);
 assert.match(s,/STATUS_NOT_CONFIRMED/);
 assert.match(s,/重新检查状态/);
});
test('reuses original settings workspace instead of parallel application/Agent',()=>{
 const s=source('BCSettingsWorkspace.vue');
 assert.match(s,/BCModelCenter/);
 assert.match(s,/category==='model'/);
 assert.match(s,/BCPrivateBrainWorkspace|emit\('navigate','BRAIN'\)|BCModelCenter/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../../..');
const req=createRequire(resolve(root,'design/nonproduction/approved-clickable-abc-bc/package.json'));
const {parse,compileScript,compileTemplate}=req('@vue/compiler-sfc');
const src=name=>readFileSync(resolve(root,'apps/web/src',name),'utf8');
test('model center remains valid native Vue SFC',()=>{
 const name='BCModelCenter.vue';const {descriptor,errors}=parse(src(name),{filename:name});
 assert.equal(errors.length,0);assert.ok(descriptor.scriptSetup&&descriptor.template);
 assert.ok(compileScript(descriptor,{id:'model-center'}));
 assert.deepEqual(compileTemplate({source:descriptor.template.content,filename:name,id:'model-center'}).errors,[]);
});
test('model center reads original W47/W55 model and credential authority; no self-built function router',()=>{
 const s=src('BCModelCenter.vue');
 assert.match(s,/\/api\/v2\/private-brain\/model-config/);
 assert.match(s,/\/api\/v2\/private-brain\/model-selection/);
 assert.match(s,/\/api\/v2\/private-brain\/cloud-keys/);
 assert.doesNotMatch(s,/\/api\/v2\/model-routing|function-ai-model-routing\.json|localStorage|sessionStorage/);
 assert.match(s,/after\?\.selectedProvider!==m\.provider/);
 assert.match(s,/after\?\.selectedModelId!==m\.modelId/);
 assert.match(s,/confirmPaidCost:true/);
 assert.match(s,/route-save/);
});
test('V-Claw endpoint discovery is not a self-created provider, vault or paid inference executor',()=>{
 const s=src('BCModelCenter.vue');
 assert.match(s,/https:\/\/token\.v-claw\.org\/v1/);
 assert.match(s,/vclaw-pending/);
 assert.match(s,/此处不会接收或保存密钥/);
 assert.doesNotMatch(s,/VCLAW_USER_API|vclaw-save|\/v1\/chat\/completions/);
});
test('native key refresh retains known state and surfaces failure, never echoes a secret',()=>{
 const s=src('BCNativeCloudKeySettings.vue');
 const refresh=s.split('async function refresh(){')[1].split('async function save(){')[0];
 assert.doesNotMatch(refresh,/current\.value=null;/);
 assert.match(s,/stale=ref\(false\)/);
 assert.match(s,/cloud-redacted-status/);
 assert.match(s,/STATUS_NOT_CONFIRMED/);
 assert.match(s,/cloud-refresh-pending/);
});
test('reuses existing settings view and seven native-owner status projections, no fake write controls',()=>{
 const s=src('BCModelCenter.vue'),settings=src('BCSettingsWorkspace.vue');
 assert.match(settings,/BCModelCenter/);
 assert.equal((s.match(/\['(?:PRIVATE_BRAIN|TRANSLATE|REPLY_SUGGESTIONS|RELATIONSHIP_SUMMARY|EXPERT_TASKS|MEDIA_UNDERSTANDING|AUTOPILOT)'/g)||[]).length,7);
 assert.match(s,/当前未提供独立模型选择/);
 assert.match(s,/待原生接线/);
});

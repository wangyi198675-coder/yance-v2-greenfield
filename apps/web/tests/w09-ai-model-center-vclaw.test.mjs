import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const base=resolve(import.meta.dirname,'../../..');
const req=createRequire(resolve(base,'design/nonproduction/approved-clickable-abc-bc/package.json'));
const {parse,compileScript,compileTemplate}=req('@vue/compiler-sfc');
const src=name=>readFileSync(resolve(base,'apps/web/src',name),'utf8');
test('compact AI model center and nested status components are valid Vue',()=>{
 for(const filename of ['BCModelCenter.vue','BCOfficialChatGPTConnect.vue','BCNativeCloudKeySettings.vue']){
  const {descriptor,errors}=parse(src(filename),{filename});
  assert.deepEqual(errors,[],filename);assert.ok(compileScript(descriptor,{id:'w09-compact'}));
  assert.deepEqual(compileTemplate({source:descriptor.template.content,filename,id:'w09-compact'}).errors,[],filename);
 }
});
test('canonical W47 W43 model selection remains owner; no self-built router',()=>{
 const s=src('BCModelCenter.vue');
 assert.match(s,/\/api\/v2\/private-brain\/model-config/);
 assert.match(s,/\/api\/v2\/private-brain\/model-selection/);
 assert.match(s,/\/api\/v2\/private-brain\/cloud-keys/);
 assert.doesNotMatch(s,/\/api\/v2\/model-routing|function-ai-model-routing\.json|localStorage|sessionStorage/);
 assert.match(s,/after\?\.selectedProvider!==m\.provider/);
 assert.match(s,/after\?\.selectedModelId!==m\.modelId/);
});
test('connected ChatGPT is compact by default, test only behind manual diagnostics',()=>{
 const s=src('BCOfficialChatGPTConnect.vue');
 assert.match(s,/manageOpen=ref\(false\),diagnosticsOpen=ref\(false\)/);
 assert.match(s,/data-test="chatgpt-manage-toggle"/);
 assert.match(s,/v-show="manageOpen&&diagnosticsOpen&&session\?\.status==='connected'&&session\.sharing"/);
 assert.match(s,/test-turn/);
});
test('cloud key management preserves native Key status and collapses when configured',()=>{
 const s=src('BCNativeCloudKeySettings.vue');
 assert.match(s,/data-test="cloud-redacted-status"/);
 assert.match(s,/current\?\.configured\?'已连接'/);
 assert.match(s,/data-test="cloud-key-manage-toggle"/);
 assert.match(s,/v-if="!current\?\.configured\|\|manageOpen"/);
 const refresh=s.split('async function refresh(){')[1].split('async function save(){')[0];
 assert.doesNotMatch(refresh,/current\.value=null/);
 assert.match(s,/STATUS_NOT_CONFIRMED/);
});
test('V-Claw action is in app, never external login redirect or fake native provider',()=>{
 const s=src('BCModelCenter.vue');
 assert.match(s,/data-test="vclaw-manage-inline"/);
 assert.match(s,/data-test="vclaw-pending"/);
 assert.doesNotMatch(s,/<a href="https:\/\/token\.v-claw\.org/);
 assert.doesNotMatch(s,/VCLAW_USER_API|vclaw-save|\/v1\/chat\/completions/);
});
test('local model has truthful native W47 status and on-demand explanation',()=>{
 const s=src('BCModelCenter.vue');
 assert.match(s,/data-test="local-model-recheck"/);
 assert.match(s,/data-test="local-model-details"/);
 assert.match(s,/data-test="local-model-diagnostics"/);
 assert.match(s,/11605/);
 assert.doesNotMatch(s,/configured:true.*LLAMACPP/);
});

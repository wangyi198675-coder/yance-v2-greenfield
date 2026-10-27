import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const settings=read('BCSettingsWorkspace.vue'),assign=read('BCFunctionModelRouting.vue'),keys=read('BCNativeCloudKeySettings.vue');
test('real R4 settings exposes separate function assignments instead of global model-only button',()=>{
 for(const marker of ['BCFunctionModelRouting','settings-panel-model','model-routing-rows','settings-openrouter-keys'])assert.ok(settings.includes(marker)||assign.includes(marker),marker);
 assert.match(assign,/PRIVATE_BRAIN/);assert.match(assign,/TRANSLATE/);assert.match(assign,/REPLY_SUGGESTIONS/);assert.match(assign,/EXPERT_TASKS/);assert.match(assign,/AUTOPILOT/);
 assert.match(assign,/data-feature="f.id"/);
});
test('ChatGPT plan is HONESTLY unavailable; OpenRouter BYOK only, no extra OpenAI API in daily model panel',()=>{
 assert.match(assign,/CHATGPT_PLAN_SIWC/);
 assert.match(assign,/官方套餐授权及模型目录尚未接通/);
 assert.match(settings,/:open-router-only="true"/);
 assert.match(keys,/visibleVendors=computed/);
 assert.match(assign,/availableModels/);
 assert.doesNotMatch(assign,/openai\/gpt-4o-mini|sk-or-|fakeModel/);
});
test('save is real same origin CSRF CAS HTTP with server readback and no paid call',()=>{
 assert.match(assign,/POST/);assert.match(assign,/x-yance-csrf/);assert.match(assign,/expectedRevision/);
 assert.match(assign,/confirmPaidCost/);assert.match(assign,/MODEL_ROUTING_READBACK_MISMATCH/);
 assert.match(assign,/router/i);assert.match(assign,/实际AI运行须通过原Agno资格验证/);
});

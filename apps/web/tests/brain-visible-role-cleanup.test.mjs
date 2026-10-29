import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const vue=readFileSync(new URL('../src/BCPrivateBrainWorkspace.vue',import.meta.url),'utf8');
test('rendered user history bubble has no redundant 你 label',()=>{
 assert.match(vue,/<article v-for="\(m,i\) in messages"[^>]*:data-role="m.role"[^>]*>/);
 assert.match(vue,/<strong v-if="m.role!=='user'">\{\{m.role==='assistant'\?'闺蜜大脑':'工具回执'\}\}<\/strong>/);
 assert.doesNotMatch(vue,/m\.role==='user'\?'你'/);
 assert.match(vue,/:aria-label="m.role==='user'\?'我发送的消息'/);
});
test('pending user prompt preserves Agno acknowledgement while removing duplicate visible identity',()=>{
 assert.match(vue,/data-test="brain-pending-user" aria-label="正在等待历史确认的已提交消息"/);
 assert.match(vue,/<small class="bc-brain-user-pending-status">待原生 Agno 历史确认<\/small>/);
 assert.doesNotMatch(vue,/<strong>你\s*<small>/);
 assert.match(vue,/\.bc-private-history article\[data-role=user\]>p\{margin-top:0\}/);
});
test('assistant and tool labels remain, content and actual role contract preserved',()=>{
 assert.match(vue,/<p>\{\{m.content\}\}<\/p>/);
 assert.match(vue,/<article v-for="\(m,i\) in messages"/);
 assert.match(vue,/data-role="assistant" data-test="brain-live-model-preview"/);
 assert.match(vue,/闺蜜大脑 <small>实时生成/);
 assert.match(vue,/m.role==='assistant'\?'闺蜜大脑':'工具回执'/);
 assert.match(vue,/messages\.value=/);
});

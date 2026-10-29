import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base=new URL('../src/',import.meta.url);
const chat=readFileSync(new URL('BCLiveChatWorkspace.vue',base),'utf8');
const composer=readFileSync(new URL('BCNativeComposer.vue',base),'utf8');

test('Messenger normal list shows readable previews, not internal account or provider IDs',()=>{
 assert.match(chat,/c\.lastMessage \|\| '暂无消息'/);
 assert.doesNotMatch(chat,/<small>\{\{c\.channel\}\} · \{\{c\.accountRef\}\}<\/small>/);
});
test('Messenger message bubbles omit MID and translation Run labels',()=>{
 assert.match(chat,/bc-message-text/);
 assert.doesNotMatch(chat,/<small>MID \{\{m\.mid\}\}/);
 assert.match(chat,/<BCNativeComposer ref="composerRef" :fetch-impl="fetchImpl"/);
 assert.doesNotMatch(chat,/:read-only-conversation=/);
});
test('agreed original sole Composer controls remain for every selected contact',()=>{
 assert.match(composer,/data-test="w46-composer-plus"/);
 assert.match(composer,/data-test="w46-composer-model"/);
 assert.match(composer,/data-test="w46-contact-mode"/);
 assert.match(composer,/class="bc-file-label"/);
 assert.match(composer,/class="bc-send-hold"/);
 assert.match(composer,/class="bc-footer"/);
 assert.match(composer,/<BCNativeExpertPicker v-if="expertsOpen"/);
 assert.match(composer,/v-if="contactMenu==='model'"/);
 assert.match(composer,/v-if="contactMenu==='mode'"/);
 assert.doesNotMatch(composer,/readOnlyConversation/);
 assert.doesNotMatch(composer,/v-if="!readOnlyConversation"/);
 assert.doesNotMatch(composer,/w56-readonly-composer/);
 assert.match(composer,/Button disabled size="sm"/);
});

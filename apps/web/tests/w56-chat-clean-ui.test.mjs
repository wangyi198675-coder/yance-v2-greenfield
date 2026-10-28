import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base=new URL('../src/',import.meta.url);
const chat=readFileSync(new URL('BCLiveChatWorkspace.vue',base),'utf8');
const composer=readFileSync(new URL('BCNativeComposer.vue',base),'utf8');
test('Messenger contact list shows a real last-message preview, not internal channel or accountRef',()=>{
 assert.match(chat,/c\.lastMessage \|\| '暂无消息'/);
 assert.doesNotMatch(chat,/<small>\{\{c\.channel\}\} · \{\{c\.accountRef\}\}<\/small>/);
});
test('real chat bubbles do not expose message MID or translation Run in the normal view',()=>{
 assert.match(chat,/bc-message-text/);
 assert.doesNotMatch(chat,/<small>MID \{\{m\.mid\}\}/);
 assert.match(chat,/v-if="!selected\?\.readOnly&&selected\?\.identityKey"/);
 assert.match(chat,/:read-only-conversation="selected\?\.readOnly===true"/);
});
test('read-only Composer is still the original Composer with disabled send, not a new sender',()=>{
 assert.match(composer,/readOnlyConversation:\{type:Boolean,default:false\}/);
 assert.match(composer,/:disabled="!current\.key\|\|readOnlyConversation"/);
 assert.match(composer,/v-if="!readOnlyConversation" class="bc-footer"/);
 assert.match(composer,/data-test="w56-readonly-composer"/);
 assert.match(composer,/<Button disabled size="sm" title="发送功能尚未接通">发送<\/Button>/);
 assert.match(composer,/目前仅可查看消息/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../src/BCLiveChatWorkspace.vue',import.meta.url),'utf8');
const style=readFileSync(new URL('../src/BCNativeContextMenu.css',import.meta.url),'utf8');
test('contacts use real OSS Reka ContextMenu and preserve original click/identity',()=>{
 assert.match(ui,/import \{ContextMenu,ContextMenuTrigger,ContextMenuContent,ContextMenuItem,ContextMenuLabel,ContextMenuSeparator,ContextMenuSub/);
 assert.match(ui,/<ContextMenu v-for="c in pinned"/);
 assert.match(ui,/<ContextMenu v-for="c in regular"/);
 assert.match(ui,/data-test="w09-contact-context-menu"/);
 assert.match(ui,/@click="chooseContact\(c\)"/);
 for(const op of ["查看联系人资料","搜索聊天记录","置顶会话","标记未读","消息免打扰","AI 托管与人工接管","归档会话","删除会话"])assert.ok(ui.includes(op),op);
 assert.match(ui,/data-test="context-contact-pin"/);
 assert.match(ui,/data-test="w09-delete-confirm-dialog"/);
});
test('messages have real right click menu with text-gated actions and authoritative quote',()=>{
 assert.match(ui,/data-test="w09-message-context-menu"/);
 assert.match(ui,/class="bc-native-message-context" tabindex="0"/);
 assert.match(ui,/v-if="hasDisplayableText\(m\)" @select="copyAuthorizedText\(m.original/);
 assert.match(ui,/v-if="m.zh" @select="copyAuthorizedText\(m.zh/);
 assert.match(ui,/v-if="!selected\?\.readOnly&&selected\?\.identityKey&&selected\?\.identity"/);
 assert.match(ui,/contextQuote\(m\)/);
 assert.match(ui,/sourceQuote\(m\)/);
 assert.match(ui,/@select="searchLoadedConversation\(selected\)"/);
 assert.match(ui,/:data-mid="m.mid"/);
});
test('clipboard permission failures give truthful results and menus are OSS, not fabricated reply/delete',()=>{
 assert.match(ui,/navigator\?\.clipboard\?\.writeText/);
 assert.match(ui,/复制失败，请检查浏览器剪贴板权限/);
 assert.match(ui,/data-test="w09-context-action-status"/);
 assert.doesNotMatch(ui,/<ContextMenuItem[^>]*>删除消息/);
 assert.doesNotMatch(ui,/<ContextMenuItem[^>]*>转发/);
 assert.match(style,/\.w09-native-context-menu/);
 assert.match(style,/\[data-slot="context-menu-item"\]/);
});

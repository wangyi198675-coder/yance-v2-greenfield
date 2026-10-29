import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(f)=>readFileSync(new URL('../src/'+f,import.meta.url),'utf8');
const vue=read('BCLiveChatWorkspace.vue');
test('Channel badges render real locally vendored SVG icons instead of FB/Page/WA/TG text',()=>{
 for(const icon of ['meta','messenger','whatsapp','telegram']) {
  assert.match(read('assets/channels/'+icon+'.svg'),/<svg/);
  assert.ok(vue.includes("assets/channels/"+icon+".svg"),icon);
 }
 assert.match(vue,/class="bc-native-channel-badge"/);
 assert.match(vue,/class="bc-contact-avatar-wrap"/);
 assert.doesNotMatch(vue,/c.channel==='FB_PERSONAL'\?'FB':c.channel==='FB_PAGE'\?'Page'/);
 assert.doesNotMatch(vue,/class="bc-channel-mark"/);
});
test('User-approved icon mapping: Page Meta infinity, Messenger personal Messenger icon, no extra header icon',()=>{
 assert.match(vue,/FB_PAGE:metaBrandLogo/);
 assert.match(vue,/FB_PERSONAL:messengerBrandLogo/);
 assert.match(vue,/WHATSAPP_PERSONAL:whatsappBrandLogo/);
 assert.match(vue,/TELEGRAM_PERSONAL:telegramBrandLogo/);
 assert.doesNotMatch(vue,/headerBrandIcon/);
 assert.doesNotMatch(vue,/class="bc-header-native-channel"/);
 assert.doesNotMatch(vue,/facebookBrandLogo/);
 assert.match(vue,/<div class="bc-chat-title"><strong>\{\{selected.displayName\}\}<\/strong><\/div>/);
 assert.match(vue,/:title="channelTooltip\(c\)"/);
 assert.match(vue,/发送资格待核验/);
});
test('Native icon renders without changing contact identity, message MID or send authority',()=>{
 assert.match(vue,/:data-contact-ref="c.contactRef"/);
 assert.match(vue,/chooseContact\(c\)/);
 assert.match(vue,/:data-mid="m.mid"/);
 assert.match(vue,/BCNativeComposer/);
 assert.match(vue,/pageManualTarget/);
 assert.match(vue,/\.bc-native-channel-badge\{/);
 assert.match(vue,/data-test="w46-contact-channel"/);
});

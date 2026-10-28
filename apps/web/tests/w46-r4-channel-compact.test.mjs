import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const fromSrc=(name)=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const parent=fromSrc('BCProductWorkspaceCandidate.vue');
const card=fromSrc('BCChannelAccountSetup.vue');
const contract=fromSrc('channel-setup-contract.mjs');
test('approved channels screen uses a compact single contextual toolbar and four native provider cards',()=>{
 assert.match(parent,/w46-r4-channel-toolbar/);
 assert.match(parent,/min-height:43px/);
 // A 34px detail toggle + 4px vertical padding + 1px border really fits 43px.
 assert.match(parent,/w46-r4-channel-toolbar\{[^}]*padding:4px 16px/);
 assert.match(parent,/w46-r4-channel-grid/);
 assert.match(parent,/repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(parent,/max-width:1099px/);
 assert.match(parent,/max-width:600px/);
 assert.doesNotMatch(parent,/R4 四平台品牌 SVG 路径来源已校验/);
});
test('one clear connection CTA per card; existing native GET setup and status-check kept',()=>{
 assert.match(card,/data-test="native-provider-setup"/);
 assert.match(card,/data-test="native-provider-check"/);
 assert.match(card,/'连接账号'/);
 assert.match(card,/await setupChannel/);
 assert.match(card,/await checkChannel/);
 assert.match(card,/receipt\.officialConnectUrl/);
 assert.match(card,/receipt\.qr/);
 assert.match(card,/onBeforeUnmount/);
 // Reuse the five-theme B+C foreground token; avoid an undefined camelCase variable.
 assert.match(card,/color:var\(--accent-ink\)!important/);
 assert.doesNotMatch(card,/--accentInk/);
});
test('UI never displays raw SDK / WAITING_USER_AUTH as ordinary user-facing state',()=>{
 assert.match(card,/未连接/);
 assert.match(card,/暂不可用/);
 assert.match(card,/已连接/);
 assert.doesNotMatch(card,/>WAITING_USER_AUTH \//);
 assert.match(card,/data-test="native-provider-details"/);
});
test('unverified account count is not invented and technical details are not permanently visible',()=>{
 assert.match(parent,/v-if="snapshot\?\.trustedSession"/);
 assert.match(parent,/已验证 \{\{readonlyAccount\}\} 个/);
 assert.match(parent,/w46-add-account-global/);
 assert.match(parent,/w46-account-add-dialog/);
 assert.match(parent,/w46-add-platform-/);
 assert.match(parent,/v-if="channelDetailsOpen"/);
 assert.match(parent,/data-test="w46-channel-details-toggle"/);
});
test('same-origin native contract preserved; no provider SDK in renderer',()=>{
 assert.match(contract,/credentials:'same-origin'/);
 assert.match(contract,/OFFICIAL_MAUTRIX_META/);
 assert.match(contract,/BAILEYS_NATIVE_SDK/);
 assert.doesNotMatch(card,/fetch\(.+127\.0\.0\.1/);
 assert.doesNotMatch(card,/sock\.sendMessage/);
});
test('W42 P0 mobile QR card grows with verified native QR and never overlaps next card',()=>{
 assert.match(parent,/\.w46-r4-channel-grid\{[^}]*align-content:start;grid-auto-rows:max-content;flex-shrink:0/);
 assert.match(card,/\.w46-channel\{[^}]*height:auto;overflow:visible/);
 assert.match(card,/\.w46-channel-auth-result img\{width:min\(240px,100%\);height:auto/);
});
test('W42 P1 verified WAITING_USER_AUTH uses actionable waiting labels, not false offline',()=>{
 assert.match(card,/state\.value==='WAITING_USER_AUTH'\?\(receipt\.value\?\.qr\?'等待扫码':'等待授权'\)/);
 assert.match(card,/state==='WAITING_USER_AUTH'\?\(receipt\?\.qr\?'重新获取二维码':isWhatsApp\?'连接 WhatsApp':'重新获取授权'\)/);
 assert.match(card,/@click="isWhatsApp&&\['WAITING_QR_SCAN','STARTING_NATIVE_SDK'\]\.includes\(state\)\?qrOpen=true:setup\(\)"/);
 assert.match(card,/state\.value='EXPIRED'/);
 assert.match(card,/state\.value=v\.state/);
});

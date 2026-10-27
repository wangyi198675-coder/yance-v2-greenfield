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
});
test('UI never displays raw SDK / WAITING_USER_AUTH as ordinary user-facing state',()=>{
 assert.match(card,/未连接/);
 assert.match(card,/暂不可用/);
 assert.match(card,/已连接/);
 assert.doesNotMatch(card,/>WAITING_USER_AUTH \//);
 assert.match(card,/data-test="native-provider-details"/);
});
test('unverified account count is not invented and technical details are not permanently visible',()=>{
 assert.match(parent,/snapshot\?\.trustedSession\?'已验证账号 '/);
 assert.match(parent,/账号状态待验证/);
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
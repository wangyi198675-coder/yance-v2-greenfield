import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=new URL('../src/BCProductWorkspaceCandidate.vue',import.meta.url);
const brain=new URL('../src/BCPrivateBrainWorkspace.vue',import.meta.url);
const shell=readFileSync(ui,'utf8'),b=readFileSync(brain,'utf8');
test('approved R4 desktop global navigation is centered, not flex filled to x92',()=>{
 assert.match(shell,/\.w46-compact-global\{[^}]*display:grid;grid-template-columns:minmax\(130px,1fr\) auto minmax\(150px,1fr\)/);
 assert.match(shell,/\.w46-main-links\{[^}]*justify-content:center;[^}]*justify-self:center/);
 assert.match(shell,/\.w46-global-tools\{[^}]*justify-self:end/);
 assert.match(shell,/@media\(min-width:720px\) and \(max-width:1099px\)\{\.w46-main-links button\{padding:7px 9px!important/);
 assert.match(shell,/@media\(max-width:719px\)\{\.w46-compact-global\{display:flex/);
 assert.match(shell,/class="w46-compact-global" data-test="w46-compact-nav"/);
});
test('one native Agno Brain preserves authoritatively fetched history inside R4 43px and 880px layout',()=>{
 assert.match(b,/\.bc-private-brain-head\{[^}]*flex:0 0 43px;height:43px/);
 assert.match(b,/\.bc-private-history\{[^}]*max-width:880px;width:100%;align-self:center/);
 assert.match(b,/\.bc-private-compose\{[^}]*max-width:844px/);
 assert.match(b,/data-test="brain-history"/);
 assert.match(b,/verifiedHistory\(await api\(PRIVATE_ROUTES.history/);
 assert.match(b,/data-test="brain-open-settings"/);
 assert.match(b,/data-test="brain-check"/);
 assert.match(b,/data-test="brain-toggle-tools"/);
 assert.match(b,/data-test="brain-expert"[^>]*disabled|disabled[^>]*data-test="brain-expert"/);
 assert.match(b,/data-test="brain-attachment"[^>]*disabled|disabled[^>]*data-test="brain-attachment"/);
 assert.match(b,/data-test="brain-send"/);
});

const chat=readFileSync(new URL('../src/BCLiveChatWorkspace.vue',import.meta.url),'utf8');
test('R4 experts directory is visible by default and never fabricates enabled experts',()=>{
 assert.match(shell,/data-test="w46-r4-expert-list"/);
 assert.match(shell,/v-for="\(name,index\) in designExpertCatalog"/);
 assert.match(shell,/data-test="'w46-expert-tab-'/);
 assert.match(shell,/aria-label="工具与任务"/);
 assert.match(shell,/尚无真实安装与执行资格|尚无真实安装|尚无经本机服务确认/);
 assert.match(shell,/等待W43\/W47原生身份及启用状态确认/);
 assert.doesNotMatch(shell,/<details class="w46-native-panel"><summary>专家中心/);
});
test('R4 Persona uses real empty rule/version tabs, not design fiction',()=>{
 assert.match(shell,/data-test="w46-persona-studio"/);
 for(const k of ['pending','current','versions'])assert.match(shell,new RegExp("id:'"+k+"'"));
 assert.match(shell,/data-test="'w46-persona-tab-'/);
 assert.match(shell,/暂无经服务端核验的待审规则/);
 assert.match(shell,/本人事实、联系人推断和学习建议必须按原W43\/W45权威来源分别读取/);
 assert.match(shell,/Button disabled size="sm">版本回滚/);
});
test('CHAT keeps exactly one original contact composer mounted even with no account',()=>{
 assert.equal((chat.match(/<BCNativeComposer\b/g)||[]).length,1);
 assert.match(chat,/:identity="selected\?\.identityKey&&selected\?\.identity\?selected.identity:null"/);
 assert.match(chat,/data-test="w46-empty-chat"/);
 assert.match(chat,/data-test="w46-live-timeline"/);
 assert.match(shell,/v-else-if="activeWorkspace!=='CHAT'" class="w46-blank"/);
 assert.match(readFileSync(new URL('../src/BCNativeComposer.vue',import.meta.url),'utf8'),/data-test="w46-composer-model"/);
 assert.match(chat,/createTrustedTakeoverPort/);
 assert.doesNotMatch(chat,/simulateSend\(/);
});

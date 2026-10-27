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
 assert.match(b,/@click="toggleBrainExpert" data-test="brain-expert"/);
 assert.match(b,/data-test="brain-expert-popup"/);
 assert.match(b,/data-test="brain-expert-close"/);
 assert.match(b,/role="menu" aria-label="闺蜜大脑专家选择"/);
 // Latest compact PRIVATE hides unavailable media attachments entirely rather than presenting a dead button.
 assert.doesNotMatch(b,/data-test="brain-attachment"/);
 assert.doesNotMatch(b,/simulateAttachment\(/);
 assert.match(b,/data-test="brain-send"/);
});

const chat=readFileSync(new URL('../src/BCLiveChatWorkspace.vue',import.meta.url),'utf8');
test('R4 expert directory uses real W43 status and does not fabricate enabled experts',()=>{
 assert.match(shell,/data-test="w46-tools-experts"/);
 assert.match(shell,/data-test="w46-tools-expert-list"/);
 assert.match(shell,/data-test="w46-tools-unavailable"/);
 assert.match(shell,/data-test="w46-tools-refresh"/);
 assert.match(shell,/refreshExpertWorkspace/);
 assert.match(shell,/e.installed&&e.registered&&e.enabled/);
 assert.match(shell,/data-test="w46-tools-open-brain"/);
 assert.doesNotMatch(shell,/designExpertCatalog/);
});
test('current R4 Persona is a compact verified-only three-tab panel',()=>{
 assert.match(shell,/data-test="w46-persona-studio"/);
 assert.match(shell,/data-test="w46-persona-toolbar"/);
 assert.match(shell,/data-test="'w46-persona-tab-'/);
 assert.match(shell,/data-test="w46-persona-learning-status"/);
 assert.match(shell,/data-test="w46-persona-source-hold"/);
 assert.ok(shell.includes("showPersonaDetail('learning')"));
 assert.match(shell,/目前尚未接通可核验的人格数据/);
});
test('current Persona prevents synthetic learning rules and approval',()=>{
 assert.match(shell,/待审核规则必须来自真实的学习记录/);
 assert.match(shell,/不会把示例当成待审核建议/);
 assert.match(shell,/暂时无法查看当前人格/);
 assert.match(shell,/只有取得真实版本记录/);
 assert.doesNotMatch(shell,/personaExamples/);
 assert.doesNotMatch(shell,/w46-persona-rule-example-/);
});
test('Persona version details are read-only and fail closed without server data',()=>{
 assert.match(shell,/data-test="w46-persona-details-card"/);
 assert.match(shell,/data-test="w46-persona-details-open"/);
 assert.match(shell,/data-test="w46-persona-example-details"/);
 assert.match(shell,/aria-modal="true"/);
 assert.match(shell,/data-test="w46-persona-detail-close"/);
 assert.match(shell,/本页只展示可说明的功能范围/);
 assert.match(shell,/服务端尚未返回这些记录时/);
 assert.ok(shell.includes('personaModal'));
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

const contactComposer=readFileSync(new URL('../src/BCNativeComposer.vue',import.meta.url),'utf8');
const expertPopup=readFileSync(new URL('../src/BCNativeExpertPicker.vue',import.meta.url),'utf8');
test('R4 one CONTACT composer uses anchored expert/model/mode menus, never a bottom expert block',()=>{
 for(const id of ['w46-composer-plus','w46-composer-model','w46-contact-mode','w46-contact-model-popup','w46-contact-mode-popup']){
  assert.ok(contactComposer.includes('data-test="'+id+'"'),id);
 }
 assert.match(contactComposer,/BCNativeExpertPicker/);
 assert.match(expertPopup,/data-test="w46-composer-experts"/);
 assert.match(contactComposer,/\.bc-compose-popup\{position:absolute/);
 assert.match(contactComposer,/data-test="w46-mode-human"[^>]*disabled|disabled[^>]*data-test="w46-mode-human"/);
 assert.match(contactComposer,/data-test="w46-mode-assisted"/);
 assert.match(contactComposer,/data-test="w46-mode-auto"/);
 assert.match(contactComposer,/disabled>.*W24|disabled>.*Qwen|disabled>.*待资格/);
 assert.match(contactComposer,/createComposerBridge\(/);
});
test('PRIVATE Agno model and tools remain original authority while expert menu remains fail-closed',()=>{
 assert.match(b,/data-test="brain-expert-popup"/);
 assert.match(b,/data-test="brain-expert-close"/);
 assert.match(b,/data-test="brain-compose-model"/);
 assert.match(b,/data-test="brain-compose-tools"/);
 assert.match(b,/toggleBrainModel\(\)/);
 assert.match(b,/toggleBrainTools\(\)/);
 assert.match(b,/selectModel\(\)/);
 assert.match(b,/PRIVATE_ROUTES.selection/);
 assert.match(b,/data-test="cloud-model-cost-confirm"/);
 // PR102: replace unsigned design-only disabled menu with real W47 authority.
 assert.match(b,/api\('\/api\/v2\/private-brain\/experts'\)/);
 assert.match(b,/x\.installed&&x\.registered/);
 assert.match(b,/data-test="brain-expert-consent"/);
 assert.match(b,/data-test="brain-expert-run"/);
 assert.match(b,/EXPERT_RUN_TRACE_GET_MISMATCH/);
});
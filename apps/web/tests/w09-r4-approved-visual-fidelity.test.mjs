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
test('approved R4 Persona has four visible top entries and clear nonproduction learning status',()=>{
 assert.match(shell,/data-test="w46-persona-studio"/);
 assert.match(shell,/data-test="w46-persona-toolbar"/);
 assert.match(shell,/规则 · 记忆 · 版本/);
 for(const k of ['pending','current','versions'])assert.match(shell,new RegExp("id:'"+k+"'"));
 assert.match(shell,/data-test="'w46-persona-tab-'/);
 assert.match(shell,/data-test="w46-persona-learning-status"/);
 assert.match(shell,/showPersonaDetail\('learning'\)/);
 assert.match(shell,/学习状态尚未获得服务端有效版本/);
});
test('approved Persona pending design is visibly labeled as three readonly design examples',()=>{
 for(const [name,subtitle] of [
  ['自然、成熟、简短表达','建议规则 · 来源待核验'],
  ['忠于用户本人事实','联系人推断不能变成本人事实'],
  ['跨会话表达偏好','可暂停、撤销及恢复到先前版本']
 ]){assert.ok(shell.includes(name));assert.ok(shell.includes(subtitle))}
 assert.match(shell,/待审规则 · 设计示例/);
 assert.match(shell,/未执行审批/);
 assert.match(shell,/v-for="\(rule,index\) in personaExamples"/);
 assert.match(shell,/data-test="'w46-persona-rule-example-'/);
 assert.match(shell,/data-test="'w46-persona-rule-view-'/);
 assert.match(shell,/data-test="w46-persona-source-hold"/);
 assert.match(shell,/仅展示设计中的规则入口，审批、版本与学习必须连接已有服务端并经过真实读回/);
});
test('Persona version sidebar opens only readonly dialog and never grants approval',()=>{
 assert.match(shell,/data-test="w46-persona-details-card"/);
 assert.match(shell,/人格版本与控制/);
 assert.match(shell,/已生效版本、规则来源、冲突、撤回和回滚在这里按需展示/);
 assert.match(shell,/原R4中的技术状态面板与大幅说明文字不长期占据核心操作区域/);
 assert.match(shell,/data-test="w46-persona-rule-details"/);
 assert.match(shell,/data-test="w46-persona-example-details"/);
 assert.match(shell,/aria-modal="true"/);
 assert.match(shell,/data-test="w46-persona-detail-close"/);
 assert.match(shell,/该内容为只读界面示例，并非真实已批准规则/);
 assert.doesNotMatch(shell,/function showPersonaDetail[^\n]*fetch\(/);
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
const expertPicker=readFileSync(new URL('../src/BCNativeExpertPicker.vue',import.meta.url),'utf8');
test('R4 one CONTACT composer uses actual signed child expert picker and anchored model/mode menus',()=>{
 for(const id of ['w46-composer-plus','w46-composer-model','w46-contact-mode','w46-contact-model-popup','w46-contact-mode-popup']){
  assert.ok(contactComposer.includes('data-test="'+id+'"'),id);
 }
 // W09 approved expert-menu refactor moved its DOM into original child component.
 assert.match(contactComposer,/import BCNativeExpertPicker from/);
 assert.match(contactComposer,/<BCNativeExpertPicker v-if="expertsOpen"/);
 assert.match(expertPicker,/data-test="w46-composer-experts"/);
 assert.match(expertPicker,/document.querySelector\('\[data-test="w46-composer-plus"\]'\)/);
 assert.match(expertPicker,/\.bc-native-expert-picker\{position:fixed!important/);
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

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=n=>readFileSync(new URL('../src/'+n,import.meta.url),'utf8');
const shell=read('BCProductWorkspaceCandidate.vue'),inbox=read('BCLiveChatWorkspace.vue');
const composer=read('BCNativeComposer.vue'),brain=read('BCPrivateBrainWorkspace.vue');
const vite=readFileSync(new URL('../vite.w46.config.mjs',import.meta.url),'utf8');

test('approved normal / is the B+C product and stays a unique chat-first main view',()=>{
 assert.match(vite,/get\('productDraft'\)!=='0'/);
 assert.match(vite,/const w46Workspace=ref\('CHAT'\)/);
 assert.match(shell,/data-test="w46-compact-nav"/);
 for(const id of ['CHAT','BRAIN','AUTOPILOT'])assert.ok(shell.includes('data-test="workspace-'+id+'"'));
 assert.match(shell,/data-test="workspace-all"/);
 assert.match(shell,/w46-compact-global\{[^}]*48px/);
 assert.doesNotMatch(shell,/\<nav class="w46-workspace-tabs"/);
});
test('sidebar has exactly the approved two permanent rows with conditional verified unread',()=>{
 for(const id of ['w46-inbox-toolbar-row-1','w46-inbox-toolbar-row-2','w46-search','w46-plus','w46-filter','w46-unread','w46-contacts-scroll'])
  assert.ok(inbox.includes('data-test="'+id+'"'),id);
 assert.match(inbox,/unreadAuthoritative/);
 assert.match(inbox,/:disabled="!unreadAuthoritative"/);
 assert.match(inbox,/c\.unreadAuthorized===true/);
 assert.match(inbox,/pinnedAuthorized===true/);
 assert.match(inbox,/window\.addEventListener\('keydown',onKeyDown\)/);
 assert.match(inbox,/window\.removeEventListener\('keydown',onKeyDown\)/);
 assert.match(inbox,/@click="navigate\('ACCOUNTS'\)"/);
 assert.match(inbox,/@media\(max-width:719px\)/);
});
test('keep same CONTACT Composer mounted across other workspace navigation',()=>{
 assert.match(shell,/<BCLiveChatWorkspace v-show="activeWorkspace==='CHAT'"/);
 assert.doesNotMatch(shell,/<BCNativeComposer/);
 assert.match(composer,/createComposerBridge/);
 assert.match(composer,/IME_COMMIT/);
 assert.match(composer,/sourceQuote/);
 assert.match(composer,/data-test="w46-composer-plus"/);
 assert.match(composer,/type="button" disabled/);
 assert.match(composer,/<Button disabled size="sm">发送不可用<\/Button>/);
});
test('natural PRIVATE chat preserves authoritative model/turn/history with controls hidden on demand',()=>{
 assert.match(brain,/api\(PRIVATE_ROUTES\.turn/);
 assert.match(brain,/verifiedHistory/);
 assert.match(brain,/data-test="brain-history"/);
 assert.match(brain,/data-test="w46-brain-tools"/);
 assert.match(brain,/data-test="brain-open-settings"/);
 assert.match(brain,/bc-private-history\{[^}]*flex:1 1 0/);
 assert.match(brain,/paidChangeRequiresConsent/);
 assert.doesNotMatch(brain,/turnCostApproved/);
});
test('R4 native Persona and Expert entry points never claim installed mock capabilities',()=>{
 assert.match(shell,/data-test="w46-persona-studio"/);
 assert.match(shell,/data-test="w46-tools-experts"/);
 assert.match(shell,/\/api\/v2\/private-brain\/experts/);
 assert.match(shell,/\/api\/v2\/private-brain\/runs\?threadId=personal&limit=10/);
 assert.match(shell,/\/api\/v2\/private-brain\/tools/);
 assert.doesNotMatch(shell,/designExpertCatalog|十类设计候选|待W43核实安装与授权/);
 assert.match(shell,/expertPhase\.value='unavailable'/);
 assert.match(shell,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(inbox,/@media\(prefers-reduced-motion:reduce\)/);
});

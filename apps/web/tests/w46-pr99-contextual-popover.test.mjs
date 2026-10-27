import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const composer=readFileSync(new URL('../src/BCNativeComposer.vue',import.meta.url),'utf8');
const picker=readFileSync(new URL('../src/BCNativeExpertPicker.vue',import.meta.url),'utf8');
const brain=readFileSync(new URL('../src/BCPrivateBrainWorkspace.vue',import.meta.url),'utf8');
const live=readFileSync(new URL('../src/BCLiveChatWorkspace.vue',import.meta.url),'utf8');

test('web-first CONTACT expert dialog uses ONE original Composer and floating responsive picker',()=>{
 assert.match(composer,/const contactTrigger=Object\.freeze/);
 assert.match(composer,/import BCNativeExpertPicker/);
 assert.match(composer,/<BCNativeExpertPicker v-if="expertsOpen"/);
 assert.match(composer,/data-test="w46-composer-plus"/);
 assert.match(composer,/aria-haspopup="dialog"/);
 assert.match(picker,/data-test="w46-composer-experts"/);
 assert.match(picker,/<Teleport to="body">/);
 assert.match(picker,/position:fixed!important/);
 assert.match(picker,/window\.innerWidth-24/);
 assert.match(picker,/window\.innerHeight-r\.top\+8/);
 assert.match(picker,/data-test="w46-expert-search"/);
 assert.match(picker,/data-test="w46-expert-source-unavailable"/);
 assert.match(composer,/createComposerBridge/);
 assert.match(composer,/<Button disabled size="sm">发送不可用<\/Button>/);
 assert.doesNotMatch(composer,/const designExperts=/);
 assert.doesNotMatch(picker,/function createAgent|new Agent\(/);
});
test('native W43 directory needs authenticated authoritative read; never fake ten installed experts',()=>{
 for(const s of ['W43_NATIVE_AGNO_EXPERT','NATIVE_EXPERT_DIRECTORY_READ',
 'dto.cataloguedCount!==10','dto.registeredCount!==1','dto.installedReadOnlyCount!==1',
 'dto.experts.filter(e=>e.installed).length!==1','dto.experts.filter(e=>e.canInvoke).length>1',
 'READ_ONLY_STABLE252_INSPECTION','canSend!==false','credentials:\'same-origin\''])
 assert.ok(picker.includes(s),s);
 assert.match(picker,/experts\.value=\[\];phase\.value='loading'/);
 assert.match(picker,/phase\.value='unavailable'/);
 assert.match(picker,/!response\.ok/);
 assert.match(picker,/v-for="e in found"/);
 assert.match(picker,/data-test="w46-expert-to-brain"/);
 assert.match(picker,/emit\('navigate','BRAIN'\)/);
 assert.doesNotMatch(picker,/\/api\/v2\/contact.*\/send/);
 assert.match(live,/@navigate="navigate"/);
});
test('CONTACT keyboard, Escape, outside click, focus restoration and cleanup preserved',()=>{
 for(const s of ['keydown','pointerdown','Escape','ArrowDown','ArrowUp','Home','End','contactOutsideClick',
  'closeContactMenu(true)','aria-controls="w46-contact-experts-menu"']){
   assert.ok(composer.includes(s),s);
 }
 assert.match(composer,/document\.removeEventListener\('keydown',contactMenuKeyboard\)/);
 assert.match(composer,/document\.removeEventListener\('pointerdown',contactOutsideClick\)/);
 for(const s of ['Escape','ArrowDown','ArrowUp','Home','End','onBeforeUnmount',
 'window.removeEventListener','aria-label="搜索专家"'])assert.ok(picker.includes(s),s);
});
test('CONTACT model and HUMAN/ASSISTED/AUTO never use PRIVATE model grants or unsourced W44 takeover',()=>{
 assert.match(composer,/W44\/W47/);
 assert.match(composer,/disabled data-test="w46-mode-human"/);
 assert.match(composer,/disabled data-test="w46-mode-assisted"/);
 assert.match(composer,/disabled data-test="w46-mode-auto"/);
 assert.match(composer,/identity:\{type:Object,default:null\}/);
 assert.doesNotMatch(composer,/PRIVATE_ROUTES\.selection/);
});
test('PRIVATE model fee, one Agno History, native Tools Run/Trace retained',()=>{
 for(const s of ['confirmedModelSelection','verifiedTurn','verifiedHistory',
 'confirmPaidCost:true','modelChangeRequired',
 "api('/api/v2/private-brain/tools')",
 "api('/api/v2/private-brain/runs?threadId=personal&limit=10')",
 'ensureCurrent()','authoritative!==true','canSend!==false','brainOutsideClick','brainMenuKeyboard'])
 assert.ok(brain.includes(s),s);
 assert.doesNotMatch(brain,/expert_turn\(/);
 assert.match(brain,/data-test="brain-expert-popup"/);
});

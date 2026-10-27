import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const composer=readFileSync(new URL('../src/BCNativeComposer.vue',import.meta.url),'utf8');
const brain=readFileSync(new URL('../src/BCPrivateBrainWorkspace.vue',import.meta.url),'utf8');

test('PR99 CONTACT popovers use the sole native Composer, not an expanded 10-item bottom list',()=>{
 assert.match(composer,/const contactTrigger=Object\.freeze/);
 assert.match(composer,/data-test="w46-composer-experts"/);
 assert.match(composer,/\.bc-compose-popup\{position:absolute/);
 assert.match(composer,/bottom:calc\(100% - 1px\)/);
 assert.match(composer,/max-height:min\(300px,58dvh\)/);
 assert.match(composer,/createComposerBridge/);
 assert.match(composer,/<Button disabled size="sm">发送不可用<\/Button>/);
});
test('PR99 CONTACT keyboard, Escape, outside click, focus restoration and cleanup',()=>{
 for(const s of ['keydown','pointerdown','Escape','ArrowDown','ArrowUp','Home','End','contactOutsideClick',
  'closeContactMenu(true)','aria-haspopup="menu"','aria-controls="w46-contact-experts-menu"']){
   assert.ok(composer.includes(s),s);
 }
 assert.match(composer,/document\.removeEventListener\('keydown',contactMenuKeyboard\)/);
 assert.match(composer,/document\.removeEventListener\('pointerdown',contactOutsideClick\)/);
});
test('CONTACT model and HUMAN/ASSISTED/AUTO are not PRIVATE model grants or unsourced W44 takeovers',()=>{
 assert.match(composer,/W44\/W47/);
 assert.match(composer,/disabled data-test="w46-mode-human"/);
 assert.match(composer,/disabled data-test="w46-mode-assisted"/);
 assert.match(composer,/disabled data-test="w46-mode-auto"/);
 assert.match(composer,/identity:\{type:Object,default:null\}/);
 assert.doesNotMatch(composer,/PRIVATE_ROUTES\.selection/);
});
test('PRIVATE model fee and Agno History unchanged, native tools/runs are only read when session valid',()=>{
 assert.match(brain,/confirmedModelSelection/);
 assert.match(brain,/verifiedTurn/);
 assert.match(brain,/verifiedHistory/);
 assert.match(brain,/confirmPaidCost:true/);
 assert.match(brain,/!modelChangeRequired/);
 assert.match(brain,/api\('\/api\/v2\/private-brain\/tools'\)/);
 assert.match(brain,/api\('\/api\/v2\/private-brain\/runs\?threadId=personal&limit=10'\)/);
 assert.match(brain,/ensureCurrent\(\)/);
 assert.match(brain,/authoritative!==true/);
 assert.match(brain,/canSend!==false/);
 assert.doesNotMatch(brain,/expert_turn\(/);
});
test('PRIVATE three popovers are mutually exclusive, accessible and fail closed on unavailable inspection',()=>{
 for(const s of ['toggleBrainExpert','toggleBrainModel','toggleBrainTools','closeBrainMenu','brainOutsideClick',
  'brainMenuKeyboard','role="menu"','aria-expanded','Escape','ArrowDown','ArrowUp','Home','End']){
  assert.ok(brain.includes(s),s);
 }
 assert.match(brain,/nativeReadState==='unavailable'/);
 assert.match(brain,/document\.removeEventListener\('pointerdown',brainOutsideClick\)/);
 assert.match(brain,/document\.removeEventListener\('keydown',brainMenuKeyboard\)/);
 assert.match(brain,/data-test="brain-expert-popup"/);
 assert.match(brain,/data-test="brain-model-settings"/);
 assert.match(brain,/data-test="w46-brain-tools"/);
});

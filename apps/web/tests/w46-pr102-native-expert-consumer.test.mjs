import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const brain=readFileSync(new URL('../src/BCPrivateBrainWorkspace.vue',import.meta.url),'utf8');
const composer=readFileSync(new URL('../src/BCNativeComposer.vue',import.meta.url),'utf8');

test('W46 reads W47 authenticated W43 directory, never returns design-only ten sample experts',()=>{
 assert.match(brain,/api\('\/api\/v2\/private-brain\/experts'\)/);
 for(const x of ['NATIVE_EXPERT_DIRECTORY_READ','W43_NATIVE_AGNO_EXPERT','dto.cataloguedCount!==10',
   'dto.installedReadOnlyCount!==1','dto.experts.filter(x=>x.installed).length!==1',
   'dto.experts.filter(x=>x.canInvoke).length>1','READ_ONLY_STABLE252_INSPECTION','canSend!==false'])
   assert.ok(brain.includes(x),x);
 assert.match(brain,/v-for="expert in experts"/);
 assert.doesNotMatch(brain,/原W43十类专家目录尚未通过W47正式HTTP资格回读/);
});
test('native enable eligibility gates on W43 identity, original model and explicit per-task user selection',()=>{
 for(const x of ['chosenExpertId','expertEligible','expertConsent','expertStableId','expertBusy',
   'expert.expertId!==\'oss-discovery\'','chosenExpertId.value!==\'oss-discovery\'',
   'model.selectedProvider!==catalog.value?.selectedProvider','model.selectedModelId!==catalog.value?.selectedModelId'])
   assert.ok(brain.includes(x),x);
 assert.match(brain,/data-test="brain-expert-consent"/);
 assert.match(brain,/data-test="brain-expert-run"/);
 assert.match(brain,/data-test="brain-expert-stable-id"/);
 assert.match(brain,/usageScope:'THIS_TASK'/);
 assert.match(brain,/crypto.getRandomValues/);
});
test('POST uses existing W47 CSRF, followed by W43 Agno Run and Trace authoritative GET, never forged result',()=>{
 for(const x of ["method:'POST'","'x-yance-csrf':session.value.csrf",
   '/api/v2/private-brain/experts/oss-discovery/turn',
   'COMPLETED_READ_ONLY_CATALOG_INSPECTION','EXPERT_RECEIPT_NOT_AUTHENTICATED',
   'EXPERT_RUN_TRACE_GET_MISMATCH','NATIVE_TRACES_FOUND','trace.noTraceFabricated!==true',
   'run.status!==\'COMPLETED\'','run.tools.length',
   'EXPERT_MODEL_QUALIFICATION_CHANGED'])
   assert.ok(brain.includes(x),x);
 assert.match(brain,/expertVerified.value=/);
 assert.match(brain,/expertError.value=/);
 assert.match(brain,/data-test="brain-expert-verified-run"/);
});
test('keep only one private Brain, original fee, history, Tools Run/Trace and popup keyboard close',()=>{
 for(const x of ['confirmedModelSelection','verifiedTurn','verifiedHistory',
   'confirmPaidCost:true','modelChangeRequired','toggleBrainExpert','toggleBrainModel','toggleBrainTools',
   'brainMenuKeyboard','brainOutsideClick','closeBrainMenu','nativeTrace','traceReadState'])
  assert.ok(brain.includes(x),x);
 assert.match(brain,/document.removeEventListener\('keydown',brainMenuKeyboard\)/);
});
test('CONTACT stays single Composer and all W44 modes fail closed without true K + durable grant',()=>{
 assert.match(composer,/createComposerBridge/);
 assert.match(composer,/data-test="w46-mode-human"/);
 assert.match(composer,/data-test="w46-mode-assisted"/);
 assert.match(composer,/data-test="w46-mode-auto"/);
 assert.match(composer,/<Button disabled size="sm">发送不可用<\/Button>/);
 assert.doesNotMatch(brain,/\/api\/v2\/contact-context\/change-mode/);
});

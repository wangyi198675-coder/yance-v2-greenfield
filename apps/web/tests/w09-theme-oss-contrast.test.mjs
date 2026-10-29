import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../src/BCVisualThemeSystem.css',import.meta.url),'utf8');
const shell=readFileSync(new URL('../src/BCProductWorkspaceCandidate.vue',import.meta.url),'utf8');
test('chat content never fades behind decorative aurora masking',()=>{
 assert.doesNotMatch(css,/mask-image:linear-gradient\(90deg,transparent,black 17%,black 83%,transparent\)/);
 assert.match(css,/\.w46-product-candidate \.bc-real-timeline\s*\{\s*mask-image:none!important;-webkit-mask-image:none!important;/);
 assert.match(css,/\.w46-product-candidate \.bc-message-text\{/);
 assert.match(css,/font-size:14\.5px!important/);
 assert.match(css,/\.bc-message-text \.bc-translation\{/);
});
test('five original themes and both modes have explicit readable chat tokens',()=>{
 for(let n=1;n<=4;n++)assert.ok(css.includes('.shell[data-theme="'+n+'"] .w46-product-candidate'));
 for(let n=1;n<=4;n++)assert.ok(css.includes('.shell[data-mode="light"][data-theme="'+n+'"] .w46-product-candidate'));
 for(const token of ['--wow-chat-in','--wow-chat-out','--wow-chat-ink','--wow-chat-sub','--wow-chat-border'])assert.ok(css.includes(token),token);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/prefers-contrast:more/);
});
test('account and Persona overlays use licensed OSS Reka Dialog rather than handwritten modal masks',()=>{
 assert.match(shell,/import \{Dialog,DialogContent,DialogTitle,DialogDescription\} from .*components\/oss\/dialog/);
 assert.match(shell,/<Dialog v-model:open="addAccountOpen">/);
 assert.match(shell,/<Dialog :open="Boolean\(personaModal\)"/);
 assert.match(shell,/data-test="w46-account-add-dialog"/);
 assert.match(shell,/data-test="w46-persona-example-details"/);
 assert.doesNotMatch(shell,/<div v-if="addAccountOpen" class="w46-add-account-backdrop"/);
 assert.doesNotMatch(shell,/<div v-if="personaModal" class="w46-persona-modal-mask"/);
});

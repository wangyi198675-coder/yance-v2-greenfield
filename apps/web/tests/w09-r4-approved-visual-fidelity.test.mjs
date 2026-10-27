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

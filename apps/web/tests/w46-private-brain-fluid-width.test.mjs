import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const brain=readFileSync(new URL('../src/BCPrivateBrainWorkspace.vue',import.meta.url),'utf8');
const shell=readFileSync(new URL('../src/BCProductWorkspaceCandidate.vue',import.meta.url),'utf8');
test('one original BRAIN fills desktop container instead of leaving a fixed empty right column',()=>{
 const css=brain.match(/\.bc-private-brain\{([^}]+)\}/)?.[1];
 assert.ok(css,'original brain style retained');
 assert.match(css,/width:100%/);
 assert.match(css,/min-width:0/);
 assert.match(css,/box-sizing:border-box/);
 assert.doesNotMatch(css,/max-width\s*:\s*(?:850px|[0-9]+px)/,'no fixed card cap');
 assert.match(shell,/\.w46-brain-one\{min-width:0;width:100%\}/);
 assert.equal((shell.match(/<BCPrivateBrainWorkspace\b/g)||[]).length,1);
});

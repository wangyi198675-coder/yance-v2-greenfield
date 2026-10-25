import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const vue=readFileSync(new URL('../src/BCProductWorkspaceCandidate.vue',import.meta.url),'utf8');
const vite=readFileSync(new URL('../vite.w46.config.mjs',import.meta.url),'utf8');
test('only NON-CHAT candidate gains bounded vertical flex scrolling; old CHAT shell remains untouched',()=>{
 assert.match(vue, /\.w46-product-candidate:not\(\[data-active-workspace='CHAT'\]\)\{/);
 assert.match(vue,/flex:1 1 0;min-height:0;min-width:0;display:flex;flex-direction:column;overflow:hidden/);
 assert.match(vue,/\.w46-candidate-content\{[\s\S]*?flex:1 1 0;min-height:0;min-width:0;[\s\S]*?overflow-y:auto;overflow-x:hidden;/);
 assert.match(vue,/scroll-behavior:auto;touch-action:pan-y;/);
 assert.match(vue,/\.w46-product-top,[\s\S]*?\.w46-small-workspaces\{flex:0 0 auto\}/);
 assert.doesNotMatch(vue,/(^|\n)\s*\.shell\s*\{\s*overflow-y:auto/m);
 assert.doesNotMatch(vue,/(^|\n)\s*main\.workspace\s*\{\s*overflow-y:auto/m);
 assert.match(vite,/v-show=/);
 assert.match(vite,/!w46WorkspaceEnabled\|\|w46Workspace===/);
});
test('scroll region is keyboard focusable, has accessible label and resets only when workspace changes',()=>{
 assert.match(vue,/ref="contentScroller" tabindex="0" role="region"/);
 assert.match(vue,/:aria-label="selected.label\+'工作区内容（可滚动）'"/);
 assert.match(vue,/watch\(\(\)=>props.activeWorkspace,async\(\)=>\{/);
 assert.match(vue,/await nextTick\(\);/);
 assert.match(vue,/contentScroller\.value\.scrollTop=0;/);
 assert.doesNotMatch(vue,/document\.body\.style\.overflow/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=(p)=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8');
test('P0 non-text records retain their real ID and visibly mark unverified content',()=>{
 const chat=get('BCLiveChatWorkspace.vue');
 assert.match(chat,/const hasDisplayableText=m=>/);
 assert.match(chat,/data-mid="m.mid"|:data-mid="m.mid"/);
 assert.match(chat,/v-if="hasDisplayableText\(m\)"/);
 assert.match(chat,/data-test="w09-nontext-placeholder"/);
 assert.match(chat,/内容类型尚未核实/);
 assert.doesNotMatch(chat,/timeline\.value\s*=\s*.*filter\(.*original/);
});
test('global dark/light scrollbar and native controls are scoped across all UI workspaces',()=>{
 const css=get('BCGlobalVisualQA.css');
 assert.match(css,/color-scheme:dark/);
 assert.match(css,/color-scheme:light/);
 assert.match(css,/scrollbar-color:var\(--w09-scroll-thumb/);
 assert.match(css,/::-webkit-scrollbar-track/);
 assert.match(css,/\.w09-oss-palette\.is-light/);
 assert.match(css,/\.w46-oss-dialog\.is-dark/);
 assert.match(css,/\.bc-real-timeline/);
 assert.match(css,/\.bc-inbox-list-scroll/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/prefers-contrast:more/);
 assert.doesNotMatch(css,/@import url/);
 const shell=get('BCProductWorkspaceCandidate.vue');
 assert.match(shell,/import '\.\/BCGlobalVisualQA\.css'/);
});

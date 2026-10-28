import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../src/BCPrivateBrainWorkspace.vue',import.meta.url),'utf8');
test('full width single Agno workspace is not centered into fixed 940px rails',()=>{
 const at=css.indexOf('/* One original W43 Agno workspace fills its viewport.');
 assert.ok(at>0,'single native W43 UI width override missing');
 const style=css.slice(at,css.indexOf('.bc-brain-pending{',at));
 assert.match(style,/max-width:none!important/);
 assert.match(style,/padding-left:clamp\(12px,2\.5vw,30px\)!important/);
 assert.match(style,/padding-right:clamp\(12px,2\.5vw,30px\)!important/);
 assert.match(style,/width:calc\(100% - clamp\(24px,5vw,60px\)\)!important/);
 assert.doesNotMatch(style,/940px|calc\(\(100% - 940px\)/);
});
test('W43 unique tools drawer and Composer preserved, no second executor',()=>{
 assert.match(css,/data-test="brain-question"/);
 assert.match(css,/data-test="w46-brain-tools"/);
 assert.match(css,/data-test="brain-send"/);
 assert.match(css,/@keydown="brainComposerKeydown"/);
 assert.match(css,/\.bc-brain-tools-visible\.bc-private-brain/);
});

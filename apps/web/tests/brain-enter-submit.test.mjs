import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync(new URL('../src/BCPrivateBrainWorkspace.vue',import.meta.url),'utf8');
test('Enter sends with IME protection, Shift/Alt Enter keeps newline',()=>{
 assert.match(s,/function brainComposerKeydown\(e\)/);
 assert.match(s,/e\.key!=='Enter'\|\|e\.shiftKey\|\|e\.altKey\|\|e\.isComposing\|\|e\.keyCode===229/);
 assert.match(s,/e\.preventDefault\(\);\s*if\(!requestInFlight\.value\)void send\(\)/);
 assert.match(s,/@keydown="brainComposerKeydown"/);
});
test('composer clears immediately, preview until original W43 history verified, restores on failed request',()=>{
 const start=s.indexOf('async function send(){'),end=s.indexOf('onMounted(',start);
 assert.ok(start>0&&end>start);
 const f=s.slice(start,end);
 assert.match(f,/pendingPrompt\.value=prompt;streamingPreview\.value='';\s*text\.value='';/);
 assert.ok(f.indexOf("text.value=''")<f.indexOf('await nativeStreamingTurn(PRIVATE_ROUTES.turn'));
 assert.match(f,/verifiedTurn\(reply/);
 assert.match(f,/await loadHistory\(id\)/);
 assert.match(f,/loadState\.value==='ready'\)\{\s*pendingPrompt\.value='';streamingPreview\.value=''/);
 assert.match(f,/if\(!receiptVerified\)\{text\.value=prompt;pendingPrompt\.value='';streamingPreview\.value=''\}/);
 assert.match(s,/data-test="brain-pending-user"/);
 assert.match(s,/data-test="brain-generating"/);
});
test('selected SIWC model shows actual server default reasoning effort without fake controls',()=>{
 assert.match(s,/data-test="brain-reasoning-effective"/);
 assert.match(s,/推理档位：模型服务端默认/);
 assert.doesNotMatch(s,/data-test="reasoning-(low|medium|high)"/);
});

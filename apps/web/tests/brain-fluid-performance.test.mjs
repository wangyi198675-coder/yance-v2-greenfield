import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../src/BCPrivateBrainWorkspace.vue',import.meta.url),'utf8');
test('original Agno retains one brain and uses full available width',()=>{
 assert.match(src,/max-width:none!important;width:100%;align-self:stretch/);
 assert.match(src,/\.bc-private-brain \.bc-private-compose\{/);
 assert.match(src,/max-width:none!important;width:calc\(100% - clamp/);
 assert.match(src,/bc-brain-tools-visible/);
 assert.doesNotMatch(src,/<BCNativeComposer/);
});
test('tools are an actionable drawer with close, real native Tools Run Trace',()=>{
 assert.match(src,/data-test="brain-close-tools"/);
 assert.match(src,/data-test="w46-brain-tools"/);
 assert.match(src,/grid-template-columns:minmax\(0,1fr\) minmax\(265px,340px\)/);
 assert.match(src,/api\('\/api\/v2\/private-brain\/tools'\)/);
 assert.match(src,/api\('\/api\/v2\/private-brain\/runs\?threadId=personal&limit=10'\)/);
 assert.match(src,/tool\.businessExecutable\?'具备服务端执行资格'/);
});
test('native history asynchronous load permits typing, blocks sending until verified',()=>{
 assert.match(src,/loadState\.value='history-loading';\s*void loadHistory\(id\)/);
 assert.match(src,/\['ready','history-loading'\]\.includes\(loadState\)/);
 assert.match(src,/:disabled="loadState!=='ready'\|\|busy\|\|requestInFlight\|\|!text\.trim\(\)"/);
 assert.match(src,/verifiedHistory\(await api\(PRIVATE_ROUTES\.history/);
 assert.match(src,/data-test="brain-check" aria-label="重新同步原生 Agno 历史"/);
});

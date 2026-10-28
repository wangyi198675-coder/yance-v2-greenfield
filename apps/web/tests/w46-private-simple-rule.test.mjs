import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PRIVATE_ROUTES,privateError} from '../src/private-brain-ui-contract.mjs';
const content=readFileSync(new URL('../src/BCPrivateBrainWorkspace.vue',import.meta.url),'utf8');
const parent=readFileSync(new URL('../src/BCProductWorkspaceCandidate.vue',import.meta.url),'utf8');
const source=readFileSync(new URL('../src/product-workspace-contract.mjs',import.meta.url),'utf8');
const settings=readFileSync(new URL('../src/BCSettingsWorkspace.vue',import.meta.url),'utf8');
test('ordinary private AI needs no visible terminal pair or Windows native auth screen',()=>{
 assert.equal((parent.match(/<BCPrivateBrainWorkspace\b/g)||[]).length,1);
 assert.equal((settings.match(/<BCNativeHostSession\b/g)||[]).length,1);
 assert.match(settings,/category==='diagnostics'/);
 const privateSection=parent.match(/<div v-else-if="activeWorkspace==='BRAIN'"[\s\S]*?<\/div>/)?.[0]||'';
 assert.match(privateSection,/<BCPrivateBrainWorkspace/);
 assert.doesNotMatch(privateSection,/BCNativeHostSession|BCLocalSessionConnector|pair/);
 assert.doesNotMatch(content,/64位配对|终端pair|登录后才能|本机可信会话尚未建立/);
 assert.match(content,/loadState\.value='setup-required';setupOpen\.value=true/);
 assert.match(content,/loadState\.value='service-unavailable';setupOpen\.value=true/);
});
test('cloud provider labels remain independent of local optional Qwen3',()=>{
 assert.match(readFileSync(new URL('../src/private-brain-ui-contract.mjs',import.meta.url),'utf8'),/OPENROUTER_USER_API/);
 assert.match(content,/OPENAI_USER_API/);
 assert.match(content,/LLAMACPP_LOCAL_QWEN3_8B_FREE/);
 assert.match(content,/OpenRouter/);assert.match(content,/OpenAI API/);
 assert.match(content,/Qwen3/);assert.match(content,/本地 Qwen3 完全可选/);
 assert.match(source,/唯一 Agno · 本地或云端模型任选/);
});
test('same native W43/W47 Agno model history/turn and no browser key or fake responses',()=>{
 assert.equal(PRIVATE_ROUTES.turn,'/api/v2/private-brain/turn');
 assert.equal(PRIVATE_ROUTES.history,'/api/v2/private-brain/history');
 assert.match(content,/verifiedTurn\(reply/);
 assert.match(content,/verifiedHistory\(await api\(PRIVATE_ROUTES\.history/);
 assert.match(content,/await loadHistory\(id\)/);
 assert.doesNotMatch(content,/localStorage|sessionStorage|<BCNativeComposer|type="password"/);
 assert.match(content,/loadState\.value!=='ready'/);
 assert.match(privateError(401),/本机 AI 服务尚未连接/);
 assert.match(privateError(403),/费用/);
});

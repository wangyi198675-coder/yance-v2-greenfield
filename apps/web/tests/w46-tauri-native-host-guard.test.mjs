import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const vite=readFileSync(new URL('../vite.w46.config.mjs',import.meta.url),'utf8');
const api=readFileSync(new URL('../../../services/api/runtime/server.mjs',import.meta.url),'utf8');
test('exact Tauri asset origin enables B+C UI, not native API privilege',()=>{
 assert.match(vite,/window\.location\.protocol==='http:'&&window\.location\.hostname==='tauri\.localhost'/);
 assert.match(vite,/w46WorkspaceEnabled=new URLSearchParams\(window\.location\.search\)\.get\('productDraft'\)==='1'\|\|w46InstalledAssetHost/);
 assert.doesNotMatch(vite,/hostname\.endsWith\('localhost'\)/);
});
test('test-only TAKEOVER and STOP constructors cannot throw on installed Tauri origin',()=>{
 assert.match(vite,/w46Port=w46LegacyLoopbackLab\?createLoopbackTakeoverPort/);
 assert.match(vite,/w46StopPort=w46LegacyLoopbackLab\?\s*createLoopbackManagedStopPort/);
 assert.match(vite,/const w46LegacyLoopbackLab=!w46WorkspaceEnabled&&/);
 assert.match(vite,/if\(w46WorkspaceEnabled\|\|!w46LegacyLoopbackLab\|\|!identity\|\|!mid\)return/);
});
test('W47 original origin and parent authority is not weakened to fix static asset loading',()=>{
 assert.match(api,/LOOPBACK_ONLY/);
 assert.match(api,/TRUSTED|trustedSession|NATIVE_FIRST_PARTY/);
 assert.match(vite,/w46WorkspaceEnabled/);
 assert.match(vite,/process\.env\.W46_OFFICIAL_TAURI_BUNDLE==='1'/);
 assert.match(vite,/connect-src 'self' ipc: http:\/\/ipc\.localhost/);
 assert.doesNotMatch(vite,/connect-src \*/);
 assert.doesNotMatch(vite,/http:\/\/localhost:\\d+/);
 assert.doesNotMatch(vite,/W47_FORCE_AUTHORIZED|W54_SKIP_SIGNATURE|ENABLE_REAL_SEND/);
});

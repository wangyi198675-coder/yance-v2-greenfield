// P0 positive proof uses actual official compiled Windows tdjson.dll.
// Required only when YANCE_W29_EXPECT_NATIVE=1; CI elsewhere reports NOT_RUN,
// never a false positive for a library absent on the runner.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {inspectInstalledTDJson,probeTDJson,probeTDJsonAuthorizationState,TD_SOURCE} from '../src/native-tdjson.mjs';
const runtime=resolve(dirname(fileURLToPath(import.meta.url)),'..','runtime');
const requested=process.env.YANCE_W29_EXPECT_NATIVE==='1';
const skip=requested?false:'NOT_RUN: set YANCE_W29_EXPECT_NATIVE=1 on isolated Windows with official pinned tdjson.dll';
test('actual OFFICIAL native td_execute loads verified Windows library, two fresh processes', {skip},async()=>{
  assert.equal(process.platform,'win32','W29 native proof must run on actual Windows');
  const files=await inspectInstalledTDJson(runtime);
  assert.equal(files.installed,true);
  assert.equal(files.sourceCommit,TD_SOURCE.commit);
  const first=await probeTDJson(runtime);
  const second=await probeTDJson(runtime);
  assert.equal(first.nativeLoaded,true);
  assert.equal(second.nativeLoaded,true);
  assert.equal(first.officialAbi,'td_execute');
  assert.equal(first.dllSha256,second.dllSha256);
  assert.equal(first.nativeHostExitCode,0);
  assert.equal(second.nativeHostExitCode,0);
  assert.ok(Number.isInteger(first.nativeHostPid)&&first.nativeHostPid>0);
  assert.ok(Number.isInteger(second.nativeHostPid)&&second.nativeHostPid>0);
  assert.notEqual(first.nativeHostPid,second.nativeHostPid,
    'two different native processes required for restart/reload test');
  assert.equal(first.authorized,false);
  assert.equal(second.canSend,false);
});

test('actual binary SHA256 tampering is rejected without opening any Telegram session',{skip},async()=>{
  const {mkdtemp,copyFile,readFile,writeFile,rm}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const dir=await mkdtemp(join(tmpdir(),'w29-real-binary-hash-reject-'));
  try{
    const manifest=JSON.parse(await readFile(join(runtime,'tdjson-native-manifest.json'),'utf8'));
    for(const filename of ['tdjson.dll','TDJsonHost.exe',...(manifest.dependencies||[]).map(d=>d.name)])
      await copyFile(join(runtime,filename),join(dir,filename));
    manifest.dllSha256='0'.repeat(64); // wrong signed package provenance, not real runtime corruption
    await writeFile(join(dir,'tdjson-native-manifest.json'),JSON.stringify(manifest));
    await assert.rejects(inspectInstalledTDJson(dir),{code:'NATIVE_SHA256_MISMATCH'});
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('official TDLib runs real empty authorization state machine without credentials',{skip},async()=>{
  const r=await probeTDJsonAuthorizationState(runtime);
  assert.equal(r.officialNativeState,'authorizationStateWaitTdlibParameters');
  assert.equal(r.waitingUserAuth,true);
  assert.equal(r.connected,false);
  assert.equal(r.canSend,false);
  assert.match(r.realLibrarySha256,/^[a-f0-9]{64}$/);
  assert.ok(r.processPid>0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  TDHold,TD_SOURCE,inspectInstalledTDJson,probeTDJson,nativeTDJsonController,
} from '../src/native-tdjson.mjs';

test('official upstream pin is fully specified, no Bot API',()=>{
  assert.match(TD_SOURCE.commit,/^[a-f0-9]{40}$/);
  assert.equal(TD_SOURCE.upstream,'https://github.com/tdlib/td.git');
  assert.equal(TD_SOURCE.license,'BSL-1.0');
});
test('native DLL proof refuses absent manifest and never starts a client',async()=>{
  if(process.platform!=='win32') {
    await assert.rejects(inspectInstalledTDJson('.'),{code:'NATIVE_WINDOWS_ONLY'});
    return;
  }
  const dir=await mkdtemp(join(tmpdir(),'w29-native-failclosed-'));
  try{
    await assert.rejects(inspectInstalledTDJson(dir),{code:'NATIVE_MANIFEST_NOT_INSTALLED'});
    await assert.rejects(probeTDJson(dir),{code:'NATIVE_MANIFEST_NOT_INSTALLED'});
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('native attestation rejects wrong upstream build, even if a file exists',async()=>{
  if(process.platform!=='win32') return;
  const dir=await mkdtemp(join(tmpdir(),'w29-binary-mismatch-'));
  try{
    await writeFile(join(dir,'tdjson-native-manifest.json'),JSON.stringify({
      sourceCommit:'0'.repeat(40),sourceVersion:TD_SOURCE.version,
      license:TD_SOURCE.license,architecture:'x64'
    }));
    await assert.rejects(inspectInstalledTDJson(dir),{code:'NATIVE_UPSTREAM_PIN_MISMATCH'});
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('cannot create connected TDLib controller without original Owner proof ports',()=>{
  assert.throws(()=>nativeTDJsonController({}),{code:'ORIGINAL_OWNER_AUTH_PORT_MISSING'});
});
test('no explicit trusted OS user gesture => WAITING_USER_AUTH; no DLL loaded',async()=>{
  const controller=nativeTDJsonController({
    runtimeDir:'DOES_NOT_EXIST',
    attestUserGesture:async()=>({approved:false,userInitiated:false}),
    findAuthorizedAccount:async()=>{throw Error('MUST_NOT_CALL');},
    verifyCurrentPeerK:async()=>true,onAuthorizedInbound:async()=>{},
    verifyW25Receipt:async()=>({verified:false}), onW25Receipt:async()=>{},
    onNativeAccountIdentity:async()=>{}, onTrustedChatIndex:async()=>{}
  });
  assert.deepEqual(controller.status().stage,'WAITING_USER_AUTH');
  await assert.rejects(controller.begin({sessionHandle:'fake',gestureId:'fake'}),{
    code:'WAITING_USER_AUTH'
  });
  assert.equal(controller.status().nativeRunning,false);
  assert.equal(controller.status().canSend,false);
  assert.equal('sendMessage' in controller,false);
});
test('gesture alone without trusted W24 channel account => no worker',async()=>{
  const ctrl=nativeTDJsonController({
    runtimeDir:'DOES_NOT_EXIST',
    attestUserGesture:async()=>({
      approved:true,userInitiated:true,provider:'TELEGRAM_PERSONAL',
      expiresAt:Date.now()+10000,
    }),
    findAuthorizedAccount:async()=>({authorizedForLogin:false}),
    verifyCurrentPeerK:async()=>true,onAuthorizedInbound:async()=>{},
    verifyW25Receipt:async()=>({verified:false}), onW25Receipt:async()=>{},
    onNativeAccountIdentity:async()=>{}, onTrustedChatIndex:async()=>{},
  });
  await assert.rejects(ctrl.begin({}),{code:'CHANNEL_ACCOUNT_PROOF_MISSING'});
  assert.equal(ctrl.status().nativeRunning,false);
  assert.equal(ctrl.status().canSend,false);
});
test('cannot call native authorizeStep until real trusted worker exists',async()=>{
  const ctrl=nativeTDJsonController({
    attestUserGesture:async()=>{throw Error('NO_PERMISSION');},
    findAuthorizedAccount:async()=>null,verifyCurrentPeerK:async()=>false,
    onAuthorizedInbound:async()=>{},
    verifyW25Receipt:async()=>({verified:false}), onW25Receipt:async()=>{},
    onNativeAccountIdentity:async()=>{}, onTrustedChatIndex:async()=>{},
  });
  await assert.rejects(ctrl.authorizeStep({request:{'@type':'sendMessage'}}),{
    code:'NO_RUNNING_TRUSTED_TDLIB_SESSION'
  });
  assert.equal(ctrl.status().canSend,false);
});

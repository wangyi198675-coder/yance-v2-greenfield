import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeSessionViewer} from '../src/native-host-status-port.mjs';
const native={nativeOsVerified:true,nativeSessionActive:true,serverTrusted:false,
 canSend:false,connectedAccountCount:0};
test('Chrome without official Tauri cannot fake trusted Windows login',async()=>{
 const x=createNativeSessionViewer({tauri:null});
 assert.equal(x.available,false);
 await assert.rejects(x.inspect(),/TAURI_NATIVE_NOT_INSTALLED/);
 await assert.rejects(x.logout(),/TAURI_NATIVE_NOT_INSTALLED/);
});
test('real W54 session_status is not alone a W47 trusted PRIVATE user',async()=>{
 const calls=[];
 const viewer=createNativeSessionViewer({
  tauri:{core:{invoke:async name=>{calls.push(name);return native}}},
  fetchImpl:async(url,init)=>{
   calls.push(url);
   assert.equal(init.credentials,'same-origin');
   return {ok:true,json:async()=>({ok:true,canSend:false,trustedSession:false})};
  }
 });
 const x=await viewer.inspect();
 assert.equal(x.nativeActive,true);
 assert.equal(x.trustedForBrain,false);
 assert.equal(x.canSend,false);
 assert.deepEqual(calls,['session_status','/api/v2/runtime/health']);
});
test('W54 status with actual W47 first-party authority may display verified; no sender',async()=>{
 const viewer=createNativeSessionViewer({
  tauri:{core:{invoke:async()=>native}},
  fetchImpl:async()=>({ok:true,json:async()=>({ok:true,trustedSession:true,canSend:false})})
 });
 const s=await viewer.inspect();
 assert.equal(s.trustedForBrain,true);
 assert.equal(s.canSend,false);
});
test('W54 renderer forged send:true, missing OS, server read failures reject',async()=>{
 for(const bad of [{...native,canSend:true},{...native,nativeOsVerified:'yes'},
  {...native,nativeSessionActive:true,connectedAccountCount:-1}])
  await assert.rejects(createNativeSessionViewer({
   tauri:{core:{invoke:async()=>bad}},
   fetchImpl:async()=>({ok:true,json:async()=>({ok:true,trustedSession:true,canSend:false})})
  }).inspect(),/W54_SESSION_STATUS_NOT_SIGNED/);
 const failed=createNativeSessionViewer({tauri:{core:{invoke:async()=>native}},
  fetchImpl:async()=>({ok:false,status:401})});
 assert.equal((await failed.inspect()).trustedForBrain,false);
});
test('native logout is explicit and gets second independent W47 read',async()=>{
 const calls=[];
 const viewer=createNativeSessionViewer({
  tauri:{core:{invoke:async command=>{
   calls.push(command);
   return command==='session_status'?{...native,nativeSessionActive:false}:undefined;
  }}},
  fetchImpl:async(url)=>{calls.push(url);return {ok:false,status:401}}
 });
 assert.equal((await viewer.logout()).nativeActive,false);
 assert.deepEqual(calls,['logout_session','session_status','/api/v2/runtime/health']);
});

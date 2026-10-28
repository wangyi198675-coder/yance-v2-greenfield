import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createLocalSessionAuthority,createLocalSessionHttpApi} from './local-session.mjs';
import {createW54NativeWebViewSessionJoin} from './w54-native-webview-session.mjs';
import {createServer} from 'node:http';

const origin='http://127.0.0.1:44760';
const fakeHost=()=>({authoritative:true,nativeHostRef:randomBytes(32).toString('hex'),
 rendererRef:'test_tauri_webview2_001',nativeRevocationGeneration:3});
function make(a,extra={}){
 return createW54NativeWebViewSessionJoin({sessionAuthority:a,
  verifySignedHost:async()=>fakeHost(),
  verifyStillCurrent:async()=>true,
  deliverNativeCookie:async()=>true,
  subscribeHostExit:async()=>()=>{},...extra});
}
const http=async(authority)=>{
 const api=createLocalSessionHttpApi({authority,webOrigin:origin});
 const s=createServer(async(req,res)=>api(req,res,new URL(req.url,'http://127.0.0.1')));
 await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+s.address().port;
 const call=async(path,cookie,method='GET',body)=>{
  const headers={Origin:origin};
  if(cookie)headers.Cookie=cookie;
  if(body){headers['content-type']='application/json'}
  const r=await fetch(base+path,{method,headers,
   body:body?JSON.stringify(body):undefined});
  return {status:r.status,data:await r.json(),setCookie:r.headers.get('set-cookie')};
 };
 return {call,close:()=>new Promise(resolve=>s.close(resolve))};
};
test('NO independently signed W54 parent+renderer+OS lifetime producer => refuse native session',async()=>{
 const a=createLocalSessionAuthority();
 assert.throws(()=>createW54NativeWebViewSessionJoin({sessionAuthority:a}),
  /W54_NATIVE_PARENT_WEBVIEW_LIFECYCLE_PRODUCER_REQUIRED/);
 const x=make(a,{verifySignedHost:async()=>({authoritative:false,nativeHostRef:'a'.repeat(64),
  rendererRef:'test_tauri_webview2_001',nativeRevocationGeneration:1})});
 await assert.rejects(()=>x.begin({verifiedChildPipe:{test:true}}),
  /W54_NATIVE_SIGNED_HOST_UNVERIFIED/);
 const h=await http(a);
 try{
  const r=await h.call('/api/v2/local-session/first-party',null,'POST',{});
  assert.equal(r.status,503);
  assert.equal(r.setCookie,null);
 }finally{await h.close()}
});
test('TEST ONLY verified W54 host binds private cookie only in native WebView and exit revokes',async()=>{
 const a=createLocalSessionAuthority();const host=fakeHost();
 let onExit;let deliveredCookie;let nativeCalls=0,verifyCalls=0;
 const bridge=make(a,{
  verifySignedHost:async()=>host,
  verifyStillCurrent:async()=>{verifyCalls++;return true},
  deliverNativeCookie:async({rendererRef,httpOnlyCookie})=>{
   assert.equal(rendererRef,host.rendererRef);
   assert.match(httpOnlyCookie,/^yance_local_session=[a-f0-9]{64}; HttpOnly; SameSite=Strict;/);
   deliveredCookie=httpOnlyCookie.split(';')[0];nativeCalls++;return true
  },
  subscribeHostExit:async({onExit:callback})=>{onExit=callback;return ()=>{}}
 });
 const h=await http(a);
 try{
  const success=await bridge.begin({verifiedChildPipe:{testOnly:true}});
  assert.equal(success.ok,true);
  assert.equal(success.canSend,false);
  assert.equal('cookie' in success,false);
  assert.equal(nativeCalls,1);assert.equal(verifyCalls,2);
  assert.equal((await h.call('/api/v2/local-session/status')).data.paired,false);
  const own=await h.call('/api/v2/local-session/status',deliveredCookie);
  assert.equal(own.data.paired,true);
  assert.equal(own.data.sessionKind,'NATIVE_FIRST_PARTY');
  onExit();
  assert.equal((await h.call('/api/v2/local-session/status',deliveredCookie)).data.paired,false);
  assert.equal((await h.call('/api/v2/local-session/first-party',null,'POST',{})).status,503);
 }finally{bridge.closeAll();await h.close()}
});
test('tainted WebView binder, missing host lifetime, revoked epoch deny and cannot keep cookie alive',async()=>{
 for(const patch of [
  {deliverNativeCookie:async()=>false},
  {verifyStillCurrent:async()=>false},
  {subscribeHostExit:async()=>null}
 ]){
  const a=createLocalSessionAuthority();let leakedCookie;
  const b=make(a,{deliverNativeCookie:async({httpOnlyCookie})=>{
   leakedCookie=httpOnlyCookie.split(';')[0];return true
  },...patch});
  await assert.rejects(()=>b.begin({verifiedChildPipe:{testOnly:true}}));
  if(leakedCookie){
   const h=await http(a);
   try{assert.equal((await h.call('/api/v2/local-session/status',leakedCookie)).data.paired,false)}
   finally{await h.close()}
  }
  b.closeAll();
 }
});
test('Host revocation during native delivery removes Session, without authorizing other browsers',async()=>{
 const a=createLocalSessionAuthority();const host=fakeHost();let cookie;
 let bridge;
 bridge=make(a,{verifySignedHost:async()=>host,
  deliverNativeCookie:async({httpOnlyCookie})=>{
   cookie=httpOnlyCookie.split(';')[0];
   bridge.onVerifiedNativeHostRevoked(host.nativeHostRef);
   return true;
  }});
 await assert.rejects(()=>bridge.begin({verifiedChildPipe:{testOnly:true}}),
  /W54_TAURI_WEBVIEW_COOKIE_NOT_BOUND/);
 const h=await http(a);
 try{assert.equal((await h.call('/api/v2/local-session/status',cookie)).data.paired,false)}
 finally{await h.close()}
});

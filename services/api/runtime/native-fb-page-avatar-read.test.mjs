import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createNativeFbPageAvatarHttp} from './native-fb-page-avatar-read.mjs';

const principal={verified:true,source:'W54_NATIVE_CURRENT_USER',
 principalRef:'trusted-owner',installationRef:'installed-app-001',revocationGeneration:4};
const bound={authorized:true,currentKVerified:true,consentCurrent:true,
 channel:'FB_PAGE',provider:'PANCAKE',ownerPrincipalRef:'trusted-owner',
 accountRef:'nativeAccount99',peerRef:'realpsid8811',bindingRevision:3,
 active:true,accountOnline:true,providerPageId:'12345678',pageScopedPsid:'88118811',
 accountRevocationEpoch:8,consentEpoch:2,channelAccountId:'current-W24-owner'};
const url='/api/v2/contacts/avatar?accountRef=nativeAccount99&peerRef=realpsid8811&bindingRevision=3';
const avatarUrl='https://content.pancake.vn/2.1-24/avatars/test-public-id';
function handler(opts={}){
 let calls=0;
 let currentPeerCalls=0;
 let sessionReads=0;
 const app=createNativeFbPageAvatarHttp({
  sessionAuthority:{sessionFor(){sessionReads++;return opts.noSession?null:
    {id:'native-session',record:{kind:'NATIVE_FIRST_PARTY',rev:1}};}},
  webOrigin:'http://127.0.0.1:44767',
  resolveW54CurrentUser:opts.noPorts?null:async()=>opts.principal??principal,
  resolveW24CurrentPagePeer:opts.noPorts?null:async()=>{
    currentPeerCalls++;
    return currentPeerCalls>1&&opts.boundAfter?opts.boundAfter:opts.bound??bound;
  },
  readW27OfficialAvatar:opts.noPorts?null:async()=>{
    calls++;
    return opts.avatar??{status:'PRESENT',avatarUrl};
  }
 });
 return {app,get calls(){return calls},get sessionReads(){return sessionReads}};
}
async function call(h,{path=url,method='GET',origin}={}){
 const server=createServer((req,res)=>{void h.app(req,res,new URL(req.url,'http://127.0.0.1'));});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try {
  const address=server.address();
  const r=await fetch('http://127.0.0.1:'+address.port+path,{
   method,headers:origin?{origin}:{},redirect:'manual'
  });
  const text=await r.text();
  return {status:r.status,headers:r.headers,body:JSON.parse(text)};
 }finally{server.close();await once(server,'close');}
}
test('native W47/W24 authenticated read authorizes W27 official CDN URL over real HTTP',async()=>{
 const h=handler();const r=await call(h);
 assert.equal(r.status,200);assert.equal(r.body.status,'PRESENT');
 assert.equal(r.body.avatarUrl,avatarUrl);assert.equal(r.body.canSend,false);
 assert.equal(h.calls,1);assert.match(r.headers.get('cache-control'),/no-store/);
});
test('real HTTP without native session returns 401 and does not call provider',async()=>{
 const h=handler({noSession:true});const r=await call(h);
 assert.equal(r.status,401);assert.equal(r.body.error,'TRUSTED_LOCAL_SESSION_REQUIRED');
 assert.equal(h.calls,0);
});
test('signed User port or W24 resolver absent returns 503, no guessed avatar',async()=>{
 const h=handler({noPorts:true});const r=await call(h);
 assert.equal(r.status,503);
 assert.equal(r.body.error,'ORIGINAL_PAGE_AVATAR_OWNERS_NOT_CONNECTED');
 assert.equal(h.calls,0);
});
test('W24 wrong Page, account or inactive binding fails before provider',async()=>{
 for(const patch of [{ownerPrincipalRef:'other-principal'},{accountRef:'differentAcc'},{active:false},{accountOnline:false}]){
  const h=handler({bound:{...bound,...patch}});
  const r=await call(h);
  assert.equal(r.status,403);assert.equal(h.calls,0);
 }
});
test('W24 revokes during provider read: stale avatar URL never returned',async()=>{
 const h=handler({boundAfter:{...bound,accountRevocationEpoch:9}});
 const r=await call(h);
 assert.equal(r.status,409);
 assert.equal(r.body.avatarUrl,undefined);
 assert.equal(h.calls,1);
});
test('provider avatar 404 returns no-avatar and not a synthetic image',async()=>{
 const h=handler({avatar:{status:'NO_AVATAR',avatarUrl:null}});
 const r=await call(h);
 assert.equal(r.status,200);assert.equal(r.body.avatarUrl,null);
});
test('reject HTTP/CDN redirect spoofed by a provider',async()=>{
 for(const evil of ['http://content.pancake.vn/x','https://example.com/x']){
  const h=handler({avatar:{status:'PRESENT',avatarUrl:evil}});
  const r=await call(h);
  assert.equal(r.status,502);assert.equal(r.body.avatarUrl,undefined);
 }
});
test('GET only, same origin and strict account/peer locators',async()=>{
 const h=handler();assert.equal((await call(h,{method:'POST'})).status,405);
 assert.equal((await call(h,{origin:'https://evil.example'})).status,403);
 assert.equal((await call(h,{path:url+'&extra=1'})).status,422);
 assert.equal((await call(h,{path:'/api/v2/contacts/avatar?accountRef=foo&peerRef=xx&bindingRevision=0'})).status,422);
 assert.equal(h.calls,0);
});

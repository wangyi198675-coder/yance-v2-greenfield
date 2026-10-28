import test from 'node:test';
import assert from 'node:assert/strict';
import {readWhatsAppNative,connectWhatsAppNative,readWhatsAppNativeQr,
 changeWhatsAppNativeConnection} from './whatsapp-native-user-flow.mjs';
const csrf='a'.repeat(64);
function fake(handler){
 const calls=[];
 const fetchImpl=async(url,init={})=>{
  calls.push({url,init});
  const response=await handler(url,init);
  return {ok:!response.http||response.http<400,status:response.http??200,
    json:async()=>response.body??response};
 };
 return {fetchImpl,calls};
}
const authenticated={ok:true,paired:true,sessionKind:'NATIVE_FIRST_PARTY',
 expiresAt:Date.now()+180000,csrfToken:csrf,canSend:false,providerAuthorized:false};
const waState={ok:true,channel:'WHATSAPP_PERSONAL',source:'BAILEYS_NATIVE_SDK',
 state:'WAITING_QR_SCAN',connected:false,qrAvailable:true,canSend:false};
test('normal click goes to ORIGINAL W28 native POST with only selector + valid W47 CSRF',async()=>{
 const a=fake(async(url)=>url.includes('local-session')?authenticated:{
  ok:true,channel:'WHATSAPP_PERSONAL',state:'STARTING_NATIVE_SDK',
  connected:false,canSend:false});
 const receipt=await connectWhatsAppNative({fetchImpl:a.fetchImpl});
 assert.equal(receipt.state,'STARTING_NATIVE_SDK');
 assert.equal(a.calls.length,2);
 assert.equal(a.calls[0].url,'/api/v2/local-session/status');
 assert.equal(a.calls[1].url,'/api/v2/providers/whatsapp-personal/native/authorize');
 assert.equal(a.calls[1].init.method,'POST');
 assert.equal(a.calls[1].init.headers['X-Yance-CSRF'],csrf);
 assert.deepEqual(JSON.parse(a.calls[1].init.body),{accountLocator:'current-own-whatsapp'});
 assert.equal(JSON.parse(a.calls[1].init.body).authorized,undefined);
});
test('do not create WhatsApp Socket without real native current session',async()=>{
 const a=fake(async()=>({ok:true,paired:false,canSend:false,providerAuthorized:false}));
 await assert.rejects(connectWhatsAppNative({fetchImpl:a.fetchImpl}),/WHATSAPP_LOCAL_SESSION_REQUIRED/);
 assert.equal(a.calls.length,2);
 assert.equal(a.calls[1].url,'/api/v2/local-session/web-private-start');
 assert.equal(a.calls.some(c=>c.url.endsWith('/native/authorize')),false);
});
test('native status must be truly online and have verified real account JID',async()=>{
 const a=fake(async(url)=>url.includes('local-session')?authenticated:waState);
 const s=await readWhatsAppNative({fetchImpl:a.fetchImpl});
 assert.equal(s.online,false);assert.equal(s.qrAvailable,true);
 const bad=fake(async(url)=>url.includes('local-session')?authenticated:({...waState,state:'ONLINE',connected:true,accountIdentityVerified:true}));
 await assert.rejects(readWhatsAppNative({fetchImpl:bad.fetchImpl}),/WHATSAPP_NATIVE_STATUS_INVALID/);
 const online=fake(async(url)=>url.includes('local-session')?authenticated:({...waState,state:'ONLINE',connected:true,accountIdentityVerified:true,
  account:{platformJid:'555200@s.whatsapp.net'}}));
 assert.equal((await readWhatsAppNative({fetchImpl:online.fetchImpl})).online,true);
});
test('QR never synthesized, accepted only real SDK in-memory PNG and unexpired owner receipt',async()=>{
 const png='data:image/png;base64,'+'A'.repeat(120);
 const a=fake(async()=>({ok:true,source:'BAILEYS_NATIVE_CONNECTION_UPDATE',
  imageDataUrl:png,expiresAt:Date.now()+60000,generation:1,canSend:false}));
 assert.equal((await readWhatsAppNativeQr({fetchImpl:a.fetchImpl})).src,png);
 const b=fake(async()=>({ok:true,source:'LOCAL_MOCK',
  imageDataUrl:png,expiresAt:Date.now()+60000,generation:1,canSend:false}));
 await assert.rejects(readWhatsAppNativeQr({fetchImpl:b.fetchImpl}),/WHATSAPP_NATIVE_QR_INVALID/);
 const c=fake(async()=>({ok:true,source:'BAILEYS_NATIVE_CONNECTION_UPDATE',
  imageDataUrl:png,expiresAt:Date.now()-1,generation:1,canSend:false}));
 await assert.rejects(readWhatsAppNativeQr({fetchImpl:c.fetchImpl}),/WHATSAPP_NATIVE_QR_INVALID/);
});
test('native revoke needs original server CSRF and no provider credentials in browser',async()=>{
 const a=fake(async(url)=>url.includes('local-session')?authenticated:{
  ok:true,connected:false,state:'REVOKED',canSend:false});
 const revoked=await changeWhatsAppNativeConnection('revoke',{fetchImpl:a.fetchImpl});
 assert.equal(revoked.state,'REVOKED');
 assert.equal(a.calls[1].url,'/api/v2/providers/whatsapp-personal/native/revoke');
 assert.equal(a.calls[1].init.body,'{}');
 await assert.rejects(changeWhatsAppNativeConnection('send',{fetchImpl:a.fetchImpl}),
  /WHATSAPP_UNSUPPORTED_ACTION/);
});
test('HTTP 503 surfaces actual not-connected reason; never downgrade to fake docs PASS',async()=>{
 const a=fake(async(url)=>url.includes('local-session')?authenticated:
  ({http:503,body:{ok:false,error:'NATIVE_CHANNEL_AUTH_OWNER_PORT_NOT_CONNECTED'}}));
 await assert.rejects(readWhatsAppNative({fetchImpl:a.fetchImpl}),/WHATSAPP_HTTP_503/);
});

test('P0 two concurrent WhatsApp card refresh + Connect clicks must issue only ONE local session bootstrap/CSRF',async()=>{
 let sessionStarts=0,requestsToProvider=0;
 let grant=null;
 const fetchImpl=async(url,{headers}={})=>{
  if(url==='/api/v2/local-session/status'){
   // Both initial callers see the same browser state. Without single-flight,
   // two POST web-private-start requests race and set different cookies.
   return {ok:true,status:200,json:async()=>grant??{
    ok:true,paired:false,canSend:false,providerAuthorized:false
   }};
  }
  if(url==='/api/v2/local-session/web-private-start'){
   sessionStarts++;
   await new Promise(resolve=>setTimeout(resolve,30));
   grant={...authenticated,sessionKind:'WEB_LOCAL_PRIVATE'};
   return {ok:true,status:200,json:async()=>grant};
  }
  if(url.endsWith('/native/status')){
   requestsToProvider++;
   return {ok:true,status:200,json:async()=>({...waState,
    state:'WAITING_USER_AUTH',connected:false,qrAvailable:false})};
  }
  if(url.endsWith('/native/authorize')){
   requestsToProvider++;
   assert.equal(headers['X-Yance-CSRF'],csrf);
   return {ok:true,status:200,json:async()=>({
    ok:true,channel:'WHATSAPP_PERSONAL',state:'STARTING_NATIVE_SDK',
    connected:false,canSend:false
   })};
  }
  throw Error('UNEXPECTED_REQUEST_'+url);
 };
 const [status,connection]=await Promise.all([
   readWhatsAppNative({fetchImpl}),connectWhatsAppNative({fetchImpl})
 ]);
 assert.equal(status.state,'WAITING_USER_AUTH');
 assert.equal(connection.state,'STARTING_NATIVE_SDK');
 assert.equal(sessionStarts,1,'single-flight must prevent cookie/CSRF overwrite');
 assert.equal(requestsToProvider,2);
});
test('P0 failed initial bootstrap is not cached: later user re-click can renew local session',async()=>{
 let n=0;
 const fetchImpl=async(url)=>{
  if(url==='/api/v2/local-session/status')
   return {ok:true,status:200,json:async()=>({ok:true,paired:false})};
  if(url==='/api/v2/local-session/web-private-start'){
   n++;
   return {ok:n===2,status:n===2?200:503,json:async()=>({...authenticated,
    sessionKind:'WEB_LOCAL_PRIVATE'})};
  }
  if(url.endsWith('/native/authorize'))return {ok:true,status:200,json:async()=>({ok:true,channel:'WHATSAPP_PERSONAL',state:'STARTING_NATIVE_SDK',connected:false,canSend:false})};
  throw Error('UNEXPECTED_REQUEST_'+url);
 };
 await assert.rejects(connectWhatsAppNative({fetchImpl}),/WHATSAPP_LOCAL_SESSION_REQUIRED/);
 assert.equal((await connectWhatsAppNative({fetchImpl})).state,'STARTING_NATIVE_SDK');
 assert.equal(n,2);
});

// Guard the real Opera/Chromium layout regression: a hover-transformed
// WhatsApp card cannot contain a viewport-fixed QR overlay.
test('P0 real WhatsApp QR dialog teleports outside hover-transformed card',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('./BCChannelAccountSetup.vue',import.meta.url),'utf8');
 const open=source.indexOf('<Teleport to="body">');
 const qr=source.indexOf('v-if="qrOpen&&isWhatsApp" class="w46-qr-backdrop"');
 const close=source.indexOf('</Teleport>',qr);
 assert.ok(open>=0&&qr>open&&close>qr,'real QR dialog must live under document.body');
 assert.ok(source.includes('position:fixed;inset:0'),'real QR retains viewport sizing');
 assert.ok(!source.includes('backdrop-filter:blur('),'avoid Opera compositor blur flicker');
});

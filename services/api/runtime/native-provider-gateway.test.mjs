import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {createLocalSessionAuthority} from './local-session.mjs';
import {createNativeProviderGateway,makeW26DiagnosticPort} from './native-provider-gateway.mjs';
import {parseChannelState,parseChannelSetup,CHANNEL_OWNER} from '../../../apps/web/src/channel-setup-contract.mjs';
const W26=()=>({ok:true,channel:'FB_PERSONAL',provider:'mautrix-meta',
 source:'REAL_OFFICIAL_BINARY',binaryIntegrity:'OFFICIAL_SHA_VERIFIED',
 upstream:{upstreamCommit:'3c16226686c71af64df294df0803791685064e0b',
  binarySha256:'17b8fd89ee8bb71796b9406aad37fd871110efbb22ace26801034dab9c5a3843',
  version:'v26.10'},bridgeState:'RUNNING_OFFICIAL_APP_SERVICE_REGISTERED',
 realAccountState:'WAITING_USER_AUTH',accountIdentityVerified:false,canSend:false});
async function fixture(ports={}){
 const sessionAuthority=createLocalSessionAuthority();
 const api=createNativeProviderGateway({sessionAuthority,...ports});
 const server=createServer(async(req,res)=>{
  try{const handled=await api(req,res,new URL(req.url,'http://127.0.0.1'));
   if(!handled){res.writeHead(404);res.end('{}')}
  }catch{res.writeHead(503);res.end('{}')}
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+server.address().port;
 return {sessionAuthority,async read(path,cookie=null){
  const r=await fetch(base+path,{headers:cookie?{Cookie:cookie}:{}});
  return {status:r.status,body:await r.json()}
 },cookie(){
  return sessionAuthority.issueNativeWebView(randomBytes(32).toString('hex')).cookie.split(';')[0]
 },close:()=>new Promise(ok=>server.close(ok))};
}
test('W46 existing four setup buttons have official read-only public steps without granting a user Session',async()=>{
 const f=await fixture();
 try{
  for(const [channel,{slug}] of Object.entries(CHANNEL_OWNER)){
   const r=await f.read('/api/v2/providers/'+slug+'/setup');
   assert.equal(r.status,200);
   assert.equal(r.body.canSend,false);
   assert.equal(r.body.nativeSessionRequiredForAccountConnection,true);
   assert.equal(parseChannelSetup(channel,r.body).nextAction,'OFFICIAL_SETUP_REQUIRED');
   assert.equal((await f.read('/api/v2/providers/'+slug+'/status')).status,401);
  }
 }finally{await f.close()}
});
test('actual-shape W26 official bridge diagnostics must remain WAITING_USER_AUTH, never ONLINE',async()=>{
 const f=await fixture({readW26Status:async()=>W26()});
 try{
  const a=await f.read('/api/v2/providers/fb-personal/status');
  assert.equal(a.status,200);
  assert.equal(a.body.status,'WAITING_USER_AUTH');
  assert.equal(a.body.authorizedByNativeOwner,false);
  assert.equal(a.body.sdkReportedOnly,true);
  assert.equal(parseChannelState('FB_PERSONAL',a.body).online,false);
  assert.equal(a.body.canSend,false);
  assert.ok(!JSON.stringify(a.body).includes('access_token'));
 }finally{await f.close()}
});
test('W26 copied/malicious ONLINE claim never becomes authorized account status',async()=>{
 for(const altered of [
  {...W26(),accountIdentityVerified:true,realAccountState:'ONLINE_VERIFIED'},
  {...W26(),binaryIntegrity:'SIMULATED'},
  {...W26(),source:'FAKE_PROVIDER'},
  {...W26(),canSend:true}
 ]){
  const f=await fixture({readW26Status:async()=>altered});
  try{assert.equal((await f.read('/api/v2/providers/fb-personal/status')).status,503)}
  finally{await f.close()}
 }
});
test('W24 and actual SDK jointly decide ONLINE; bridge state alone never grants it',async()=>{
 const profile={verified:true,source:'W54_NATIVE_CURRENT_USER',
  principalRef:'W54_REAL_TEST_0000001',installationRef:'W54_INSTALL_TEST_0000001',
  revocationGeneration:3};
 let allowed=false;
 const f=await fixture({
  resolveW54Principal:async()=>profile,
  readSdkOwnerStatus:async()=>({status:'ONLINE_VERIFIED',
   authorizedByNativeOwner:true,accountIdentityVerified:true}),
  authorizeW24Account:async()=>allowed
 });
 try{
  const cookie=f.cookie();
  const route='/api/v2/providers/whatsapp-personal/status';
  const blocked=await f.read(route,cookie);
  assert.equal(blocked.status,200);assert.equal(blocked.body.status,'WAITING_USER_AUTH');
  allowed=true;
  const valid=await f.read(route,cookie);
  assert.equal(valid.status,200);assert.equal(valid.body.status,'ONLINE_VERIFIED');
  assert.equal(parseChannelState('WHATSAPP_PERSONAL',valid.body).online,true);
  f.sessionAuthority.revokeAll();
  assert.equal((await f.read(route,cookie)).status,401);
 }finally{await f.close()}
});
test('W54 owner epoch changes after provider request: reject stale ONLINE',async()=>{
 let generation=3;
 const f=await fixture({
  resolveW54Principal:async()=>({verified:true,source:'W54_NATIVE_CURRENT_USER',
   principalRef:'W54_REAL_TEST_0000001',installationRef:'W54_INSTALL_TEST_0000001',
   revocationGeneration:generation}),
  readSdkOwnerStatus:async()=>({status:'ONLINE_VERIFIED',
   authorizedByNativeOwner:true,accountIdentityVerified:true}),
  authorizeW24Account:async()=>{generation++;return true}
 });
 try{assert.equal((await f.read('/api/v2/providers/telegram-personal/status',f.cookie())).status,409)}
 finally{await f.close()}
});
test('SDK installed is not enough: missing W24 or W54 first-party session fails closed',async()=>{
 const f=await fixture({readW26Status:async()=>W26()});
 try{
  const cookie=f.cookie();
  const a=await f.read('/api/v2/providers/fb-personal/status',cookie);
  assert.equal(a.status,200);assert.equal(a.body.status,'WAITING_USER_AUTH');
  assert.equal((await f.read('/api/v2/providers/telegram-personal/status',cookie)).status,503);
  assert.equal((await f.read('/api/v2/providers/fb-personal/claim',cookie)).status,404);
  assert.equal((await f.read('/api/v2/providers/../../api/v2/send',cookie)).status,404);
 }finally{await f.close()}
});
test('unknown W26 diagnostic local port rejected, no arbitrary host/protocol',()=>{
 for(const x of ['https://evil.example','0','80','65536','0000','29321/foo']){
  assert.throws(()=>makeW26DiagnosticPort(x));
 }
 assert.equal(makeW26DiagnosticPort(null),null);
});

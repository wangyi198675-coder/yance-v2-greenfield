import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createLocalSessionAuthority} from './local-session.mjs';
import {createW47WebMediaHttp} from './w47-w23-media-bridge.mjs';
import {createW47NativeSettingsCatalog} from './w47-native-settings-capabilities.mjs';
import {PersistentMediaAssets} from '../src/domains/file-attachment/web-media.mjs';
const original='http://127.0.0.1:49919';
const make=async()=>{
 const authority=createLocalSessionAuthority();
 const credential=authority.issueNativeWebView('f'.repeat(64));
 const cookie=credential.cookie.split(';')[0];
 const media=createW47WebMediaHttp({sessionAuthority:authority,webOrigin:original});
 const settings=createW47NativeSettingsCatalog({sessionAuthority:authority,webOrigin:original});
 const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,original);
   const handled=await media(req,res,url)||await settings(req,res,url);
   if(!handled){res.writeHead(404);res.end()}
  }catch{if(!res.headersSent){res.writeHead(503);res.end()}}
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+server.address().port;
 return {authority,cookie,credential,base,close:()=>new Promise(ok=>server.close(ok))};
};
test('W47 W23 real MIME capabilities, unauthenticated 401, no protected account K => explicit media HOLD',{timeout:30000},async()=>{
 const h=await make();
 const get=async(path,{method='GET',cookie=h.cookie,origin=original,csrf=false,body=null}={})=>{
  const r=await fetch(h.base+path,{method,headers:{
   ...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{}),
   ...(csrf?{'x-yance-csrf':h.credential.csrf}:{}),
   ...(body?{'content-type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json()};
 };
 try{
  assert.equal((await get('/api/v2/media/capabilities',{cookie:null})).status,401);
  assert.equal((await get('/api/v2/media/capabilities',{origin:'http://cross.invalid'})).status,403);
  const capabilities=await get('/api/v2/media/capabilities');
  assert.equal(capabilities.status,200);
  assert.equal(capabilities.data.source,'W23_NATIVE_WEB_MEDIA');
  assert.equal(capabilities.data.authoritative,true);
  assert.equal(capabilities.data.currentAccountAuthorized,false);
  assert.equal(capabilities.data.attachment_store,'LOCAL_ENCRYPTED_AVAILABLE_WITH_AUTHORITY');
  assert.equal(capabilities.data.accessStatus,'REAL_ACCOUNT_MEDIA_UPLOAD_HOLD');
  assert.equal(capabilities.data.canUpload,false);
  assert.equal(capabilities.data.canSend,false);
  assert.equal(capabilities.data.accepted.length,8);
  assert.equal(capabilities.data.accepted.find(x=>x.mime==='image/png').max_bytes,8*1024*1024);
  assert.equal(capabilities.data.accepted.find(x=>x.mime==='video/mp4').max_bytes,48*1024*1024);
  assert.equal(capabilities.data.media_generation.tts,'PROVIDER_NOT_CONFIGURED');
  assert.equal(capabilities.data.libraryListing.available,false);
  const fakeK={tenant:'SYNTHETIC_TEST_ONLY',account:'fake-account',channel:'WHATSAPP_PERSONAL',peer_id:'fake-peer',binding_revision:'1'};
  assert.equal((await get('/api/v2/media/upload-sessions',{method:'POST',csrf:false,body:{k:fakeK}})).status,403);
  const prevented=await get('/api/v2/media/upload-sessions',{method:'POST',csrf:true,body:{k:fakeK}});
  assert.equal(prevented.status,503);
  assert.equal(prevented.data.error,'REAL_ACCOUNT_MEDIA_UPLOAD_HOLD');
  assert.equal((await get('/api/v2/media/00000000-0000-0000-0000-000000000001')).status,503);
  assert.equal((await get('/api/v2/media/00000000-0000-0000-0000-000000000001/content')).status,503);
  assert.equal((await get('/api/v2/media/00000000-0000-0000-0000-000000000001',{method:'DELETE',csrf:true})).status,503);
  assert.equal((await get('/api/v2/media/non-uuid')).status,404);
  assert.equal((await get('/api/v2/media/capabilities?ignored=true')).status,422);
  h.authority.revokeAll();
  assert.equal((await get('/api/v2/media/capabilities')).status,401);
  console.log('W47_W23_NO_TRUE_OWNER_MEDIA_HOLD '+JSON.stringify({originalW23Types:8,realK:false,durableW55Key:false,userUpload:false,providerTts:'PROVIDER_NOT_CONFIGURED',userSends:0}));
 }finally{await h.close()}
});
test('nine original settings endpoint contracts are read-only truth, no shadow preferences',{timeout:30000},async()=>{
 const h=await make();
 try{
  const send=async(path,{method='GET',cookie=h.cookie,origin=original}={})=>{
   const r=await fetch(h.base+path,{method,headers:{
    ...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{})}});
   return {status:r.status,data:await r.json()};
  };
  assert.equal((await send('/api/v2/settings/capabilities',{cookie:null})).status,401);
  assert.equal((await send('/api/v2/settings/capabilities',{origin:'http://evil.invalid'})).status,403);
  const all=await send('/api/v2/settings/capabilities');
  assert.equal(all.status,200);
  assert.equal(all.data.authoritative,true);
  assert.equal(all.data.noSyntheticWrites,true);
  assert.deepEqual(all.data.categories.map(x=>x.id),
   ['general','accounts','model','translation','media','theme','notify','privacy','diagnostics']);
  const model=all.data.categories.find(x=>x.id==='model');
  assert.equal(model.write.find(x=>x.path.endsWith('/model-selection')).method,'POST');
  assert.equal(model.read.find(x=>x.path.endsWith('/model-config')).scope,'CURRENT_PRIVATE_SESSION');
  const theme=all.data.categories.find(x=>x.id==='theme');
  assert.equal(theme.persistedWrite,false);
  assert.equal(theme.write.length,0);
  const notify=all.data.categories.find(x=>x.id==='notify');
  assert.equal(notify.persistedWrite,false);
  const media=await send('/api/v2/settings/media');
  assert.equal(media.status,200);
  assert.equal(media.data.categories[0].status,'REAL_ACCOUNT_MEDIA_UPLOAD_HOLD');
  assert.equal((await send('/api/v2/settings/media',{method:'POST'})).status,405);
  assert.equal((await send('/api/v2/settings/unknown')).status,404);
  h.authority.revokeAll();
  assert.equal((await send('/api/v2/settings/capabilities')).status,401);
  console.log('W47_ORIGINAL_NINE_SETTINGS_CONTRACT_NO_FAKE_PERSISTENCE_PASS');
 }finally{await h.close()}
});
test('without complete W23+W24/W44 trusted media ports fail to start and never accept partial media custody',()=>{
 assert.throws(()=>createW47WebMediaHttp({
  sessionAuthority:{sessionFor:()=>null},webOrigin:original,
  resolveAuthorizedMediaScope:async()=>({k:'fake'})}),/W23_W24_W44_W55_ALL_PORTS_REQUIRED/);
 assert.throws(()=>createW47WebMediaHttp({
  sessionAuthority:{sessionFor:()=>null},webOrigin:original,
  mediaService:{open:()=>{}}}),/W23_ORIGINAL_ENCRYPTED_STORE_REQUIRED/);
 assert.equal(typeof PersistentMediaAssets,'function');
});

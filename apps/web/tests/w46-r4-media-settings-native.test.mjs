import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createW23BrowserMediaClient,isAcceptedFile,mediaCapabilitiesRead,verifyMediaAuthority} from '../src/w23-media-browser-consumer.mjs';
const src=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const shell=src('BCProductWorkspaceCandidate.vue'),media=src('BCMediaWorkspace.vue'),settings=src('BCSettingsWorkspace.vue');
const composer=src('BCNativeComposer.vue'),chat=src('BCLiveChatWorkspace.vue');
const scopes={source:'W47_SIGNED_W23_MEDIA_AUTHORITY',authoritative:true,canSend:false,
 actor:'synthetic-owner-for-test',k:{tenant:'t',account:'a',channel:'FB_PERSONAL',peer_id:'p',binding_revision:'1'},
 grant_id:'synthetic-grant-for-test',consent_id:'synthetic-consent-for-test',csrf:'a'.repeat(64),expires_at:Date.now()+120000};
const id='12345678-1234-4234-8234-123456789abc';
const metadata=(size,name,type)=>({asset_id:id,original_name:name,byte_size:size,mime:type,
 kind:'image',status:'READY',sha256:'real-server-sha',k:scopes.k});

test('R4 MEDIA is a real library, original preview and W23 native capability; never generic blank or fake gallery',()=>{
 assert.match(shell,/<BCMediaWorkspace v-else-if="activeWorkspace==='MEDIA'"/);
 assert.match(media,/data-test="w46-media-library"/);
 assert.match(media,/data-test="w46-media-preview"/);
 assert.match(media,/data-test="w46-media-capabilities"/);
 assert.match(media,/W23当前没有已签署的账号范围媒体列表分页/);
 assert.match(media,/media-filter-'\+f.id/);
 assert.match(media,/port.value.uploadFile\(file/);
 assert.match(media,/port.value.binary\(item.asset_id\)/);
 assert.match(media,/port.value.remove\(id\)/);
});
test('R4 SETTINGS nine unique original categories render separate real panels and reuse existing native components',()=>{
 const categories=['general','accounts','model','translate','media','theme','notify','privacy','diagnostics'];
 assert.match(shell,/<BCSettingsWorkspace v-else-if="activeWorkspace==='SETTINGS'"/);
 for(const k of categories)assert.ok(settings.includes('settings-panel-'+k),k);
 for(const n of ['BCChannelAccountSetup','BCNativeCloudKeySettings','BCLocalSessionConnector','BCNativeHostSession'])
  assert.ok(settings.includes('<'+n),n);
 assert.match(settings,/\/api\/v2\/translations/);
 assert.match(settings,/\/api\/v2\/local-session\/status/);
 assert.match(settings,/data-test="settings-cycle-theme"/);
 assert.match(settings,/data-test="settings-toggle-appearance"/);
 assert.match(settings,/Notification.requestPermission\(\)/);
 assert.doesNotMatch(settings,/localStorage\.setItem|fakeSave|mockSuccess/);
});
test('existing CONTACT composer alone forwards real File/Blob bytes, never name/size as W23 upload payload',()=>{
 assert.match(chat,/<BCNativeComposer ref="composerRef"/);
 assert.match(chat,/:media-authority-port="mediaAuthorityPort"/);
 assert.match(composer,/createComposerBridge/);
 assert.match(composer,/Array.from\(raw\|\|\[\]\)/);
 assert.match(composer,/mediaClient.value.uploadFile\(file/);
 assert.match(composer,/W23二进制附件接口与W47当前身份授权尚未接通/);
 assert.doesNotMatch(composer,/function filesOf\(list\)/);
 assert.match(composer,/<Button disabled size="sm">发送不可用<\/Button>/);
});
test('W23 requires verified signed current K, grant, consent, csrf; rejects unauthorized and invalid media',()=>{
 assert.throws(()=>verifyMediaAuthority(null),/W23_VERIFIED_CONTACT_SCOPE_REQUIRED/);
 assert.throws(()=>verifyMediaAuthority({...scopes,grant_id:''}),/W23_VERIFIED_CONTACT_SCOPE_REQUIRED/);
 const f=new File([new Uint8Array(16)],'image.png',{type:'image/png'});
 assert.equal(isAcceptedFile(f),true);
 assert.equal(isAcceptedFile(new File([new Uint8Array(2)],'a.png',{type:'image/png'})),false);
 assert.equal(isAcceptedFile(new File([new Uint8Array(16)],'bad.exe',{type:'application/octet-stream'})),false);
});
test('real browser port sends exact File bytes via PUT, then GET verified metadata and binary, then DELETE followed by GET denial',async()=>{
 const f=new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82])],'test.png',{type:'image/png'});
 const calls=[];let deleted=false;
 const fetchImpl=async(url,opts={})=>{
  calls.push({url,method:opts.method||'GET',body:opts.body});
  if(url.endsWith('/upload-sessions'))return Response.json({asset_id:id,status:'RESERVED',expires_at:Date.now()+20000},{status:201});
  if(url.endsWith('/content')&&opts.method==='PUT'){
   assert.ok(opts.body instanceof File,'browser must send original File bytes');
   assert.deepEqual(new Uint8Array(await opts.body.arrayBuffer()),new Uint8Array(await f.arrayBuffer()));
   assert.equal(opts.headers['content-type'],'image/png');
   return Response.json(metadata(f.size,f.name,f.type));
  }
  if(url.endsWith('/content'))return new Response(f,{status:200,headers:{'content-type':f.type}});
  if(opts.method==='DELETE'){deleted=true;return Response.json({asset_id:id,status:'REVOKED'})}
  if(url.endsWith('/'+id))return deleted?Response.json({error:'ACCESS_DENIED'},{status:403}):Response.json(metadata(f.size,f.name,f.type));
  throw Error('UNEXPECTED_ROUTE');
 };
 const port=createW23BrowserMediaClient({fetchImpl,scopePort:{currentScope:async()=>scopes}});
 const up=await port.uploadFile(f);assert.equal(up.status,'READY');
 const blob=await port.binary(up.asset_id);assert.equal(blob.bytes.size,f.size);
 const del=await port.remove(id);assert.equal(del.status,'REVOKED');
 assert.deepEqual(calls.map(x=>x.method),['POST','PUT','GET','GET','GET','DELETE','GET']);
});
test('non-2xx HTTP and false upload receipts never report W23 success',async()=>{
 for(const status of [401,403,409,503]){
  const client=createW23BrowserMediaClient({
   fetchImpl:async()=>Response.json({error:'AUTH_HOLD'},{status}),
   scopePort:{currentScope:async()=>scopes}
  });
  await assert.rejects(()=>client.metadata(id),new RegExp('W23_HTTP_'+status));
 }
 await assert.rejects(()=>mediaCapabilitiesRead(async()=>Response.json({fake:true})),/W23_CAPABILITIES_NOT_VERIFIED/);
});

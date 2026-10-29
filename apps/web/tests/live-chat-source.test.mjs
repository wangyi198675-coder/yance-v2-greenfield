import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLiveContacts,validateNativeTimeline,readLiveContacts,readLiveTimeline}
 from '../src/live-chat-source.mjs';
import {fullK} from '../src/composer-bridge.mjs';
const health={ok:true,service:'Yance V2 local API',runtimeSha:'W47_NATIVE_SOURCE_PIN',
 trustedSession:true,canSend:false};
const k={tenant:'nativeTenant001',account:'nativeAccount001',
 channel:'WHATSAPP_PERSONAL',peer_id:'wd_user_01333',binding_revision:4};
const c={accountRef:'W28_REAL_ACCOUNT_0001',channel:'WHATSAPP_PERSONAL',
 peerRef:'wd_user_01333',bindingRevision:4,displayName:'Verified upstream contact',
 identity:k,identityKey:fullK(k)};
const signed={ok:true,authoritative:true,canSend:false,
 source:'W24_CURRENT_K_AND_NATIVE_CHANNEL_OWNERS',
 connectedAccountCount:1,contacts:[c]};
test('consume actual W47 signed Issue61 accountRef/peerRef contact list, not fake K',()=>{
 const r=validateLiveContacts(health,signed);
 assert.equal(r.realContacts,1);assert.equal(r.contacts[0].peerRef,c.peerRef);
 assert.equal(r.contacts[0].contactRef,'W28_REAL_ACCOUNT_0001|WHATSAPP_PERSONAL|wd_user_01333|4');
 assert.deepEqual(r.contacts[0].identity,k);
 assert.equal(r.contacts[0].identityKey,fullK(k));
 assert.equal(r.contacts[0].unread,null);
 assert.equal(r.canSend,false);
});
test('read actual W47 same-origin GET only; no caller Actor or message send',async()=>{
 const logs=[];
 const r=await readLiveContacts({fetchImpl:async(url,init)=>{
  logs.push({url,init});
  return {ok:true,json:async()=>url.endsWith('/health')?health:signed};
 }});
 assert.equal(r.connectedAccountCount,1);
 assert.deepEqual(logs.map(x=>x.url),['/api/v2/runtime/health','/api/v2/contacts']);
 assert.ok(logs.every(x=>x.init.method==='GET'&&x.init.credentials==='same-origin'&&x.init.cache==='no-store'));
});
test('without W54 native session real W47 401 is NOT 0 connected authority',async()=>{
 let n=0;
 await assert.rejects(()=>readLiveContacts({fetchImpl:async()=>{
  n++;return n===1?{ok:true,json:async()=>({...health,trustedSession:false})}:
   {ok:false,status:401};
 }}),/NATIVE_HTTP_401/);
});
test('W47 contacts refuse duplicates, unknown account, tampered K, forged send and unauthenticated',()=>{
 for(const v of [
  {...signed,source:'MOCK_PROVIDER'},
  {...signed,contacts:[c,c]},
  {...signed,contacts:[{...c,accountRef:'fixture-account-1'}]},
  {...signed,contacts:[{...c,identityKey:'SYNTHETIC'}]},
  {...signed,contacts:[{...c,identity:null}]},
  {...signed,contacts:[{...c,identity:{...k,tenant:'SYNTHETIC_TEST_ONLY'}}]},
  {...signed,contacts:[{...c,identity:{...k,peer_id:'not-my-peer'}}]},
  {...signed,contacts:[{...c,tenant:'SYNTHETIC_TEST_ONLY'}]},
  {...signed,contacts:[{...c,bindingRevision:-1}]},
  {...signed,contacts:[{...c,channel:'UNSUPPORTED'}]},
  {...signed,connectedAccountCount:0},
  {...signed,canSend:true}
 ])assert.throws(()=>validateLiveContacts(health,v));
 assert.throws(()=>validateLiveContacts({...health,trustedSession:false},signed));
});
test('verified W24 full K flows contact to W25 timeline GET and original Composer selector',async()=>{
 const selected=validateLiveContacts(health,signed).contacts[0];
 let url=null;
 const result=await readLiveTimeline({contact:selected,fetchImpl:async(path,opts)=>{
  url=path;
  assert.equal(opts.method,'GET');
  return {ok:true,json:async()=>({
   ok:true,authoritative:true,canSend:false,
   identityKey:fullK(k),messages:[{
    identityKey:fullK(k),mid:'real_mid_0001',
    original:'Hello',direction:'INBOUND',providerSource:'baileys'}]
  })};
 }});
 assert.equal(url,'/api/v2/messages?identityKey='+encodeURIComponent(fullK(k)));
 assert.equal(result.messages[0].mid,'real_mid_0001');
 assert.throws(()=>validateNativeTimeline({ok:true,authoritative:true,
  canSend:false,identityKey:'pretend',messages:[]},selected));
 await assert.rejects(()=>readLiveTimeline({contact:{...selected,identityKey:null},
  fetchImpl:async()=>{throw Error('NO_HTTP')}}),/W24_FULL_K_NOT_SIGNED/);
});
test('later signed full W24 K still checks exact MID, source and translation Run',()=>{
 const identity={tenant:'real-native',account:'native_account_008',
  channel:'TELEGRAM_PERSONAL',peer_id:'native_peer_122',binding_revision:2};
 const identityKey=fullK(identity), selected={identity,identityKey};
 const m={identityKey,mid:'native_mid_001',original:'Hello',
  direction:'INBOUND',providerSource:'TDLIB_JSON_NATIVE'};
 const base={ok:true,authoritative:true,canSend:false,identityKey,messages:[m]};
 assert.equal(validateNativeTimeline(base,selected).messages[0].original,'Hello');
 for(const x of [
  {...base,messages:[m,m]},
  {...base,messages:[{...m,mid:''}]},
  {...base,messages:[{...m,identityKey:'OTHER'}]},
  {...base,messages:[{...m,translation:{
    zh:'not attested',runId:'run_001',sourceMid:'wrong',identityKey,qualityQualified:false}}]}
 ])assert.throws(()=>validateNativeTimeline(x,selected));
});

test('actual official Matrix read-only inbox has real rooms, no W24 identity or send',async()=>{
 const {validateFacebookReadOnlyInbox}=await import('../src/live-chat-source.mjs');
 const room='!realfbroomabcdefgh12345';
 const dto={ok:true,source:'OFFICIAL_MAUTRIX_META_MATRIX_READ_ONLY',
  connectedAccountCount:1,providerPeerBindingPending:true,canSend:false,
  contacts:[{roomId:room,channel:'FB_PERSONAL',displayName:'Actual Matrix display name',
   nativePeerVerified:false,readOnly:true,canSend:false}]};
 const result=validateFacebookReadOnlyInbox(dto);
 assert.equal(result.connectedAccountCount,1);
 assert.equal(result.contacts[0].roomId,room);
 assert.equal(result.contacts[0].identityKey,null);
 assert.equal(result.contacts[0].canSend,false);
 assert.throws(()=>validateFacebookReadOnlyInbox({...dto,canSend:true}));
 assert.throws(()=>validateFacebookReadOnlyInbox({...dto,contacts:[...dto.contacts,...dto.contacts]}));
});

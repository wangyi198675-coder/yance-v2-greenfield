import test from 'node:test';
import assert from 'node:assert/strict';
import {readLiveContacts,readLiveTimeline,validateLiveContacts,validateNativeTimeline}
 from '../src/live-chat-source.mjs';
import {createComposerBridge,fullK} from '../src/composer-bridge.mjs';
const contact={tenant:'private-current',account:'acct-current-01',channel:'TELEGRAM_PERSONAL',
 peer_id:'peer-native-1234',binding_revision:4};
const k=fullK(contact);
const health={ok:true,runtimeSha:'w47-native-read',trustedSession:true,canSend:false};
const publicContact={...contact,identityKey:k,accountAuthorized:true,displayName:'Signed account contact',unread:2};
const contacts={ok:true,authoritative:true,connectedAccountCount:1,canSend:false,
 source:'VERIFIED_NATIVE_CONNECTOR',contacts:[publicContact]};
const context={identity:contact,identityKey:k};
test('W47 read-only current installed service yields actual safe 0 when unpaired',async()=>{
 const rows=await readLiveContacts({fetchImpl:async(path,init)=>{
  assert.equal(init.method,'GET');assert.equal(init.credentials,'same-origin');
  assert.equal(init.cache,'no-store');
  if(path==='/api/v2/runtime/health')return {ok:true,json:async()=>({...health,trustedSession:false})};
  if(path==='/api/v2/contacts')return {ok:true,json:async()=>({...contacts,contacts:[],connectedAccountCount:0})};
  throw Error(path);
 }});
 assert.equal(rows.realContacts,0);assert.equal(rows.trustedSession,false);
});
test('authoritative actual owner signed CONTACT K can be selected without POST takeover',()=>{
 const verified=validateLiveContacts(health,contacts);
 assert.equal(verified.contacts.length,1);
 const bridge=createComposerBridge();const item=verified.contacts[0];
 assert.equal(bridge.choose(item.identity).key,k);
 assert.equal(bridge.view().canSend,false);
});
test('never accept synthetic, untrusted session, identity swapping or duplicate real K',()=>{
 for(const broken of [
  {...contacts,contacts:[{...publicContact,account:'fixture-a'}]},
  {...contacts,contacts:[{...publicContact,tenant:'SYNTHETIC_TEST_ONLY'}]},
  {...contacts,contacts:[publicContact,publicContact]},
  {...contacts,contacts:[{...publicContact,identityKey:'wrong'}]},
  {...contacts,contacts:[{...publicContact,accountAuthorized:false}]}
 ])assert.throws(()=>validateLiveContacts(health,broken));
 assert.throws(()=>validateLiveContacts({...health,trustedSession:false},contacts));
 assert.throws(()=>validateLiveContacts({...health,canSend:true},contacts));
});
test('real native timeline has verified K/MID/translation source, no fabricated candidates',async()=>{
 const source={ok:true,authoritative:true,canSend:false,identityKey:k,
  messages:[{identityKey:k,mid:'provider-mid-001',original:'Hello',direction:'INBOUND',
    providerSource:'TELEGRAM_TDLIB_NATIVE',translation:{identityKey:k,sourceMid:'provider-mid-001',zh:'你好',
     runId:'run-test-source',qualityQualified:false}}]};
 const seen=[];
 const rows=await readLiveTimeline({contact:context,fetchImpl:async(path,init)=>{
  seen.push(path);assert.equal(init.method,'GET');
  return {ok:true,json:async()=>source};
 }});
 assert.equal(rows.messages[0].mid,'provider-mid-001');
 assert.equal(rows.messages[0].zh,'你好');
 assert.equal(rows.messages[0].translationRunId,'run-test-source');
 assert.equal(rows.messages[0].canSend,false);
 assert.equal(seen.length,1);assert.match(seen[0],/identityKey=/);
});
test('real-native messages reject K confusion, forged MID, translation mismatch',()=>{
 const m={identityKey:k,mid:'MID001',original:'hi',direction:'INBOUND',
  providerSource:'NATIVE_EVENT_SOURCE'};
 const source={ok:true,authoritative:true,canSend:false,identityKey:k,messages:[m]};
 assert.equal(validateNativeTimeline(source,context).messages.length,1);
 for(const bad of [
  {...source,identityKey:'wrong'},
  {...source,messages:[m,m]},
  {...source,messages:[{...m,identityKey:'wrong'}]},
  {...source,messages:[{...m,mid:''}]},
  {...source,messages:[{...m,providerSource:''}]},
  {...source,messages:[{...m,translation:{zh:'fake',sourceMid:'wrong',identityKey:k,
    runId:'run123',qualityQualified:false}}]}
 ])assert.throws(()=>validateNativeTimeline(bad,context));
});
test('live source never uses outgoing transport or platform sdk from browser',async()=>{
 let post=0;
 await readLiveContacts({fetchImpl:async(path,init)=>{
  if(init.method!=='GET')post++;
  return {ok:true,json:async()=>path.includes('/contacts')?{...contacts,contacts:[],connectedAccountCount:0}:{...health,trustedSession:false}};
 }});
 assert.equal(post,0);
});

import {createTrustedTakeoverPort} from '../src/native-takeover-port.mjs';
test('real W47 session missing: GET/POST fail closed before W24 access',async()=>{
 const calls=[],port=createTrustedTakeoverPort({fetchImpl:async(url,init)=>{
  calls.push({url,method:init.method});
  return {ok:true,json:async()=>({ok:true,paired:false,canSend:false,providerAuthorized:false})};
 }});
 await assert.rejects(port.get(contact),/TRUSTED_W47_SESSION_REQUIRED/);
 await assert.rejects(port.post(contact,{}),/TRUSTED_W47_SESSION_REQUIRED/);
 assert.deepEqual(calls.map(c=>c.url),
  ['/api/v2/local-session/status','/api/v2/local-session/status']);
});
test('real trusted W47 session confirms GET and signed 4-field W24 POST, no JS Actor',async()=>{
 const logs=[];
 const session={ok:true,paired:true,canSend:false,providerAuthorized:false,
  expiresAt:Date.now()+200000,csrfToken:'a'.repeat(64)};
 const port=createTrustedTakeoverPort({fetchImpl:async(url,init)=>{
  logs.push({url,init});
  if(url==='/api/v2/local-session/status')return {ok:true,json:async()=>session};
  if(url.startsWith('/api/v2/identity-consent/takeover-state?'))
   return {ok:true,json:async()=>({identityKey:k,mode:'AUTO',canSend:false})};
  if(url==='/api/v2/identity-consent/takeover')return {ok:true,json:async()=>({accepted:true})};
  throw Error('unknown path '+url);
 }});
 assert.equal((await port.get(contact)).mode,'AUTO');
 await port.post(contact,{
  expectedIdentityKey:k,expectedEpoch:1,expectedAccountRevocationEpoch:0,
  expectedConsentEpoch:1,action:'TYPE',intent:'TAKEOVER_HUMAN_COMPOSER'});
 const posted=logs.find(x=>x.init.method==='POST');
 assert.equal(posted.init.credentials,'same-origin');
 assert.equal(posted.init.headers['x-yance-csrf'],'a'.repeat(64));
 assert.equal(JSON.parse(posted.init.body).identity.peer_id,contact.peer_id);
 assert.equal(logs.filter(c=>c.url.includes('takeover')).length,2);
});
test('real W47 trusted port rejects synthetic K, missing CAS, HTTP 409 and expired local token',async()=>{
 let called=0;
 const good={ok:true,paired:true,canSend:false,providerAuthorized:false,
  csrfToken:'c'.repeat(64),expiresAt:Date.now()+120000};
 const p=createTrustedTakeoverPort({fetchImpl:async(url)=>{
  called++;
  if(url.endsWith('/status'))return {ok:true,json:async()=>good};
  return {ok:false,status:409};
 }});
 await assert.rejects(p.get({...contact,tenant:'SYNTHETIC_TEST_ONLY'}),/REAL_TAKEOVER_REJECTS_FIXTURE_K/);
 assert.equal(called,0);
 await assert.rejects(p.post(contact,{expectedIdentityKey:k}),/TRUSTED_TAKEOVER_CAS_MISSING/);
 await assert.rejects(p.get(contact),/TRUSTED_TAKEOVER_HTTP_409/);
 const expire=createTrustedTakeoverPort({fetchImpl:async()=>({ok:true,json:async()=>({...good,expiresAt:Date.now()-10})})});
 await assert.rejects(expire.get(contact),/TRUSTED_W47_SESSION_REQUIRED/);
});

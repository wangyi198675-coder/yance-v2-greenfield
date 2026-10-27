import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {createLocalSessionAuthority} from './local-session.mjs';
import {createNativeOwnerReadHttp} from './native-authoritative-reads.mjs';
const origin='http://127.0.0.1:49628';
const fixture=async(ports={})=>{
 const authority=createLocalSessionAuthority({approveNativeLaunch:async()=>true,nativeTtlMs:120000});
 const handler=createNativeOwnerReadHttp({sessionAuthority:authority,webOrigin:origin,...ports});
 const server=createServer(async(req,res)=>handler(req,res,new URL(req.url,'http://127.0.0.1')));
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const root='http://127.0.0.1:'+server.address().port;
 const query=async(cookie,site=origin,path='/api/v2/contacts')=>{
  const r=await fetch(root+path,{headers:{
   ...(cookie?{Cookie:cookie}:{}),Origin:site
  }});
  return {status:r.status,value:await r.json()};
 };
 const issue=async()=>{
  const a=await authority.beginTrustedFirstParty({});
  return 'yance_local_session='+a.id;
 };
 return {authority,query,issue,close:()=>new Promise(ok=>server.close(ok))}
};
const principal={source:'W54_NATIVE_CURRENT_USER',verified:true,
 principalRef:'W54_NATIVE_TEST_1234567',installationRef:'W54_INSTALL_TEST_1234567',
 revocationGeneration:2};
const account={accountRef:'W28_SIGNED_ACC_0001',channel:'WHATSAPP_PERSONAL',
 authorization:'ONLINE_VERIFIED',ownerPrincipalRef:principal.principalRef,
 tenant:'real_native_tenant_001',accountId:'nativeAccount001'};
const contact={accountRef:account.accountRef,channel:account.channel,peerRef:'wd_chat_01234',
 bindingRevision:3,displayName:'TEST_ONLY_NO_REAL_ACCOUNT',
 identity:{tenant:account.tenant,account:account.accountId,channel:account.channel,
  peer_id:'wd_chat_01234',binding_revision:3},
 identityKey:[account.tenant,account.accountId,account.channel,'wd_chat_01234',3].join('|'),
 w24CurrentKVerified:true,w24ConsentCurrent:true};
test('unpaired browser cannot read identity data and no actual signed provider gives 503',async()=>{
 const x=await fixture();
 try{
  assert.equal((await x.query()).status,401);
  const signed=await x.issue();
  assert.equal((await x.query(signed)).status,503);
  assert.equal((await x.query(signed,'https://cross-site.example')).status,403);
  assert.equal((await x.query('yance_local_session='+randomBytes(32).toString('hex'))).status,401);
 }finally{await x.close()}
});
test('test-only injected W24 native current K / actual provider port, never plaintext tokens',async()=>{
 const x=await fixture({
  resolveW54CurrentUser:async()=>principal,
  readW24AuthorizedAccounts:async()=>[account],
  readW24VerifiedContacts:async()=>[contact]
 });
 try{
  const signed=await x.issue(),r=await x.query(signed);
  assert.equal(r.status,200);
  assert.equal(r.value.source,'W24_CURRENT_K_AND_NATIVE_CHANNEL_OWNERS');
  assert.equal(r.value.connectedAccountCount,1);
  assert.equal(r.value.contacts[0].peerRef,contact.peerRef);
  assert.deepEqual(r.value.contacts[0].identity,contact.identity);
  assert.equal(r.value.contacts[0].identityKey,contact.identityKey);
  assert.equal(r.value.contacts[0].w24CurrentKVerified,undefined);
  assert.equal(r.value.canSend,false);
  x.authority.revokeAll();
  assert.equal((await x.query(signed)).status,401);
 }finally{await x.close()}
});
test('native owner ports reject unknown K, wrong user, fake ONLINE and revocation mid-flight',async()=>{
 for(const changed of [
  {readW24AuthorizedAccounts:async()=>[{...account,authorization:'SYNTHETIC_ONLINE'}]},
  {readW24AuthorizedAccounts:async()=>[{...account,ownerPrincipalRef:'WRONG_USER_X'}]},
  {readW24VerifiedContacts:async()=>[{...contact,w24ConsentCurrent:false}]},
  {readW24VerifiedContacts:async()=>[{...contact,identityKey:'INJECTED_WRONG_K'}]},
  {readW24VerifiedContacts:async()=>[{...contact,identity:{...contact.identity,account:'OTHER_ACCOUNT'}}]},
  {readW24VerifiedContacts:async()=>[{...contact,accountRef:'FOREIGN_ACCOUNT_9999'}]}
 ]){
  const x=await fixture({
   resolveW54CurrentUser:async()=>principal,
   readW24AuthorizedAccounts:async()=>[account],
   readW24VerifiedContacts:async()=>[contact],...changed
  });
  try{assert.equal((await x.query(await x.issue())).status,503)}
  finally{await x.close()}
 }
 let change=false;
 const y=await fixture({
  resolveW54CurrentUser:async()=>({...principal,revocationGeneration:change?3:2}),
  readW24AuthorizedAccounts:async()=>[account],
  readW24VerifiedContacts:async()=>{change=true;return [contact]}
 });
 try{assert.equal((await y.query(await y.issue())).status,409)}
 finally{await y.close()}
});

test('same native W24 authorized contacts support real search/platform filter; unknown inbox state is unavailable',async()=>{
 const x=await fixture({
  resolveW54CurrentUser:async()=>principal,
  readW24AuthorizedAccounts:async()=>[account],
  readW24VerifiedContacts:async()=>[contact]
 });
 try{
  const cookie=await x.issue();
  const found=await x.query(cookie,origin,'/api/v2/contacts?search=ONLY&channel=WHATSAPP_PERSONAL');
  assert.equal(found.status,200);
  assert.equal(found.value.contacts.length,1);
  assert.equal(found.value.contacts[0].identityKey,contact.identityKey);
  assert.equal(found.value.unreadCount,null);
  assert.equal(found.value.unreadAuthoritative,false);
  assert.equal(found.value.filterSupport.unread,false);
  const noMatch=await x.query(cookie,origin,'/api/v2/contacts?search=ABSENT');
  assert.equal(noMatch.status,200);
  assert.equal(noMatch.value.contacts.length,0);
  assert.equal(noMatch.value.connectedAccountCount,1);
  for(const path of ['/api/v2/contacts?unread=true',
   '/api/v2/contacts?pinned=true','/api/v2/contacts?archived=false',
   '/api/v2/contacts?scope=messages&search=hello']){
   const r=await x.query(cookie,origin,path);
   assert.equal(r.status,503);
   assert.equal(r.value.error,'W25_PERSISTED_INBOX_FILTER_NOT_CONNECTED');
  }
  const malformed=await x.query(cookie,origin,'/api/v2/contacts?unexpected=true');
  assert.equal(malformed.status,422);
  assert.equal((await x.query(null,origin,'/api/v2/contacts?unread=true')).status,401);
 }finally{await x.close()}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openEligibilityStore} from './index.mjs';
const originalBinding={tenantId:'private-local-0001',
 accountId:'whatsapp-owner-0001',principalRef:'native-os-owner-0001',
 channel:'WHATSAPP_PERSONAL',bindingRevision:1,accountRevocationEpoch:0};
const self='12345678900@s.whatsapp.net';
const peer='441234567891@s.whatsapp.net';
function setup(path,extra={}){
 let active=true;
 const native=()=>openEligibilityStore({
  path,requireDurableIdentity:true,authorizeMutation:()=>false,
  officialWhatsAppOwner:{
   verifyCurrentOwner:async({binding})=>active&&binding.principalRef===originalBinding.principalRef,
   verifySdkSelf:async({selfJid})=>selfJid===self,
   verifySdkPeer:async({selfJid,remoteJid})=>selfJid===self&&remoteJid===peer,
   ...extra,
  },
 });
 return {native,revokeSession:()=>{active=false}};
}
test('W44 original identity_accounts/peers SAME SQLite persist genuine SDK self and peer after cold restart',async()=>{
 const root=mkdtempSync(join(tmpdir(),'w44-wa-native-')),path=join(root,'original-w44.db');
 try{
  const x=setup(path);
  const one=x.native();
  assert.equal(await one.nativeWhatsApp.readCurrent({binding:originalBinding}),null);
  const verified=await one.nativeWhatsApp.bindSdkSelf({binding:originalBinding,selfJid:self});
  assert.equal(verified.verified,true);
  assert.equal(verified.canSend,false);
  const contact=await one.nativeWhatsApp.bindSdkPeer({binding:originalBinding,
   selfJid:self,remoteJid:peer});
  assert.equal(contact.persisted,true);
  assert.equal(contact.k.binding_revision,1);
  assert.equal(contact.canSend,false);
  assert.equal((await one.nativeWhatsApp.list({binding:originalBinding})).contacts.length,1);
  one.close();
  const two=x.native();
  assert.equal((await two.nativeWhatsApp.readCurrent({binding:originalBinding})).verified,true);
  const after=await two.nativeWhatsApp.readPeer({binding:originalBinding,remoteJid:peer});
  assert.equal(after?.peer_id,peer);
  assert.equal((await two.nativeWhatsApp.bindSdkPeer({binding:originalBinding,
   selfJid:self,remoteJid:peer})).persisted,true);
  assert.equal((await two.nativeWhatsApp.list({binding:originalBinding})).contacts.length,1);
  two.close();
 }finally{rmSync(root,{recursive:true,force:true})}
});
test('W44 SDK proof, current owner and immutable self binding cannot be replaced by arbitrary browser data',async()=>{
 const root=mkdtempSync(join(tmpdir(),'w44-wa-native-')),path=join(root,'original-w44.db');
 const x=setup(path),store=x.native();
 try{
  await assert.rejects(store.nativeWhatsApp.bindSdkSelf({
   binding:originalBinding,selfJid:'0000000000@s.whatsapp.net'}),/W44_NATIVE_BAILEYS_SELF_NOT_VERIFIED/);
  await store.nativeWhatsApp.bindSdkSelf({binding:originalBinding,selfJid:self});
  await assert.rejects(store.nativeWhatsApp.bindSdkSelf({
   binding:originalBinding,selfJid:'0000000000@s.whatsapp.net'}),/W44_NATIVE_BAILEYS_SELF_NOT_VERIFIED/);
  await assert.rejects(store.nativeWhatsApp.bindSdkPeer({
   binding:originalBinding,selfJid:self,remoteJid:'2222222222@s.whatsapp.net'}),
   /W44_NATIVE_PEER_SOURCE_NOT_VERIFIED/);
  await assert.rejects(store.nativeWhatsApp.bindSdkPeer({binding:originalBinding,
   selfJid:self,remoteJid:self}),/W44_NATIVE_PEER_JID_INVALID/);
  await assert.rejects(store.nativeWhatsApp.bindSdkPeer({binding:{
   ...originalBinding,principalRef:'attacker-principal-0002'},selfJid:self,remoteJid:peer}),
   /W44_NATIVE_OWNER_SESSION_REVOKED/);
  x.revokeSession();
  await assert.rejects(store.nativeWhatsApp.readCurrent({binding:originalBinding}),
   /W44_NATIVE_OWNER_SESSION_REVOKED/);
 }finally{store.close();rmSync(root,{recursive:true,force:true})}
});
test('W44 original account revoke fences all peers/consents; expired binding cannot restore itself',async()=>{
 const root=mkdtempSync(join(tmpdir(),'w44-wa-native-')),path=join(root,'original-w44.db');
 const x=setup(path),store=x.native();
 try{
  await store.nativeWhatsApp.bindSdkSelf({binding:originalBinding,selfJid:self});
  await store.nativeWhatsApp.bindSdkPeer({binding:originalBinding,selfJid:self,remoteJid:peer});
  const result=await store.nativeWhatsApp.revoke({binding:originalBinding});
  assert.equal(result.revoked,true);
  assert.equal(await store.nativeWhatsApp.readCurrent({binding:originalBinding}),null);
  assert.equal(await store.nativeWhatsApp.readPeer({binding:originalBinding,remoteJid:peer}),null);
  await assert.rejects(store.nativeWhatsApp.bindSdkSelf({
   binding:originalBinding,selfJid:self}),/W44_WHATSAPP_ACCOUNT_CONFLICT_OR_REVOKED/);
  await assert.rejects(store.nativeWhatsApp.bindSdkPeer({
   binding:originalBinding,selfJid:self,remoteJid:peer}),/W44_REAL_ACCOUNT_NOT_CURRENT/);
  assert.equal((await store.nativeWhatsApp.list({binding:originalBinding})).contacts.length,0);
 }finally{store.close();rmSync(root,{recursive:true,force:true})}
});
test('W44 previous synthetic-only eligibility policy not widened by WhatsApp native read projection',async()=>{
 const root=mkdtempSync(join(tmpdir(),'w44-wa-native-')),path=join(root,'original-w44.db');
 const store=setup(path).native();
 try{
  const foreign={tenant:'private-local-0001',account:'whatsapp-owner-0001',
   channel:'WHATSAPP_PERSONAL',peer_id:peer,binding_revision:1};
  assert.throws(()=>store.readIdentityAuthority({actor:'native-os-owner-0001',identity:foreign}),
    /ONLY_SYNTHETIC_FULL_K/);
  assert.equal(store.nativeWhatsApp===null,false);
 }finally{store.close();rmSync(root,{recursive:true,force:true})}
});

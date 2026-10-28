import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openEligibilityStore} from '../src/domains/grant-custody-budget/index.mjs';
import {createW47WhatsAppW24Bridge} from './w47-whatsapp-w24-bridge.mjs';
const self='12345678900@s.whatsapp.net',peerJid='441234567891@s.whatsapp.net';
const nativeBoot={source:'W54_NATIVE_CURRENT_USER',verified:true,
 principalRef:'w54-native-signed-owner',
 installationRef:'w54-native-signed-installation'};
function instance(t,{enabled=true}={}){
 const root=mkdtempSync(join(tmpdir(),'w47-wa-w44-original-'));
 const owner={enabled},sdkOpen={yes:false};
 const sdkEvidence={
  verifySdkSelf:async({selfJid})=>sdkOpen.yes&&selfJid===self,
  verifySdkPeer:async({selfJid,remoteJid})=>sdkOpen.yes&&
   selfJid===self&&remoteJid===peerJid,
 };
 const store=openEligibilityStore({path:join(root,'same-W44.db'),
  requireDurableIdentity:true,authorizeMutation:()=>false,
  officialWhatsAppOwner:{
   verifyCurrentOwner:async()=>owner.enabled,
   verifySdkSelf:sdkEvidence.verifySdkSelf,
   verifySdkPeer:sdkEvidence.verifySdkPeer,
  }});
 t.after(()=>{store.close();rmSync(root,{recursive:true,force:true})});
 const w24=createW47WhatsAppW24Bridge({w44:store,nativeBoot,sdkEvidence,
  w54:{assertCurrentNativeUser:async()=>owner.enabled}});
 return {w24,owner,sdkOpen,store};
}
test('normal clicked initial W54 pairing requires actual SDK open before W44 account enrollment',async t=>{
 const {w24,sdkOpen}=instance(t);
 const permit=await w24.authorizeStart({userAction:'PAIR_OWN_ACCOUNT',
  accountLocator:'current-own-whatsapp'});
 assert.equal(permit.authorized,true);
 assert.equal(permit.accountVerified,false);
 assert.equal(permit.enrollmentApproved,true);
 assert.equal(permit.canSend,false);
 assert.equal(await w24.assertCurrent({binding:permit,phase:'PAIRING_QR'}),true);
 await assert.rejects(w24.identity.resolveAccount({
  binding:permit,selfJid:self}),/W24_REAL_BAILEYS_SELF_PROOF_REQUIRED/);
 sdkOpen.yes=true;
 const account=await w24.identity.resolveAccount({binding:permit,selfJid:self});
 assert.equal(account.account,permit.accountId);
 assert.equal(account.binding_revision,1);
 const saved=await w24.readCurrent();
 assert.equal(saved.verified,true);
 const contact=await w24.identity.bindObservedPeer({binding:permit,self:{jid:self},
  remoteJid:peerJid});
 assert.equal(contact.bound,true);
 assert.equal((await w24.listPeers()).contacts.length,1);
});
test('revoke original W44 account prevents old Signal/JID restart and late callbacks',async t=>{
 const {w24,sdkOpen}=instance(t);
 const permit=await w24.authorizeStart({userAction:'PAIR_OWN_ACCOUNT',
  accountLocator:'current-own-whatsapp'});
 sdkOpen.yes=true;
 await w24.identity.resolveAccount({binding:permit,selfJid:self});
 const res=await w24.revokeApprovedAccount({binding:permit});
 assert.equal(res.revoked,true);
 assert.equal(await w24.assertCurrent({binding:permit,phase:'POST_REVOKE'}),false);
 await assert.rejects(w24.identity.resolveAccount({binding:permit,selfJid:self}),
  /W54_CURRENT_SIGNED_USER_REQUIRED/);
 await assert.rejects(w24.authorizeStart({userAction:'PAIR_OWN_ACCOUNT',
  accountLocator:'current-own-whatsapp'}),/W54_CURRENT_SIGNED_USER_REQUIRED/);
});
test('W47 rejects user-provided JID, cross-install scopes and cancelled native owner session',async t=>{
 const {w24,sdkOpen,owner}=instance(t);
 await assert.rejects(w24.authorizeStart({userAction:'PAIR_OWN_ACCOUNT',
  accountLocator:'untrusted-phone-number'}),/W24_WHATSAPP_EXPLICIT_CONNECT_CLICK_REQUIRED/);
 const permit=await w24.authorizeStart({userAction:'PAIR_OWN_ACCOUNT',
  accountLocator:'current-own-whatsapp'});
 sdkOpen.yes=true;
 await assert.rejects(w24.identity.resolveAccount({binding:{...permit,
  principalRef:'other-native-principal-001'},selfJid:self}),
 /W24_WHATSAPP_OWNER_SCOPE_MISMATCH/);
 owner.enabled=false;
 assert.equal(await w24.assertCurrent({binding:permit,phase:'AFTER_LOGOUT'}),false);
 await assert.rejects(w24.identity.resolveAccount({binding:permit,selfJid:self}),
  /W54_CURRENT_SIGNED_USER_REQUIRED/);
});

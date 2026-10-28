import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {IdentityConsentService} from './identity-consent.mjs';
import {createW24DurableProofVerifier} from './durable-identity.mjs';
// Only one original W44 transaction store; no second custody or sender.
const w44=process.env.YANCE_W44_ROOT;
if(!w44)throw Error('W44_EXACT_NATIVE_OWNER_REQUIRED');
const {openEligibilityStore}=await import(pathToFileURL(
 resolve(w44,'services/api/src/domains/grant-custody-budget/index.mjs')).href);
const K={tenant:'localowner',account:'fbowner1',channel:'FB_PERSONAL',peer_id:'peerverified1',binding_revision:1};
const ACTOR='principal_native_localuser',CTX={tenant:K.tenant,principal_id:ACTOR,input_domain:'CONTACT'};
test('real principal requires verified active W54 native grant and original W26 source',async(t)=>{
 const dir=mkdtempSync(join(tmpdir(),'w56-real-k-'));
 let nativeActive=true;
 const verifyTrustedRealPrincipal=({ctx,k})=>({
  verified:nativeActive,proofSource:'W54_SIGNED_NATIVE_SESSION_AND_W26_OWNER',
  principalId:ctx.principal_id,tenant:k.tenant,
  nativeSessionCurrent:nativeActive,providerOwnerCurrent:nativeActive});
 const proofAuthority={evaluate:({kind,proof_ref})=>({
  approved:typeof proof_ref==='string'&&proof_ref.startsWith('official-'),
  proofSource:kind==='CREATE_CONSENT'?'W54_SIGNED_USER_CONSENT':'W26_OFFICIAL_PROVIDER'})};
 const trustedOwnerMutation=createW24DurableProofVerifier({
  proofAuthority,authorizeOperator:()=>true,verifyTrustedRealPrincipal});
 const store=openEligibilityStore({path:join(dir,'shared.sqlite'),
  requireDurableIdentity:true,authorizeMutation:()=>true,
  verifyTrustedRealActor:({actor,identity})=>
   verifyTrustedRealPrincipal({ctx:{...CTX,principal_id:actor},k:identity}),
  verifyOwnerMutation:trustedOwnerMutation});
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true})});
 const w24=new IdentityConsentService({requireDurableIdentity:true,
  durableAuthority:store,proofAuthority,verifyTrustedRealPrincipal});
 const account=w24.registerAccount(CTX,{...K,principal_id:ACTOR,
   binding_proof_ref:'official-account-binding'});
 assert.equal(account.status,'COMMITTED');
 const peer=w24.bindPeer(CTX,{...K,peer_proof_ref:'official-peer-binding'});
 assert.equal(peer.status,'COMMITTED');
 const current=w24.assertCurrent(CTX,K);
 assert.equal(current.identity_key,'localowner|fbowner1|FB_PERSONAL|peerverified1|1');
 assert.equal(current.binding_revision,1);
 nativeActive=false;
 assert.throws(()=>w24.assertCurrent(CTX,K),/W54_REAL_PRINCIPAL_REQUIRED/);
 assert.throws(()=>store.readIdentityAuthority({actor:ACTOR,identity:K}),
  /W54_REAL_PRINCIPAL_OR_W24_PROOF_REQUIRED/);
});
test('real principals default-denied when current signed native verifier absent',async(t)=>{
 const dir=mkdtempSync(join(tmpdir(),'w56-real-default-'));
 const store=openEligibilityStore({path:join(dir,'shared.sqlite'),
  requireDurableIdentity:true,authorizeMutation:()=>true});
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true})});
 const w24=new IdentityConsentService({requireDurableIdentity:true,
  durableAuthority:store,proofAuthority:{evaluate:()=>({approved:true})}});
 assert.throws(()=>w24.assertCurrent(CTX,K),/NONPRODUCTION_TENANT_ONLY/);
 assert.throws(()=>store.readIdentityAuthority({actor:ACTOR,identity:K}),
  /ONLY_SYNTHETIC_FULL_K/);
});

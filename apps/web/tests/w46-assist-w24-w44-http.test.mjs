import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createComposerBridge,fullK} from '../src/composer-bridge.mjs';
import {createLoopbackTakeoverPort} from '../src/native-takeover-port.mjs';

const p24=process.env.YANCE_W24_NATIVE_DIR,p44=process.env.YANCE_W44_NATIVE_DIR;
if(!p24||!p44){
 test('W24 606273 + W44 0eebe original native ASSIST HTTP requires exact owner source', {
   skip:'YANCE_W24_NATIVE_DIR and YANCE_W44_NATIVE_DIR not provided'},()=>{});
}else{
 const native=async(root,file)=>import(pathToFileURL(resolve(root,file)).href);
 const {IdentityConsentService}=await native(p24,'identity-consent.mjs');
 const {createW24DurableProofVerifier}=await native(p24,'durable-identity.mjs');
 const {createNativeTakeoverService,TAKEOVER_GET,TAKEOVER_POST}=await native(p24,'takeover.mjs');
 const {createNativeTakeoverHttpHandler}=await native(p24,'takeover-http.mjs');
 const {openEligibilityStore}=await native(p44,'index.mjs');
 const actor='fake-w46-owner',ctx={tenant:'SYNTHETIC_TEST_ONLY',principal_id:actor,input_domain:'CONTACT'};
 const A={tenant:ctx.tenant,account:'fixture-w46-a',channel:'FB_PERSONAL',peer_id:'fake-assist-A',binding_revision:1};
 const B={...A,peer_id:'fake-auto-B'},C={...A,account:'fixture-w46-c',peer_id:'fake-auto-C'};
 test('W46 actual original W24 HTTP + real W44 SQLite MODE_ASSIST user PASTE becomes HUMAN, B/C AUTO and passive no POST',async t=>{
  const tmp=mkdtempSync(join(tmpdir(),'w46-assist-real-http-'));
  const proofAuthority={evaluate:({proof_ref})=>typeof proof_ref==='string'&&proof_ref.startsWith('fake-verified-')?{approved:true}:{approved:false}};
  const verifier=createW24DurableProofVerifier({proofAuthority,authorizeOperator:({actor:a})=>a===actor});
  const custody=openEligibilityStore({path:join(tmp,'native-w44.sqlite'),requireDurableIdentity:true,
   authorizeMutation:({actor:a})=>a===actor,
   verifyOwnerMutation:input=>['MODE_ASSIST','MODE_MANUAL','MODE_AUTO','ISSUE_GRANT'].includes(input.kind)?
    {verified:input.mutation?.approvalRef==='fake-verified-owner-approved'}:verifier(input)});
  const identity=new IdentityConsentService({requireDurableIdentity:true,durableAuthority:custody,proofAuthority});
  const reg=identity.registerAccount(ctx,{...A,principal_id:actor,binding_proof_ref:'fake-verified-account'});
  assert.equal(reg.status,'COMMITTED');
  assert.equal(identity.registerAccount(ctx,{...C,principal_id:actor,binding_proof_ref:'fake-verified-account'}).status,'COMMITTED');
  for(const k of [A,B,C])assert.equal(identity.bindPeer(ctx,{...k,peer_proof_ref:'fake-verified-peer'}).status,'COMMITTED');
  const original=createNativeTakeoverService({identityConsent:identity,custodyStore:custody,
   authorizeTakeover:({trustedContext,action})=>trustedContext?.principal_id===actor&&
    ['READ_STATE','PASTE'].includes(action)});
  const server=createServer(createNativeTakeoverHttpHandler({service:original,resolveTrustedContext:()=>ctx}));
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok)});
  t.after(async()=>{await new Promise(ok=>server.close(ok));custody.close();rmSync(tmp,{recursive:true,force:true,maxRetries:3})});
  const port=createLoopbackTakeoverPort({enabled:true,baseUrl:'http://127.0.0.1:'+server.address().port,
   endpoints:{get:TAKEOVER_GET,post:TAKEOVER_POST}});
  const previous=custody.readModeState({identity:A,actor});
  const assist=custody.switchMode({identity:A,actor,targetMode:'ASSIST',
   idempotencyKey:'fake-w46-assist-mode',
   expectedGeneration:previous.barriers.generation,
   expectedBindingRevision:previous.identityEpochs.bindingRevision,
   expectedAccountEpoch:previous.identityEpochs.accountEpoch,
   expectedConsentEpoch:previous.identityEpochs.consentEpoch,
   expectedCustodyEpoch:previous.identityEpochs.custodyEpoch,
   payload:{targetMode:'ASSIST',approvalRef:'fake-verified-owner-approved'}});
  assert.equal(assist.status,'COMMITTED');
  const calls=[],wrapped={
   get:async k=>{calls.push(['GET',fullK(k)]);return port.get(k)},
   post:async(k,body)=>{calls.push(['POST',fullK(k),body]);return port.post(k,body)}
  };
  const bridge=createComposerBridge({takeoverPort:wrapped});
  bridge.choose(A);
  const observed=await bridge.inspect(A);
  assert.equal(observed.status,'READ_ONLY_ASSIST');
  assert.deepEqual(calls.map(x=>x[0]),['GET']);
  bridge.choose(B);bridge.choose(C);bridge.choose(A);
  assert.equal(calls.filter(x=>x[0]==='POST').length,0);
  const before=await port.get(A);assert.equal(before.mode,'ASSIST');
  const outcome=await bridge.userAction(A,'PASTE',{text:'synthetic-user-edit'});
  assert.equal(outcome.status,'READY_HUMAN',outcome.reason);
  assert.equal(outcome.canSend,false);assert.equal(outcome.verifiedEpoch,before.epoch+1);
  assert.deepEqual(calls.map(x=>x[0]),['GET','GET','POST','GET']);
  assert.equal(calls[2][2].expectedIdentityKey,fullK(A));
  const after=await port.get(A);assert.equal(after.mode,'HUMAN');
  assert.equal(after.epoch,before.epoch+1);
  assert.equal(custody.readModeState({identity:B,actor}).selectedMode,'AUTO');
  assert.equal(custody.readModeState({identity:C,actor}).selectedMode,'AUTO');
  assert.equal((await port.get(B)).mode,'AUTO');
  assert.equal((await port.get(C)).mode,'AUTO');
  assert.equal(typeof bridge.send,'undefined');
 });
}

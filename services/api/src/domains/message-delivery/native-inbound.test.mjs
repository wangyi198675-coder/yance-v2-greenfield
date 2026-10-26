import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MessageDelivery,SyntheticConnectorSink} from './index.mjs';
import {createW25NativeInboundPort} from './native-inbound.mjs';

const baseK=Object.freeze({tenantId:'private-local-1',accountId:'real-shaped-account',
 channel:'TELEGRAM_PERSONAL',peerId:'real-shaped-peer',bindingRevision:'3'});
const key=k=>[k.tenantId,k.accountId,k.channel,k.peerId,k.bindingRevision].join('|');
const event=(overrides={})=>({k:{...baseK},source:'tdlib-json',
 providerMid:'upstream-shaped-mid-1',sourceEventId:'upstream-event-1',
 original:'A genuine upstream-shaped body is NOT actual production proof',
 synthetic:false,...overrides});
const identity=async({k,nativePrincipalId})=>({
 valid:nativePrincipalId==='verified-fixture-principal',identityKey:key(k),
 bindingRevision:Number(k.bindingRevision),accountEpoch:2,consentEpoch:5});
const verified=async e=>({authorized:true,isNative:true,principalId:'verified-fixture-principal',
 tenantId:e.k.tenantId,channel:e.k.channel,accountId:e.k.accountId,peerId:e.k.peerId,
 source:e.source,bindingRevision:Number(e.k.bindingRevision),accountEpoch:2,
 consentEpoch:5,connectionEpoch:4});
function harness(t){
 const dir=mkdtempSync(join(tmpdir(),'w25-native-ingress-port-'));
 const file=join(dir,'one-existing-w25-outbox.sqlite'),instances=[];
 const open=(cfg={})=>{
  const db=new MessageDelivery({databasePath:file,eligibility:{check:async()=>({allowed:false})},
    sink:new SyntheticConnectorSink(async()=>{throw Error('NO_SEND');}),
    receiptVerifier:async()=>({verified:false})});
  instances.push(db);
  return createW25NativeInboundPort({delivery:db,
   verifyNativeSource:cfg.verifyNativeSource??verified,
   readW24Identity:cfg.readW24Identity??identity,
   checkPrivateInboundConsent:cfg.checkPrivateInboundConsent??(async({nativePrincipalId})=>({
     authorized:true,principalId:nativePrincipalId,consentEpoch:5,accountEpoch:2,bindingRevision:3
   }))});
 };
 t.after(()=>{for(const d of instances.reverse())d.close();rmSync(dir,{recursive:true,force:true})});
 return {open};
}
test('strict inbound native port refuses missing trusted W24 and upstream verifiers',t=>{
 const h=harness(t);
 assert.throws(()=>createW25NativeInboundPort({}),/EXISTING_W25_DB_AND_NATIVE_W24_PORTS_REQUIRED/);
 const p=h.open({verifyNativeSource:async()=>({authorized:false})});
 return assert.rejects(p.acceptInbound(event()),/UPSTREAM_SOURCE_NOT_AUTHENTICATED/);
});
test('same W25 Outbox SQLite persists original + actual-shaped MID once across restart',async t=>{
 const h=harness(t),one=h.open();
 const first=await one.acceptInbound(event());
 assert.equal(first.duplicate,false);
 assert.equal(first.k.channel,'TELEGRAM_PERSONAL');
 assert.equal(first.providerMid,'upstream-shaped-mid-1');
 const another=h.open();
 const replay=await another.acceptInbound(event());
 assert.equal(replay.duplicate,true);
 assert.equal(replay.id,first.id);
 assert.equal((await another.getInbound({id:first.id,
   nativePrincipalId:'verified-fixture-principal'})).original,first.original);
 await assert.rejects(another.getInbound({id:first.id,nativePrincipalId:''}),
   /TRUSTED_INBOUND_READ_REQUIRED/);
 await assert.rejects(another.getInbound({id:first.id,
   nativePrincipalId:'attacker-principal'}),/PRIVATE_INBOUND_READ_AUTHORIZATION_STALE/);
});
test('W25 same full-K two workers reject changed MID text or same event ID bound elsewhere',async t=>{
 const h=harness(t),one=h.open(),two=h.open();
 const [first,next]=await Promise.all([one.acceptInbound(event()),two.acceptInbound(event())]);
 assert.equal(Number(first.duplicate)+Number(next.duplicate),1);
 await assert.rejects(two.acceptInbound(event({original:'tampered'})),/UPSTREAM_MID_OR_EVENT_REPLAY_CONFLICT/);
 await assert.rejects(two.acceptInbound(event({providerMid:'another-native-mid'})),
   /UPSTREAM_MID_OR_EVENT_REPLAY_CONFLICT/);
});
test('source/channel spoof, synthetic marker, missing W24 proof fail closed before SQLite write',async t=>{
 const h=harness(t),port=h.open();
 await assert.rejects(port.acceptInbound(event({source:'baileys'})),/VERIFIED_NATIVE_INBOUND_REQUIRED/);
 await assert.rejects(port.acceptInbound(event({synthetic:true})),/VERIFIED_NATIVE_INBOUND_REQUIRED/);
 await assert.rejects(port.acceptInbound(event({k:{...baseK,channel:'BAD'}})),/VERIFIED_NATIVE_INBOUND_REQUIRED/);
 const stale=h.open({readW24Identity:async()=>({...await identity({k:baseK}),consentEpoch:4})});
 await assert.rejects(stale.acceptInbound(event()),/W24_IDENTITY_BINDING_OR_EPOCH_STALE/);
 const other=h.open({verifyNativeSource:async e=>({...await verified(e),accountId:'another-account'})});
 await assert.rejects(other.acceptInbound(event()),/UPSTREAM_SOURCE_NOT_AUTHENTICATED/);
});
test('same upstream MID in separate authorized accounts or peer is isolated',async t=>{
 const h=harness(t),p=h.open();
 const a=await p.acceptInbound(event());
 const b=await p.acceptInbound(event({k:{...baseK,accountId:'other-account'}}));
 const c=await p.acceptInbound(event({k:{...baseK,peerId:'other-peer'},sourceEventId:'other-event'}));
 assert.notEqual(a.id,b.id);assert.notEqual(a.id,c.id);assert.notEqual(b.id,c.id);
});
test('W25 inbound does not authorize any outbound or create an Outbox Intent',async t=>{
 const h=harness(t),p=h.open();
 const a=await p.acceptInbound(event());
 assert.ok(a.id);
 const dir=mkdtempSync(join(tmpdir(),'w25-native-ingress-nonetwork-'));
 const db=new MessageDelivery({databasePath:join(dir,'outbox.sqlite'),
   eligibility:{check:async()=>({allowed:false,reason:'NO_NATIVE_AUTH'})},
   sink:new SyntheticConnectorSink(),receiptVerifier:async()=>({verified:false})});
 t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:50})});
 await assert.rejects(db.submitIntent({k:baseK,businessMessageId:'live-looking',
   payload:{text:'must not send'},mode:'AUTO',actorId:'untrusted',sessionId:'untrusted'}),
   /NO_NATIVE_AUTH/);
});

test('private inbound persistence and later read each require explicit verified user Consent',async t=>{
 const h=harness(t);
 const denied=h.open({checkPrivateInboundConsent:async()=>({authorized:false})});
 await assert.rejects(denied.acceptInbound(event()),/PRIVATE_INBOUND_CONSENT_REQUIRED/);
 const authorized=h.open();
 const recorded=await authorized.acceptInbound(event());
 assert.equal(recorded.duplicate,false);
 await assert.rejects(denied.getInbound({id:recorded.id,
   nativePrincipalId:'verified-fixture-principal'}),/PRIVATE_INBOUND_CONSENT_REQUIRED/);
 const stale=h.open({checkPrivateInboundConsent:async({nativePrincipalId})=>({
   authorized:true,principalId:nativePrincipalId,consentEpoch:4,
   accountEpoch:2,bindingRevision:3})});
 await assert.rejects(stale.acceptInbound(event({providerMid:'second-mid',sourceEventId:'second-event'})),
   /PRIVATE_INBOUND_CONSENT_REQUIRED/);
 await assert.rejects(stale.getInbound({id:recorded.id,
   nativePrincipalId:'verified-fixture-principal'}),/PRIVATE_INBOUND_CONSENT_REQUIRED/);
});

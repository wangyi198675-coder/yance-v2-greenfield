import test from 'node:test';
import assert from 'node:assert/strict';
import {createBaileysNativeSetupController} from './native-authorization-setup.mjs';
const native=(sessionRef,kind='WEB_LOCAL_PRIVATE',principalRef='one-private-os-user')=>
 Object.freeze({verified:true,kind,sessionRef,principalRef,
 installationRef:'same-private-installation',revocationGeneration:0});
function setup(){
 let state='WAITING_USER_AUTH',started=0;
 const c=createBaileysNativeSetupController({
  verifyNativeSession:async({nativeSession})=>nativeSession,
  createWorker:()=>({
   start:async()=>{state='WAITING_QR_SCAN';started++;return {state,connected:false,qrAvailable:false}},
   stop:async()=>{state='WAITING_USER_AUTH';return {state,connected:false}},
   revoke:async()=>{state='REVOKED';return {state,connected:false}},
   getStatus:()=>({state,connected:false,nativeSocketCreated:state==='WAITING_QR_SCAN',
    qrAvailable:false,canSend:false}),
   getAccountIdentity:()=>null
  })
 });
 return {c,get starts(){return started}};
}
test('P0 single-user Web cookie refresh can read and disconnect its own existing QR without new session pairing',async()=>{
 const x=setup();
 const a=native('session-A');
 const b=native('session-B');
 const started=await x.c.beginPairing({nativeSession:a,accountLocator:'current-own-whatsapp'});
 assert.equal(started.state,'WAITING_QR_SCAN');
 assert.equal((await x.c.readStatus({nativeSession:b})).state,'WAITING_QR_SCAN');
 assert.equal(x.starts,1,'cookie refresh must not create a second SDK socket');
 assert.equal((await x.c.disconnect({nativeSession:b})).state,'WAITING_USER_AUTH');
 assert.equal(x.starts,1);
});
test('P0 local Web cannot take QR across different OS principal or installation or revocation generation',async()=>{
 const x=setup();
 await x.c.beginPairing({nativeSession:native('A'),accountLocator:'current-own-whatsapp'});
 await assert.rejects(x.c.readStatus({nativeSession:native('B','WEB_LOCAL_PRIVATE','different-os-user')}),
   /CROSS_PRINCIPAL_OR_STALE_SESSION/);
 await assert.rejects(x.c.readStatus({nativeSession:{...native('B'),installationRef:'different-installation'}}),
   /CROSS_PRINCIPAL_OR_STALE_SESSION/);
 await assert.rejects(x.c.readStatus({nativeSession:{...native('B'),revocationGeneration:1}}),
   /CROSS_PRINCIPAL_OR_STALE_SESSION/);
});
test('original W54 signed native session remains bound to its exact session ID',async()=>{
 const x=setup();
 await x.c.beginPairing({nativeSession:native('first-native','NATIVE_FIRST_PARTY'),
  accountLocator:'current-own-whatsapp'});
 await assert.rejects(x.c.readStatus({nativeSession:native('other-native','NATIVE_FIRST_PARTY')}),
  /CROSS_PRINCIPAL_OR_STALE_SESSION/);
});

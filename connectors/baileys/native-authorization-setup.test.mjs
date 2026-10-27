import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createNativeBaileysWorker} from './native-worker.mjs';
import {createBaileysNativeSetupController} from './native-authorization-setup.mjs';

const pause=()=>new Promise(r=>setTimeout(r,45));
const session=(principalRef='owner-A',revocationGeneration=1)=>({
  principalRef,installationRef:'install-1',sessionRef:'signed-'+principalRef,revocationGeneration,
});
const fixture=({permitOverrides={},verified=true,accountMatch=true}={})=>{
  const events=[],sockets=[],updates=[],receipts=[],onboarding=[];
  let authEpoch=1,revokeCount=0,saveCount=0,allowed=verified;
  const ports={
    authorization:{
      authorizeStart:async ({userAction,accountLocator})=>{
        onboarding.push({userAction,accountLocator});
        return {authorized:true,userConsented:true,platformPermitted:true,
          principalVerified:true,enrollmentApproved:true,accountVerified:false,
          accountId:'account-1',tenantId:'tenant-1',bindingRevision:1,
          accountRevocationEpoch:7,restoreApproved:false,...permitOverrides};
      },
      assertCurrent:async ()=>allowed,
    },
    authStore:{
      open:async()=>({state:{creds:{registered:false},keys:{get:async()=>({}),set:async()=>{}}},
        saveCreds:async()=>{saveCount++}}),
      revoke:async()=>{revokeCount++},
    },
    identity:{
      resolveAccount:async()=>({tenant:accountMatch?'tenant-1':'tenant-2',
        account:'account-1',channel:'WHATSAPP_PERSONAL',binding_revision:1}),
      resolvePeer:async ({remoteJid})=>({bound:remoteJid==='peer@s.whatsapp.net',peer_id:'peer-1'}),
    },
    inbound:{acceptInbound:async m=>{updates.push(m);return {accepted:true}},
      recordReceipt:async m=>{receipts.push(m);return {accepted:true}}},
  };
  const controller=createBaileysNativeSetupController({
    verifyNativeSession:async ({nativeSession})=>allowed&&nativeSession?.principalRef ?
      {verified:true,kind:'NATIVE_FIRST_PARTY',...nativeSession}:null,
    createWorker:observed=>createNativeBaileysWorker({...ports,observed,sdk:{
      makeWASocket:()=>{
        const ev=new EventEmitter();const s={ev,user:{id:'5551234@s.whatsapp.net',lid:'123456@lid'},
          end:()=>{},ws:{close:()=>{}}};sockets.push(s);return s;
      },
      logger:{info:()=>{},error:()=>{}},
    }}),
  });
  return {controller,sockets,onboarding,updates,receipts,events,
    removePermission:()=>{allowed=false},getRevoked:()=>revokeCount,getSaved:()=>saveCount};
};

test('cold boot: actual native Worker is only READY, never creates a socket or fabricated QR',async()=>{
  const f=fixture();
  assert.equal(f.sockets.length,0);
  const state=await f.controller.readStatus({nativeSession:session()});
  assert.equal(state.state,'WAITING_USER_AUTH');
  assert.equal(state.account,null);
  assert.equal(state.qrAvailable,false);
  assert.equal(state.canSend,false);
  assert.equal(f.sockets.length,0);
  await assert.rejects(f.controller.readQr({nativeSession:session()}),/PAIRING_NOT_STARTED/);
});

test('a signed user click invokes original Baileys socket factory and only SDK QR can appear',async()=>{
  const f=fixture();const user=session();
  const clicked=await f.controller.beginPairing({nativeSession:user,accountLocator:'new-current-account'});
  assert.equal(clicked.ok,true);assert.equal(clicked.connected,false);
  assert.equal(f.sockets.length,1);
  await assert.rejects(f.controller.readQr({nativeSession:user}),/SDK_QR_NOT_AVAILABLE/);
  f.sockets[0].ev.emit('connection.update',{qr:'TEST_ONLY_NATIVE_EVENT_PAYLOAD_NOT_A_REAL_WHATSAPP_QR'});
  await pause();
  const status=await f.controller.readStatus({nativeSession:user});
  assert.equal(status.state,'WAITING_QR_SCAN');
  assert.equal(status.qrAvailable,true);
  const qr=await f.controller.readQr({nativeSession:user});
  assert.match(qr.imageDataUrl,/^data:image\/png;base64,/);
  assert.equal(qr.source,'BAILEYS_NATIVE_CONNECTION_UPDATE');
  assert.ok(qr.expiresAt>Date.now());
  assert.equal(JSON.stringify(status).includes('TEST_ONLY_NATIVE'),false);
  await assert.rejects(f.controller.readQr({nativeSession:session('owner-B')}),/CROSS_PRINCIPAL_OR_STALE_SESSION/);
});

test('SDK reported connection is not ONLINE until original W24 verifies exact account',async()=>{
  const f=fixture({accountMatch:false});const user=session();
  await f.controller.beginPairing({nativeSession:user,accountLocator:'registered-local'});
  f.sockets[0].ev.emit('connection.update',{connection:'open'});
  await pause();
  const st=await f.controller.readStatus({nativeSession:user});
  assert.equal(st.connected,false);
  assert.equal(st.accountIdentityVerified,false);
  assert.equal(st.state,'HOLD_IDENTITY');
});
test('after SDK native open and W24 identity verification: account JID/LID readback is scoped',async()=>{
  const f=fixture();const user=session();
  await f.controller.beginPairing({nativeSession:user,accountLocator:'registered-local'});
  f.sockets[0].ev.emit('connection.update',{connection:'open'});
  await pause();
  const st=await f.controller.readStatus({nativeSession:user});
  assert.equal(st.state,'ONLINE');
  assert.equal(st.accountIdentityVerified,true);
  assert.equal(st.account.platformJid,'5551234@s.whatsapp.net');
  assert.equal(st.account.account,'account-1');
  assert.equal(st.account.accountRevocationEpoch,7);
  assert.equal(st.canSend,false);
  await assert.rejects(f.controller.readStatus({nativeSession:session('owner-B')}),/CROSS_PRINCIPAL_OR_STALE_SESSION/);
});
test('disconnect keeps credentials for explicit reauthorization, QR disappears, no auto socket restart',async()=>{
  const f=fixture(),user=session();
  await f.controller.beginPairing({nativeSession:user,accountLocator:'only-loc'});
  f.sockets[0].ev.emit('connection.update',{qr:'fixture-without-legit-provider'});
  await pause();
  const before=await f.controller.readQr({nativeSession:user});
  assert.ok(before.imageDataUrl);
  const stopped=await f.controller.disconnect({nativeSession:user});
  assert.equal(stopped.state,'WAITING_USER_AUTH');
  assert.equal(f.getRevoked(),0);
  assert.equal(f.sockets.length,1);
  await assert.rejects(f.controller.readQr({nativeSession:user}),/SDK_QR_NOT_AVAILABLE/);
  const st=await f.controller.readStatus({nativeSession:user});
  assert.equal(st.account,null);
});
test('reconnect after cold restart needs a NEW explicit user click AND W24/W55 restore permission',async()=>{
  const user=session(),a=fixture(),b=fixture();
  assert.equal(a.sockets.length,0);
  await assert.rejects(a.controller.reconnect({nativeSession:user,accountLocator:'old-account'}),/RESTORE_NOT_AUTHORIZED/);
  assert.equal(a.sockets.length,0);
  // Separate new process/instance — no restored account/QR until clicking again.
  assert.equal((await b.controller.readStatus({nativeSession:user})).state,'WAITING_USER_AUTH');
  const c=fixture({permitOverrides:{restoreApproved:true,accountVerified:true}});
  const r=await c.controller.reconnect({nativeSession:user,accountLocator:'explicit-approved-account'});
  assert.equal(r.state,'STARTING_NATIVE_SDK');
  assert.equal(c.sockets.length,1);
  assert.equal(c.onboarding[0].userAction,'RESUME_EXPLICITLY_APPROVED');
});
test('revoke fences the SDK and deletes active vault ref via the existing secure Owner callback',async()=>{
  const f=fixture(),user=session();
  await f.controller.beginPairing({nativeSession:user,accountLocator:'only-loc'});
  const r=await f.controller.revoke({nativeSession:user});
  assert.equal(r.state,'REVOKED');
  assert.equal(r.credentialRevokeRequested,true);
  assert.equal(f.getRevoked(),1);
  assert.equal(f.sockets.length,1);
  await assert.rejects(f.controller.beginPairing({nativeSession:user,accountLocator:'only-loc'}),/ACCOUNT_REVOKED|WORKER_ALREADY_STARTED|NATIVE/);
});
test('stale signed local sessions cannot read, revoke or take over the other session',async()=>{
  const f=fixture(),user=session();
  await f.controller.beginPairing({nativeSession:user,accountLocator:'only-loc'});
  await assert.rejects(f.controller.revoke({nativeSession:session('owner-B')}),/CROSS_PRINCIPAL_OR_STALE_SESSION/);
  await assert.rejects(f.controller.readStatus({nativeSession:session('owner-A',2)}),/CROSS_PRINCIPAL_OR_STALE_SESSION/);
  f.removePermission();
  await assert.rejects(f.controller.readStatus({nativeSession:user}),/W54_SIGNED_NATIVE_SESSION_REQUIRED/);
  await assert.rejects(f.controller.revoke({nativeSession:user}),/W54_SIGNED_NATIVE_SESSION_REQUIRED/);
  assert.equal(f.getRevoked(),0);
});
test('invalid and unverified signed local session fails BEFORE Socket creation',async()=>{
  const f=fixture({verified:false});
  await assert.rejects(f.controller.beginPairing({nativeSession:session(),accountLocator:'only-loc'}),/W54_SIGNED_NATIVE_SESSION_REQUIRED/);
  assert.equal(f.sockets.length,0);
});

test('disconnect THEN revoke still reaches W55 secure owner, and other user cannot revoke',async()=>{
  const f=fixture(),user=session();
  await f.controller.beginPairing({nativeSession:user,accountLocator:'owned'});
  await f.controller.disconnect({nativeSession:user});
  await assert.rejects(f.controller.revoke({nativeSession:session('owner-B')}),/CROSS_PRINCIPAL_OR_STALE_SESSION/);
  const revoked=await f.controller.revoke({nativeSession:user});
  assert.equal(revoked.state,'REVOKED');
  assert.equal(f.getRevoked(),1);
  assert.equal(f.sockets.length,1);
});

test('repeated setup click cannot orphan live QR or allow cross-principal revoke',async()=>{
  const f=fixture(),user=session();
  await f.controller.beginPairing({nativeSession:user,accountLocator:'one'});
  f.sockets[0].ev.emit('connection.update',{qr:'NATIVE_EVENT_ONLY_QR_FIXTURE'});
  await pause();
  const qr1=await f.controller.readQr({nativeSession:user});
  await assert.rejects(f.controller.beginPairing({nativeSession:user,accountLocator:'one'}),/WORKER_ALREADY_STARTED/);
  const qr2=await f.controller.readQr({nativeSession:user});
  assert.equal(qr1.imageDataUrl,qr2.imageDataUrl);
  assert.equal(f.sockets.length,1);
  await assert.rejects(f.controller.revoke({nativeSession:session('other')}),/CROSS_PRINCIPAL/);
});

test('immediate QR GET waits for real native event PNG render without fabricating QR',async()=>{
  const f=fixture(),user=session();
  await f.controller.beginPairing({nativeSession:user,accountLocator:'only-loc'});
  await assert.rejects(f.controller.readQr({nativeSession:user}),/SDK_QR_NOT_AVAILABLE/);
  // Real event source shape; never used as a real WhatsApp QR for the user.
  f.sockets[0].ev.emit('connection.update',{qr:'ONLY_TEST_NATIVE_QR_EVENT'});
  const rendered=await f.controller.readQr({nativeSession:user});
  assert.equal(rendered.source,'BAILEYS_NATIVE_CONNECTION_UPDATE');
  assert.match(rendered.imageDataUrl,/^data:image\/png;base64,/);
  assert.ok(rendered.expiresAt>Date.now());
  assert.equal(f.sockets.length,1);
});

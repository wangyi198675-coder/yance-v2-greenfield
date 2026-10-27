import test from 'node:test';
import assert from 'node:assert/strict';
import {assertOfficialMatrixPrincipal,readNativeAccountStatus,readNativeLoginFlows,
  revokeNativeLogin,readNativePeerHints,NATIVE_AUTH_ACTIONS} from './provisioning-auth.mjs';

function upstream({principal='@owner:yance-w26.invalid',bot='@facebookbot:yance-w26.invalid',
  logins=[],denyMatrix=false,flows=['facebook','messenger','messenger-lite','messenger-lite-android'],
  calls=[]}={}){
  return async (url,{method='GET',headers}={})=>{
    calls.push({url,method,authorized:headers?.Authorization==='Bearer valid-matrix-token'});
    if(!headers?.Authorization)return Response.json({error:'no token'},{status:401});
    if(url.includes('/account/whoami'))return Response.json(
      denyMatrix?{errcode:'M_UNKNOWN_TOKEN'}:{user_id:principal},
      {status:denyMatrix?401:200});
    if(new URL(url).pathname.endsWith('/v3/whoami')){
      if(new URL(url).searchParams.get('user_id')!==principal)
        return Response.json({error:'Matrix principal missing or changed'},{status:401});
      return Response.json({bridge_bot:bot,logins});
    }
    if(new URL(url).pathname.endsWith('/v3/login/flows')){
      if(new URL(url).searchParams.get('user_id')!==principal)
        return Response.json({error:'Matrix principal missing or changed'},{status:401});
      return Response.json({flows:flows.map(id=>({id,name:id}))});
    }
    if(new URL(url).pathname.includes('/v3/logout/')){
      if(new URL(url).searchParams.get('user_id')!==principal)
        return Response.json({error:'Matrix principal missing or changed'},{status:401});
      const id=decodeURIComponent(new URL(url).pathname.split('/').pop());
      if(method!=='POST')return Response.json({}, {status:405});
      const n=logins.findIndex(l=>l.id===id);
      if(n<0)return Response.json({}, {status:404});
      logins.splice(n,1);return Response.json({});
    }
    return Response.json({error:'wrong upstream route'},{status:404});
  };
}
test('official manager launch is user-initiated with REAL v3 backend and no imaginary QR',()=>{
  assert.equal(NATIVE_AUTH_ACTIONS.managerSchemeURL,'mautrix-manager://open/');
  assert.equal(NATIVE_AUTH_ACTIONS.qrFlowSupported,false);
  assert.equal(NATIVE_AUTH_ACTIONS.loginRequiresUserClick,true);
  assert.match(NATIVE_AUTH_ACTIONS.bridgeURL,/127\.0\.0\.1:29319/);
});
test('no access token means NO social account claims',async()=>{
  await assert.rejects(readNativeAccountStatus(null),/MATRIX_AUTH_REQUIRED/);
  await assert.rejects(readNativeLoginFlows(''),/MATRIX_AUTH_REQUIRED/);
  await assert.rejects(assertOfficialMatrixPrincipal('with spaces'),/MATRIX_AUTH_REQUIRED/);
});
test('real Matrix verify port is mandatory; refused, expired or mismatching identity fails closed',async()=>{
  await assert.rejects(readNativeAccountStatus('valid-matrix-token',{
    fetchImpl:upstream({denyMatrix:true})}),/MATRIX_AUTH_REQUIRED/);
  await assert.rejects(readNativeAccountStatus('valid-matrix-token',{
    fetchImpl:upstream({principal:'@other:evil.example'})}),/INVALID_MATRIX_PRINCIPAL/);
  await assert.rejects(readNativeAccountStatus('valid-matrix-token',{
    fetchImpl:upstream({principal:'@facebookbot:yance-w26.invalid'})}),/INVALID_MATRIX_PRINCIPAL/);
  await assert.rejects(readNativeAccountStatus('valid-matrix-token',{
    fetchImpl:upstream({bot:'@wrongbot:yance-w26.invalid'})}),/PROVISIONING_BRIDGE_IDENTITY_MISMATCH/);
});
test('verified but never social-authorized local principal yields WAITING_USER_AUTH',async()=>{
  const seen=[];
  const s=await readNativeAccountStatus('valid-matrix-token',{
    fetchImpl:upstream({calls:seen})});
  assert.equal(s.realAccountState,'WAITING_USER_AUTH');
  assert.deepEqual(s.logins,[]);
  assert.equal(s.accountCount,0);
  assert.equal(s.canSend,false);
  assert.equal(s.w24ChannelAccountBindingVerified,false);
  assert.equal(seen.filter(c=>c.url.includes('/_matrix/provision/v3/')).length,1);
  const nativeCall=seen.find(c=>c.url.includes('/_matrix/provision/v3/'));
  assert.equal(new URL(nativeCall.url).searchParams.get('user_id'),
    '@owner:yance-w26.invalid');
});
test('read original upstream login flows; never fabricate QR or start Meta login',async()=>{
  const seen=[];
  const s=await readNativeLoginFlows('valid-matrix-token',{fetchImpl:upstream({
    calls:seen,flows:['facebook','messenger','messenger-lite','messenger-lite-android','rogue']})});
  assert.deepEqual(s.flows.map(f=>f.id),['facebook','messenger','messenger-lite','messenger-lite-android']);
  assert.equal(s.canSend,false);
  assert.ok(seen.every(c=>c.method==='GET'));
});
test('upstream CONNECTED is not W24 ChannelAccount binding or send permission',async()=>{
  const s=await readNativeAccountStatus('valid-matrix-token',{fetchImpl:upstream({
    logins:[{id:'fb.123',name:'Native upstream name',state:{state_event:'CONNECTED'}},
      {id:'fb.456',name:'Disconnected',state:{state_event:'TRANSIENT_DISCONNECT'}}]})});
  assert.equal(s.accountCount,2);
  assert.equal(s.connectedCount,1);
  assert.equal(s.realAccountState,'UPSTREAM_CONNECTED_W24_BINDING_PENDING');
  assert.equal(s.logins[0].providerConnected,true);
  assert.equal(s.logins[0].w24BindingVerified,false);
  assert.equal(s.canSend,false);
});
test('revocation requires exact current user login, manual user confirmation, and durable W24 fence',async()=>{
  const logins=[{id:'fb.123',name:'Owner',state:{state_event:'CONNECTED'}}];
  const seen=[];
  const fetchImpl=upstream({logins,calls:seen});
  await assert.rejects(revokeNativeLogin('valid-matrix-token','fb.123',{
    confirmLoginID:'fb.123',fetchImpl}),/EXPLICIT_ACCOUNT_REVOCATION_REQUIRED/);
  await assert.rejects(revokeNativeLogin('valid-matrix-token','all',{
    confirmLoginID:'all',explicitUserAction:'REVOKE_THIS_FACEBOOK_LOGIN',fetchImpl
  }),/EXPLICIT_ACCOUNT_REVOCATION_REQUIRED/);
  await assert.rejects(revokeNativeLogin('valid-matrix-token','fb.999',{
    confirmLoginID:'fb.999',explicitUserAction:'REVOKE_THIS_FACEBOOK_LOGIN',fetchImpl
  }),/LOGIN_NOT_OWNED_BY_PRINCIPAL/);
  await assert.rejects(revokeNativeLogin('valid-matrix-token','fb.123',{
    confirmLoginID:'fb.123',explicitUserAction:'REVOKE_THIS_FACEBOOK_LOGIN',fetchImpl
  }),/W24_DURABLE_REVOCATION_FENCE_REQUIRED/);
  assert.ok(logins.length===1);
  assert.equal(seen.filter(c=>c.method==='POST').length,0);
});
test('after W24 durable fence, true upstream logout is followed by verified upstream readback',async()=>{
  const logins=[{id:'fb.123',name:'Owner',state:{state_event:'CONNECTED'}}];
  const calls=[];
  const proof=[];
  const s=await revokeNativeLogin('valid-matrix-token','fb.123',{
    confirmLoginID:'fb.123',explicitUserAction:'REVOKE_THIS_FACEBOOK_LOGIN',
    fetchImpl:upstream({logins,calls}),
    authorizeDurableRevocation:async x=>{proof.push(x);return {committed:true,accountRevocationEpoch:4}}
  });
  assert.equal(s.revoked,true);
  assert.equal(s.w24AccountRevocationEpochUpdated,true);
  assert.equal(s.accountRevocationEpoch,4);
  assert.equal(s.realAccountState,'WAITING_USER_AUTH');
  assert.equal(s.canSend,false);
  assert.equal(proof[0].principal,'@owner:yance-w26.invalid');
  assert.equal(calls.filter(c=>c.method==='POST').length,1);
});

test('upstream bridgev2 Whoami exposes only original avatar MXC and personal Matrix space',async()=>{
  const status=await readNativeAccountStatus('valid-matrix-token',{fetchImpl:upstream({logins:[{
    id:'opaque-login-id',name:'Meta name',
    state:{state_event:'CONNECTED',timestamp:1723294560531},
    profile:{name:'Native name',username:'real.upstream',avatar:'mxc://yance-w26.invalid/ABC_123'},
    space_room:'!space123:yance-w26.invalid'}]})});
  assert.equal(status.logins[0].profile.avatarMXC,'mxc://yance-w26.invalid/ABC_123');
  assert.equal(status.logins[0].matrixSpaceRoomId,'!space123:yance-w26.invalid');
  assert.equal(status.logins[0].stateTimestamp,1723294560531);
  assert.equal(status.logins[0].providerAccountIdVerified,false);
  assert.equal(status.logins[0].peerOwnershipVerified,false);
  assert.equal(status.logins[0].canSend,false);
});
test('invalid image URL or fabricated owner room never accepted as native avatar/space proof',async()=>{
  const status=await readNativeAccountStatus('valid-matrix-token',{fetchImpl:upstream({logins:[{
    id:'bridge login',name:'Remote',state:{state_event:'CONNECTED'},
    profile:{avatar:'https://thirdparty.example/tracker.png'},
    space_room:'../../etc/passwd'}]})});
  assert.equal(status.logins[0].profile.avatarMXC,null);
  assert.equal(status.logins[0].matrixSpaceRoomId,null);
});
test('unauthed or disconnected matrix login yields no peer hints, never a fake empty contact list',async()=>{
  await assert.rejects(readNativePeerHints(null),/MATRIX_AUTH_REQUIRED/);
  const hints=await readNativePeerHints('valid-matrix-token',{fetchImpl:upstream()});
  assert.equal(hints.state,'WAITING_USER_AUTH');
  assert.equal(hints.rooms,null);
  assert.equal(hints.realPeers,null);
  assert.equal(hints.canSend,false);
});
test('verified native Matrix space children produce untrusted room hints, NEVER FB peer ID or W24 K',async()=>{
  const seen=[];
  const base=upstream({calls:seen,logins:[{id:'fb.login',name:'test',
    state:{state_event:'CONNECTED'},space_room:'!space123:yance-w26.invalid'}]});
  const fetchImpl=async(url,options)=>{
    if(url.includes('/rooms/')){
      assert.match(url,/!space123%3Ayance-w26\.invalid/);
      return Response.json([
        {type:'m.space.child',sender:'@facebookbot:yance-w26.invalid',
         state_key:'!one:yance-w26.invalid',content:{via:['yance-w26.invalid']}},
        {type:'m.space.child',sender:'@mallory:yance-w26.invalid',
         state_key:'!forged:yance-w26.invalid',content:{via:['yance-w26.invalid']}},
        {type:'m.space.child',sender:'@facebookbot:yance-w26.invalid',
         state_key:'!one:yance-w26.invalid',content:{via:['yance-w26.invalid']}},
        {type:'m.space.child',sender:'@facebookbot:yance-w26.invalid',
         state_key:'fake-peer-id',content:{via:['yance-w26.invalid']}},
        {type:'m.space.child',sender:'@facebookbot:yance-w26.invalid',
         state_key:'!two:yance-w26.invalid',content:{via:['yance-w26.invalid']}}
      ]);
    }
    return base(url,options);
  };
  const s=await readNativePeerHints('valid-matrix-token',{fetchImpl});
  assert.equal(s.state,'PROVIDER_CONNECTED_PEER_PROOF_PENDING');
  assert.deepEqual(s.accounts[0].roomHints,['!one:yance-w26.invalid','!two:yance-w26.invalid']);
  assert.equal(s.realPeers,null);
  assert.equal(s.peerOwnershipVerified,false);
  assert.equal(s.candidateRoomIDsAreNotProviderPeerIDs,true);
  assert.equal(s.requireW24PeerProof,true);
  assert.equal(s.canSend,false);
});
test('native room space missing is unknown, not zero verified contacts',async()=>{
  const s=await readNativePeerHints('valid-matrix-token',{fetchImpl:upstream({logins:[{
    id:'native-login',name:'Meta',state:{state_event:'CONNECTED'}}]})});
  assert.equal(s.accounts[0].state,'MATRIX_ACCOUNT_SPACE_UNAVAILABLE');
  assert.equal(s.accounts[0].roomHints,null);
  assert.equal(s.realPeers,null);
});

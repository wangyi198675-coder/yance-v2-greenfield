import test from 'node:test';
import assert from 'node:assert/strict';
import {createBridgeStatusServer} from './bridge-http.mjs';

let PORT=29323,BASE='http://127.0.0.1:'+PORT+'/api/v2/providers/fb-personal';
function server(provider={}) {
  return createBridgeStatusServer({port:PORT,installed:()=>true,probe:async()=>({
    channel:'FB_PERSONAL',binaryIntegrity:'OFFICIAL_SHA_VERIFIED',
    bridgeState:'RUNNING_OFFICIAL_APP_SERVICE_REGISTERED',bridgeBotProfileVerified:true,
    realAccountState:'WAITING_USER_AUTH',canSend:false}),
    provider:{
      readNativeAccountStatus: async token=>({matrixPrincipal:'@owner:yance-w26.invalid',
        realAccountState:'WAITING_USER_AUTH',accountCount:0,
        actualUpstreamTokenProvided:token==='matrix-user-token',canSend:false}),
      readNativeLoginFlows: async()=>({flows:[{id:'messenger-lite',name:'Messenger iOS'}],canSend:false}),
      revokeNativeLogin:async()=>({revoked:true,canSend:false}),
      ...provider
    }});
}
async function withServer(fn,provider){
  // Separate ports prevent a Windows Undici keepalive socket from surviving server.close().
  PORT+=1;BASE='http://127.0.0.1:'+PORT+'/api/v2/providers/fb-personal';
  const s=server(provider);await new Promise(r=>s.listen(PORT,'127.0.0.1',r));
  try{await fn();}finally{await new Promise(r=>s.close(r));}
}
test('user-click route is an actual upstream-manager deep link, not external docs-only',async()=>{
  await withServer(async()=>{
    const r=await fetch(BASE+'/connect');
    assert.equal(r.status,200);
    const html=await r.text();
    assert.match(html,/href="mautrix-manager:\/\/open\/"/);
    assert.match(html,/127\.0\.0\.1:29319/);
    assert.doesNotMatch(html,/fake-qr|base64-qr/i);
    const setup=await (await fetch(BASE+'/setup')).json();
    assert.equal(setup.action,'OPEN_NATIVE_MANAGER');
    assert.equal(setup.nextUserClick,'mautrix-manager://open/');
    assert.equal(setup.authorizedSocialAccount,'MATRIX_AUTH_REQUIRED');
    assert.equal(setup.canSend,false);
  });
});
test('without Matrix token the real account & login-flow API fails closed',async()=>{
  await withServer(async()=>{
    let r=await fetch(BASE+'/account/status');assert.equal(r.status,401);
    r=await fetch(BASE+'/auth/flows');assert.equal(r.status,401);
    r=await fetch(BASE+'/auth/revoke',{method:'POST'});assert.equal(r.status,409);
    r=await fetch(BASE+'/status',{method:'POST'});assert.equal(r.status,403);
  });
});
test('read account and login flows are authenticated and never grant W25 authority',async()=>{
  await withServer(async()=>{
    const auth={Authorization:'Bearer matrix-user-token'};
    const r=await fetch(BASE+'/account/status',{headers:auth});
    assert.equal(r.status,200);const j=await r.json();
    assert.equal(j.actualUpstreamTokenProvided,true);
    assert.equal(j.accountCount,0);
    assert.equal(j.canSend,false);
    const flows=await (await fetch(BASE+'/auth/flows',{headers:auth})).json();
    assert.equal(flows.flows[0].id,'messenger-lite');
  });
});
test('cross origin, wrong Host and malformed query denied; deliberate stub revocation calls owner port',async()=>{
  await withServer(async()=>{
    const wrongOrigin=await fetch(BASE+'/status',{headers:{Origin:'https://evil.example'}});
    assert.equal(wrongOrigin.status,403);
    const query=await fetch(BASE+'/setup?logout=true');
    assert.equal(query.status,422);
    const revoke=await fetch(BASE+'/auth/revoke',{method:'POST',
      headers:{Authorization:'Bearer matrix-user-token','X-Yance-User-Intent':'REVOKE_THIS_FACEBOOK_LOGIN',
        'Content-Type':'application/json'},
      body:JSON.stringify({loginId:'fb.1'})});
    assert.equal(revoke.status,200); // Dependency injection only, native W24 fence tested separately.
    const {request}=await import('node:http');
    const status=await new Promise((resolve,reject)=>{
      const req=request({hostname:'127.0.0.1',port:PORT,path:'/health',agent:false,
        headers:{Host:'attacker.net'}},res=>{res.resume();resolve(res.statusCode)});
      req.on('error',reject);req.end();
    });
    assert.equal(status,403);
  });
});

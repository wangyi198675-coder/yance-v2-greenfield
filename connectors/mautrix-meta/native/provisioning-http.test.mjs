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
    // Local browser form POST must carry same-origin Origin. A global
    // no-referrer policy was making Chromium/Opera send Origin:null.
    assert.equal(r.headers.get('referrer-policy'),'same-origin');
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

test('ChatGPT utm_source on user-clicked public auth entry redirects to canonical, then renders real manager launch',async()=>{
  await withServer(async()=>{
    let r=await fetch(BASE+'/connect?utm_source=chatgpt.com',{redirect:'manual'});
    assert.equal(r.status,302);
    assert.equal(r.headers.get('location'),'/api/v2/providers/fb-personal/connect');
    assert.equal(r.headers.get('cache-control'),'no-store');
    r=await fetch(BASE+'/connect?utm_source=chatgpt.com');
    assert.equal(r.status,200);
    const html=await r.text();
    assert.match(html,/href="mautrix-manager:\/\/open\/"/);
    assert.equal(new URL(r.url).search,'');
    r=await fetch(BASE+'/setup?utm_source=chatgpt.com');
    assert.equal(r.status,200);
    const setup=await r.json();
    assert.equal(setup.action,'OPEN_NATIVE_MANAGER');
  });
});
test('only benign bounded UTM on public entry can be stripped; authenticated routes and unknown query stay rejected',async()=>{
  await withServer(async()=>{
    for(const suffix of ['?utm_source=chatgpt.com&next=https://evil.test',
      '?logout=true','?token=not-a-real-token','?utm_source='+('A'.repeat(121))]){
      const r=await fetch(BASE+'/connect'+suffix,{redirect:'manual'});
      assert.equal(r.status,422);
    }
    const userRoute=await fetch(BASE+'/account/status?utm_source=chatgpt.com',{
      headers:{Authorization:'Bearer matrix-user-token'},redirect:'manual'});
    assert.equal(userRoute.status,422);
    const revokeRoute=await fetch(BASE+'/auth/revoke?utm_source=chatgpt.com',{
      method:'POST',redirect:'manual',headers:{Authorization:'Bearer matrix-user-token',
        'X-Yance-User-Intent':'REVOKE_THIS_FACEBOOK_LOGIN',
        'Content-Type':'application/json'},body:'{}'});
    assert.equal(revokeRoute.status,422);
  });
});

test('one-time local user form POST launches fixed upstream GUI and returns visible result',async()=>{
  let launches=0;
  PORT++;BASE='http://127.0.0.1:'+PORT+'/api/v2/providers/fb-personal';
  const s=createBridgeStatusServer({port:PORT,installed:()=>true,
    launcher:async()=>{launches++;return {launched:true,foregroundVerified:true}},
    probe:async()=>({realAccountState:'WAITING_USER_AUTH',canSend:false})});
  await new Promise(r=>s.listen(PORT,'127.0.0.1',r));
  try{
    const page=await (await fetch(BASE+'/connect')).text();
    const match=page.match(/name="ticket" value="([a-f0-9]{48})"/);
    assert.ok(match,'page must provide a one-time unguessable launch ticket');
    assert.match(page,/method="post" action="\/api\/v2\/providers\/fb-personal\/launch-manager"/);
    assert.equal(launches,0,'visiting page alone must never launch the GUI');
    const submit=()=>fetch(BASE+'/launch-manager',{method:'POST',
      headers:{Origin:'http://127.0.0.1:'+PORT,
        'Content-Type':'application/x-www-form-urlencoded',
        'Sec-Fetch-Site':'same-origin'},
      body:'ticket='+match[1]});
    const result=await submit();assert.equal(result.status,200);
    assert.match(await result.text(),/官方mautrix-manager已启动/);
    assert.equal(launches,1);
    const replay=await submit();assert.equal(replay.status,403);
    assert.equal(launches,1);
  }finally{await new Promise(r=>s.close(r))}
});
test('refuse cross-origin, missing user ticket, GET and untrusted launch requests',async()=>{
  let launches=0;
  PORT++;BASE='http://127.0.0.1:'+PORT+'/api/v2/providers/fb-personal';
  const s=createBridgeStatusServer({port:PORT,installed:()=>true,
    launcher:async()=>{launches++;return {launched:true,foregroundVerified:true}}});
  await new Promise(r=>s.listen(PORT,'127.0.0.1',r));
  try{
    const page=await (await fetch(BASE+'/connect')).text();
    const token=page.match(/name="ticket" value="([a-f0-9]{48})"/)[1];
    const post=(origin,body,extra={})=>fetch(BASE+'/launch-manager',{
      method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded',...extra},
      body});
    let r=await post('https://evil.example','ticket='+token);
    assert.equal(r.status,403);
    // Never solve the Opera regression by simply permitting null Origin.
    r=await post('null','ticket='+token,{'Sec-Fetch-Site':'same-origin'});
    assert.equal(r.status,403);
    r=await post('http://127.0.0.1:'+PORT,'ticket='+token,
      {'Sec-Fetch-Site':'cross-site'});
    assert.equal(r.status,403);
    r=await post('http://127.0.0.1:'+PORT,'ticket=bad');
    assert.equal(r.status,403);
    r=await post('http://127.0.0.1:'+PORT,'ticket='+token+'&action=login');
    assert.equal(r.status,403);
    r=await fetch(BASE+'/launch-manager');assert.equal(r.status,404);
    assert.equal(launches,0);
    // A rejected cross-origin attempt must not consume a legitimate user ticket.
    r=await post('http://127.0.0.1:'+PORT,'ticket='+token,
      {'Sec-Fetch-Site':'same-origin'});
    assert.equal(r.status,200);assert.equal(launches,1);
  }finally{await new Promise(r=>s.close(r))}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectRealBridge,assertNoRealAccountElevation} from '../native/bridge-runtime.mjs';
import {createBridgeStatusServer} from '../native/bridge-http.mjs';
test('official binary is actually installed with pinned upstream commit and hash',async()=>{
  const status=await inspectRealBridge();
  assert.equal(status.binaryIntegrity,'OFFICIAL_SHA_VERIFIED');
  assert.equal(status.runtimeCommit,'3c16226686c71af64df294df0803791685064e0b');
  assert.equal(status.runtimeVersion,'v26.10');
  assertNoRealAccountElevation(status);
});
test('probe refuses to invent actual Messenger contacts and outbound authority',async()=>{
  const state=await inspectRealBridge();
  assert.equal(state.realAccountState,'WAITING_USER_AUTH');
  assert.equal(state.accountIdentityVerified,false);
  assert.equal(state.accountCount,null);
  assert.equal(state.realContacts,null);
  assert.equal(state.canSend,false);
});
test('actual local API returns only verifiable process state and setup instructions',async()=>{
  const server=createBridgeStatusServer({port:29322});await new Promise(r=>server.listen(29322,'127.0.0.1',r));
  try{
    let r=await fetch('http://127.0.0.1:29322/api/v2/providers/fb-personal/status');
    assert.equal(r.status,200);
    let j=await r.json();
    assert.equal(j.channel,'FB_PERSONAL');
    assert.equal(j.binaryIntegrity,'OFFICIAL_SHA_VERIFIED');
    assert.equal(j.realAccountState,'WAITING_USER_AUTH');
    assert.equal(j.canSend,false);
    r=await fetch('http://127.0.0.1:29322/api/v2/providers/fb-personal/setup');
    j=await r.json();
    assert.equal(r.status,200);
    assert.equal(j.canSend,false);
    assert.match(j.officialAuthentication,/docs\.mau\.fi/);
    r=await fetch('http://127.0.0.1:29322/not-real');
    assert.equal(r.status,404);
  } finally {await new Promise(r=>server.close(r));}
});
test('untrusted HTTP host and effectful POST cannot obtain any authority',async()=>{
  const server=createBridgeStatusServer({port:29322});await new Promise(r=>server.listen(29322,'127.0.0.1',r));
  try {
    const {request}=await import('node:http');
    const attempt=(method,host)=>new Promise((resolve,reject)=>{
      const bad=request({hostname:'127.0.0.1',port:29322,
        path:'/api/v2/providers/fb-personal/status',method,agent:false,
        headers:{Host:host}}, resp=>{resp.resume();resolve(resp.statusCode)});
      bad.once('error',reject);bad.end();
    });
    // Do not reuse Undici's keepalive socket across independent test servers.
    assert.equal(await attempt('POST','127.0.0.1:29322'),403);
    assert.equal(await attempt('GET','evil.example'),403);
  } finally {await new Promise(r=>server.close(r));}
});

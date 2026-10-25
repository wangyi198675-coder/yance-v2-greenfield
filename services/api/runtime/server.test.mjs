import test from 'node:test';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:47182';
const request=async(path,init)=>{const response=await fetch(base+path,init);
 const body=await response.json();return {status:response.status,body,response}};
test('health and version are real and fail-closed',async()=>{
 const h=await request('/api/v2/runtime/health');
 assert.equal(h.status,200);assert.match(h.body.runtimeSha,/^[a-f0-9]{40}$/);
 assert.equal(h.body.trustedSession,false);assert.equal(h.body.canSend,false);
 assert.equal(h.body.externalEffects,false);
 const v=await request('/api/v2/runtime/version');assert.equal(v.body.apiGitSha,h.body.runtimeSha);
});
test('current real contacts are empty, never W37 fixtures',async()=>{
 const {status,body}=await request('/api/v2/contacts');
 assert.equal(status,200);assert.equal(body.authoritative,true);
 assert.deepEqual(body.contacts,[]);assert.equal(body.connectedAccountCount,0);
});
test('W24 and W44 cannot mutate or forge an authorization',async()=>{
 for(const path of ['/api/v2/managed-stop','/api/v2/identity-consent/takeover']){
  const {status,body}=await request(path,{method:'POST',
   headers:{'content-type':'application/json','Origin':'http://127.0.0.1:4399'},
   body:JSON.stringify({actor:'fake-owner-1',scope:'GLOBAL',authorized:true})});
  assert.equal(status,401);assert.equal(body.canSend,false);
 }
});
test('cross-origin local website cannot read or cause operations',async()=>{
 for(const method of ['GET','POST']){
  const {status}=await request('/api/v2/runtime/health',{
   method,headers:{Origin:'https://evil.example','Sec-Fetch-Site':'cross-site'}});
  assert.equal(status,403);
 }
});
test('synthetic fixture endpoints cannot leak into run',async()=>{
 const x=await request('/w46-native-test/message');
 assert.equal(x.status,410);
 const d=await request('/api/v2/messages');
 assert.equal(d.status,401);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createFbPageNativeStatusHttp} from './fb-page-native-status-http.mjs';
const origin='http://127.0.0.1:44751';
function fixture({authorized=true,configured=true,revoked=false,revision=5,secretLeak='LEAK_SENTINEL'}={}){
 let reads=0;
 const auth={sessionFor:()=>authorized?{record:{kind:'WEB_LOCAL_PRIVATE'}}:null};
 const custody={
  async status(){return {ok:true,provider:'PANCAKE_PAIR',configured,revoked,revision}},
  async withCredentials(cb){reads++;return cb({userAccessToken:secretLeak,pages:{'12345':secretLeak}},revision)}
 };
 const route=createFbPageNativeStatusHttp({sessionAuthority:auth,webOrigin:origin,custody});
 async function call({method='GET',site='same-origin',requestOrigin=origin,search=''}={}){
  const req={method,headers:{origin:requestOrigin,'sec-fetch-site':site}};
  let status,body;
  const res={writeHead(s){status=s},end(content){body=JSON.parse(content)}};
  await route(req,res,new URL('http://127.0.0.1:49417/api/v2/providers/fb-page/native/status'+search));
  return {status,body};
 }
 return {call,reads:()=>reads};
}
test('current W55 Page credential readback reports no W24 or send capability',async()=>{
 const f=fixture();
 const {status,body}=await f.call();
 assert.equal(status,200);
 assert.equal(body.status,'PAGE_TOKENS_STORED_W24_BINDING_REQUIRED');
 assert.equal(body.storedPageCount,1);
 assert.equal(body.credentialRevision,5);
 assert.equal(body.accountVerified,true);
 assert.equal(body.w24CurrentKVerified,false);
 assert.equal(body.w25InboundConnected,false);
 assert.equal(body.canSend,false);
 assert.equal(f.reads(),1);
 assert.equal(JSON.stringify(body).includes('LEAK_SENTINEL'),false);
 assert.equal(JSON.stringify(body).includes('12345'),false);
});
test('no session, foreign origin and CSRF-cross-site cannot see account metadata',async()=>{
 const f=fixture({authorized:false});
 assert.equal((await f.call()).status,401);
 assert.equal(f.reads(),0);
 const g=fixture();
 assert.equal((await g.call({requestOrigin:'https://evil.example'})).status,403);
 assert.equal((await g.call({site:'cross-site'})).status,403);
 assert.equal((await g.call({search:'?page=123'})).status,403);
 assert.equal(g.reads(),0);
});
test('revoked account stays unconfigured and does not lease native credentials',async()=>{
 const f=fixture({revoked:true,configured:false});
 const {status,body}=await f.call();
 assert.equal(status,200);
 assert.equal(body.accountVerified,false);
 assert.equal(body.credentialRevoked,true);
 assert.equal(body.w24CurrentKVerified,false);
 assert.equal(f.reads(),0);
});
test('version rotation between W55 status and lease fails closed',async()=>{
 const sessionAuthority={sessionFor:()=>({record:{kind:'WEB_LOCAL_PRIVATE'}})};
 const custody={status:async()=>({ok:true,revision:5,configured:true,revoked:false}),
  withCredentials:async cb=>cb({pages:{'12345':'fake'}},6)};
 const route=createFbPageNativeStatusHttp({sessionAuthority,webOrigin:origin,custody});
 let status,body;
 await route({method:'GET',headers:{origin,'sec-fetch-site':'same-origin'}},
  {writeHead(x){status=x},end(v){body=JSON.parse(v)}},
  new URL('http://127.0.0.1:49417/api/v2/providers/fb-page/native/status'));
 assert.equal(status,409);
 assert.equal(body.error,'STALE_W55_REVISION');
 assert.equal(body.canSend,false);
});

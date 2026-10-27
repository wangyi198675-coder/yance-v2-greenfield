import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {createLocalSessionAuthority} from './local-session.mjs';
import {createNativeFbPageAuthorizationHttp,makeOriginalW27NativeInvoker} from './native-fb-page-authorization-http.mjs';

const principal={verified:true,source:'W54_NATIVE_CURRENT_USER',
 principalRef:'trusted-principal-w27',installationRef:'original-w54-install',
 revocationGeneration:3};
async function fixture({withPorts=true,changePrincipal=false,revokeSession=false,withVault=false}={}){
 const sessionAuthority=createLocalSessionAuthority();
 const origin='http://127.0.0.1:44767';
 let calls=0;
 const h=createNativeFbPageAuthorizationHttp({
  sessionAuthority,webOrigin:origin,
  enrollW55PancakeCredentials:withVault?async ({userAccessToken,pagePublicApiToken})=>{
   assert.equal(userAccessToken,'fake-user-token-12345');
   assert.equal(pagePublicApiToken,'fake-page-token-12345');
   return {stored:true,source:'W55_OS_PROTECTED_CURRENT_USER'};
  }:null,
  resolveW54Principal:withPorts?async()=>{
   if(changePrincipal&&calls)return {...principal,revocationGeneration:4};
   return principal;
  }:null,
  invokeW27NativeAuthorization:withPorts?async({action,principal:p,body})=>{
   calls++;assert.equal(p.principalRef,principal.principalRef);
   if(revokeSession)sessionAuthority.revokeAll();
   if(action==='beginAuthorization')return {status:'WAITING_USER_AUTH',entryAvailable:true,canSend:false};
   if(action==='listVerifiedPageChoices')return {
    status:'PAGE_SELECTION_REQUIRED',pages:[{providerPageId:'1234',name:'Owned Page'}],canSend:false};
   if(action==='confirmPageBinding'){
    assert.equal(body.selectedProviderPageId,'1234');
    return {status:'AUTHORIZED_READ_ONLY',providerPageId:'1234',
      bindingRevision:6,identityVerified:true,canSend:false};
   }
   if(action==='revokeAuthorization')return {status:'REVOKED',canSend:false};
   return {status:'AUTHORIZED_READ_ONLY',canSend:false};
  }:null
 });
 const server=createServer((req,res)=>{
  void h(req,res,new URL(req.url,'http://127.0.0.1')).then(handled=>{
   if(!handled){res.writeHead(404);res.end('{}')}
  }).catch(()=>{res.writeHead(503);res.end('{}')});
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const uri='http://127.0.0.1:'+server.address().port;
 const proof=sessionAuthority.issueNativeWebView(randomBytes(32).toString('hex'));
 const cookie=proof.cookie.split(';')[0];
 return {sessionAuthority,get calls(){return calls},
  cookie,csrf:proof.csrf,
  async send(op='start',{method='POST',originHeader=origin,
    site='same-origin',csrf=proof.csrf,body='{}',cookieHeader=cookie}={}){
   const headers={
    origin:originHeader,'sec-fetch-site':site,'content-type':'application/json',
    'x-yance-csrf':csrf,Cookie:cookieHeader
   };
   const res=await fetch(uri+'/api/v2/providers/fb-page/authorization/'+op,{
    method,headers,...(method==='POST'?{body}:{}),redirect:'manual'
   });
   return {status:res.status,body:await res.json(),headers:res.headers};
  },
  async close(){server.close();await once(server,'close')}
 };
}
test('original W54 first-party action actually invokes W27 START only for trusted user',async()=>{
 const f=await fixture();
 try{
  const r=await f.send('start');
  assert.equal(r.status,200);assert.equal(r.body.status,'WAITING_USER_AUTH');
  assert.equal(r.body.entryAvailable,true);assert.equal(r.body.canSend,false);
  assert.equal(f.calls,1);
  assert.equal(r.headers.get('cache-control'),'no-store');
 }finally{await f.close()}
});
test('actual page list and confirmed original W24 binding return read-only identity',async()=>{
 const f=await fixture();
 try{
  let r=await f.send('pages');
  assert.equal(r.body.status,'PAGE_SELECTION_REQUIRED');
  assert.deepEqual(r.body.pages,[{providerPageId:'1234',name:'Owned Page',platform:null}]);
  r=await f.send('bind',{body:JSON.stringify({selectedProviderPageId:'1234'})});
  assert.equal(r.body.status,'AUTHORIZED_READ_ONLY');
  assert.equal(r.body.bindingRevision,6);assert.equal(r.body.canSend,false);
 }finally{await f.close()}
});
test('no original W27/W54 owner callback always 503, never claims authorization',async()=>{
 const f=await fixture({withPorts:false});
 try{const r=await f.send();assert.equal(r.status,503);
  assert.equal(r.body.error,'W27_W54_NATIVE_AUTH_NOT_CONNECTED');
  assert.equal(f.calls,0);
 }finally{await f.close()}
});
test('no cookie, wrong origin, wrong csrf and cross-site all fail before calling W27',async()=>{
 const f=await fixture();
 try{
  assert.equal((await f.send('start',{cookieHeader:''})).status,401);
  assert.equal((await f.send('start',{originHeader:'https://attacker.test'})).status,403);
  assert.equal((await f.send('start',{csrf:'0'.repeat(64)})).status,403);
  assert.equal((await f.send('start',{site:'cross-site'})).status,403);
  assert.equal(f.calls,0);
 }finally{await f.close()}
});
test('GET never starts authorization or opens official external website',async()=>{
 const f=await fixture();
 try{const r=await f.send('start',{method:'GET'});
  assert.equal(r.status,405);assert.equal(f.calls,0);
 }finally{await f.close()}
});
test('unknown action, wrong binding identity and forged extra arguments rejected',async()=>{
 const f=await fixture();
 try{
  assert.equal((await f.send('start',{body:JSON.stringify({token:'never'})})).status,422);
  assert.equal((await f.send('bind',{body:JSON.stringify({selectedProviderPageId:'../secret'})})).status,422);
  assert.equal((await f.send('bind',{body:JSON.stringify({selectedProviderPageId:'1234',admin:true})})).status,422);
  assert.equal(f.calls,0);
 }finally{await f.close()}
});
test('revoked W54 session or principal during native Page action never returns success',async()=>{
 for(const opts of [{revokeSession:true},{changePrincipal:true}]){
  const f=await fixture(opts);
  try{const r=await f.send();
   assert.equal(r.status,409);
   assert.equal(r.body.canSend,false);
  }finally{await f.close()}
 }
});

test('adapter invokes only original W27 Owner methods, not a new authorization system',async()=>{
 const calls=[];
 const original={
  beginAuthorization:async()=>{calls.push('START');return {status:'WAITING_USER_AUTH'}},
  listVerifiedPageChoices:async()=>{calls.push('PAGES');return {status:'PAGE_SELECTION_REQUIRED'}},
  confirmPageBinding:async data=>{calls.push('BIND:'+data.selectedProviderPageId);return {status:'AUTHORIZED_READ_ONLY'}},
  connectionStatus:async options=>{calls.push('STATUS:'+options.refreshProvider);return {status:'AUTHORIZED_READ_ONLY'}},
  revokeAuthorization:async()=>{calls.push('REVOKE');return {status:'REVOKED'}}
 };
 const call=makeOriginalW27NativeInvoker(original);
 await call({action:'beginAuthorization'});
 await call({action:'listVerifiedPageChoices'});
 await call({action:'confirmPageBinding',body:{selectedProviderPageId:'9988'}});
 await call({action:'connectionStatus'});
 await call({action:'revokeAuthorization'});
 assert.deepEqual(calls,['START','PAGES','BIND:9988','STATUS:true','REVOKE']);
 await assert.rejects(call({action:'sendMessage'}),/W27_ORIGINAL_ACTION_NOT_ALLOWED/);
});

test('Web-first owner capability GET is read-only and truthful without W54/W55 system setup',async()=>{
 const disabled=await fixture({withPorts:false});
 try{
  const response=await disabled.send('capabilities',{method:'GET',cookieHeader:''});
  assert.equal(response.status,200);
  assert.equal(response.body.channel,'FB_PAGE');
  assert.equal(response.body.ownerPortConnected,false);
  assert.equal(response.body.canSend,false);
  assert.equal(disabled.calls,0);
 }finally{await disabled.close()}
 const enabled=await fixture();
 try{
  const response=await enabled.send('capabilities',{method:'GET'});
  assert.equal(response.status,200);
  assert.equal(response.body.ownerPortConnected,true);
  assert.equal(enabled.calls,0);
 }finally{await enabled.close()}
});
test('Web-first read-only readiness never lets a missing owner port forge a successful grant',async()=>{
 const f=await fixture({withPorts:false});
 try{
  const caps=await f.send('capabilities',{method:'GET'});
  assert.equal(caps.body.ownerPortConnected,false);
  const result=await f.send('start');
  assert.equal(result.status,503);
  assert.equal(result.body.canSend,false);
 }finally{await f.close()}
});

test('old one-Page credential route is retired, no secret can be saved',async()=>{
 const f=await fixture({withPorts:false});
 try{
  const r=await f.send('configure',{body:JSON.stringify({pageId:'111',pagePublicApiToken:'NEVER-SAVE-TOKEN'})});
  assert.equal(r.status,410);
  assert.equal(r.body.error,'USE_OFFICIAL_MULTI_PAGE_ONBOARDING');
  assert.equal(f.calls,0);
 }finally{await f.close()}
});
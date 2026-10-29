import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {createLocalSessionAuthority,createLocalSessionHttpApi} from './local-session.mjs';

const origin='http://127.0.0.1:49081';
async function listening(authority,{enableWebPrivate=false}={}){
 const handle=createLocalSessionHttpApi({authority,webOrigin:origin,enableWebPrivate});
 const server=createServer(async(req,res)=>{
  try{await handle(req,res,new URL(req.url,'http://127.0.0.1'))}
  catch{res.writeHead(503);res.end('{}')}
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 return {base:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(ok=>server.close(ok))};
}
async function http(base,path,{cookie,csrf,method='GET',body,originHeader=origin,type='application/json'}={}){
 const headers={};
 if(originHeader!==null)headers.Origin=originHeader;
 if(cookie)headers.Cookie=cookie;
 if(csrf)headers['X-Yance-CSRF']=csrf;
 if(body!==undefined)headers['Content-Type']=type;
 const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status,headers:r.headers,json:await r.json()};
}
const status='/api/v2/local-session/status',redeem='/api/v2/local-session/redeem',
 logout='/api/v2/local-session/logout';

test('production default has no trusted native issuer; forged code and cookies cannot grant session',async()=>{
 const api=await listening(createLocalSessionAuthority());
 try{
  const code=randomBytes(32).toString('hex');
  const guest=await http(api.base,status);
  assert.equal(guest.status,200);assert.equal(guest.json.paired,false);
  assert.equal(guest.json.authorized,false);
  assert.equal(guest.json.canSend,false);
  const forged=await http(api.base,status,{cookie:'yance_local_session='+code});
  assert.equal(forged.json.paired,false);
  const blocked=await http(api.base,redeem,{method:'POST',body:{pairingCode:code}});
  assert.equal(blocked.status,503);assert.equal(blocked.json.error,'TRUSTED_NATIVE_PAIRING_NOT_AVAILABLE');
  assert.equal((await http(api.base,logout,{method:'POST',cookie:'yance_local_session='+code,
    csrf:code,body:{}})).status,401);
  assert.equal((await http(api.base,redeem,{method:'POST',body:{pairingCode:code},originHeader:null})).status,403);
  assert.equal((await http(api.base,redeem,{method:'POST',body:{pairingCode:code},
    originHeader:'https://evil.example'})).status,403);
 }finally{await api.close()}
});

test('synthetic TEST ONLY server-injected issuer: one-use approval, CSRF, logout and replay prevention',async()=>{
 let time=10_000;
 const code=randomBytes(32).toString('hex');
 const grants=new Set([code]);
 const authority=createLocalSessionAuthority({now:()=>time,ttlMs:30_000,
   approvePairing:async received=>{
     if(!grants.delete(received))return false;
     return true; // deliberately synthetic in-process test issuer; never wired into production server
   }});
 const api=await listening(authority);
 try{
  const bad=await http(api.base,redeem,{method:'POST',
    body:{pairingCode:randomBytes(32).toString('hex')}});
  assert.equal(bad.status,401);
  const approved=await http(api.base,redeem,{method:'POST',body:{pairingCode:code}});
  assert.equal(approved.status,200);assert.equal(approved.json.canSend,false);
  assert.equal(approved.json.providerAuthorized,false);
  const rawCookie=approved.headers.get('set-cookie');
  assert.match(rawCookie,/HttpOnly/);assert.match(rawCookie,/SameSite=Strict/);
  const cookie=rawCookie.split(';')[0];
  assert.match(cookie,/yance_local_session=[a-f0-9]{64}/);
  assert.equal((await http(api.base,redeem,{method:'POST',body:{pairingCode:code}})).status,401);
  const current=await http(api.base,status,{cookie});
  assert.equal(current.json.paired,true);
  assert.equal(current.json.authorized,false,'legacy PAIRING does not confer native/private model authority');
  assert.equal(current.json.expiresAt,40_000);
  assert.equal(current.json.csrfToken,approved.json.csrfToken);
  assert.equal((await http(api.base,logout,{method:'POST',cookie,body:{}})).status,403);
  assert.equal((await http(api.base,logout,{method:'POST',cookie,csrf:randomBytes(32).toString('hex'),body:{}})).status,403);
  assert.equal((await http(api.base,logout,{method:'POST',cookie,csrf:current.json.csrfToken,
    originHeader:'https://evil.example',body:{}})).status,403);
  const ended=await http(api.base,logout,{method:'POST',cookie,
    csrf:current.json.csrfToken,body:{}});
  assert.equal(ended.status,200);assert.equal(ended.json.paired,false);
  assert.match(ended.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal((await http(api.base,status,{cookie})).json.paired,false);
  assert.equal((await http(api.base,logout,{method:'POST',cookie,
    csrf:current.json.csrfToken,body:{}})).status,401);
 }finally{await api.close()}
});

test('synthetic TEST ONLY server-side revokeAll and TTL expiry invalidate old sessions and separate instance cookies',async()=>{
 let now=1000;
 const codes=[randomBytes(32).toString('hex'),randomBytes(32).toString('hex')];
 const valid=new Set(codes);
 const authority=createLocalSessionAuthority({
  now:()=>now,ttlMs:1000,approvePairing:async v=>valid.delete(v)
 });
 const other=createLocalSessionAuthority();
 const a=await listening(authority),b=await listening(other);
 try{
  const r1=await http(a.base,redeem,{method:'POST',body:{pairingCode:codes[0]}});
  const cookie1=r1.headers.get('set-cookie').split(';')[0];
  assert.equal((await http(b.base,status,{cookie:cookie1})).json.paired,false);
  authority.revokeAll();
  assert.equal((await http(a.base,status,{cookie:cookie1})).json.paired,false);
  const r2=await http(a.base,redeem,{method:'POST',body:{pairingCode:codes[1]}});
  const cookie2=r2.headers.get('set-cookie').split(';')[0];
  assert.equal((await http(a.base,status,{cookie:cookie2})).json.paired,true);
  now+=1001;
  assert.equal((await http(a.base,status,{cookie:cookie2})).json.paired,false);
  assert.equal((await http(a.base,logout,{method:'POST',cookie:cookie2,
    csrf:r2.json.csrfToken,body:{}})).status,401);
 }finally{await a.close();await b.close()}
});

test('invalid CSRF, JSON and overly large requests fail closed even with synthetic issuer',async()=>{
 const code=randomBytes(32).toString('hex');
 const api=await listening(createLocalSessionAuthority({approvePairing:async x=>x===code}));
 try{
  assert.equal((await http(api.base,redeem,{method:'POST',body:{actor:'admin',pairingCode:code}})).status,422);
  assert.equal((await http(api.base,redeem,{method:'POST',body:{pairingCode:'admin'}})).status,422);
  const issued=await http(api.base,redeem,{method:'POST',body:{pairingCode:code}});
  const cookie=issued.headers.get('set-cookie').split(';')[0];
  assert.equal((await http(api.base,logout,{method:'POST',cookie,
    csrf:issued.json.csrfToken,body:{actor:'admin'}})).status,422);
  const tooBig=await http(api.base,redeem,{method:'POST',body:{pairingCode:'A'.repeat(2500)}});
  assert.equal(tooBig.status,413);
  assert.equal((await http(api.base,status,{cookie})).json.paired,true);
 }finally{await api.close()}
});

test('ordinary signed WEB_LOCAL_PRIVATE grants local model settings only, without social provider authority',async()=>{
 const api=await listening(createLocalSessionAuthority(),{enableWebPrivate:true});
 try{
  const start=await fetch(api.base+'/api/v2/local-session/web-private-start',{
   method:'POST',headers:{Origin:origin,'Sec-Fetch-Site':'same-origin',
    'Content-Type':'application/json'},body:'{}'});
  assert.equal(start.status,200);
  const issued=await start.json();
  assert.equal(issued.sessionKind,'WEB_LOCAL_PRIVATE');
  assert.equal(issued.canSend,false);
  assert.equal(issued.providerAuthorized,false);
  const cookie=start.headers.get('set-cookie').split(';')[0];
  assert.match(cookie,/^yance_web_private_session=[a-f0-9]{64}$/);
  const current=await http(api.base,status,{cookie});
  assert.equal(current.status,200);
  assert.equal(current.json.sessionKind,'WEB_LOCAL_PRIVATE');
  assert.equal(current.json.authorized,true,'real local session authorizes original W46 PRIVATE model settings');
  assert.equal(current.json.paired,true);
  assert.equal(current.json.providerAuthorized,false);
  assert.equal(current.json.canSend,false);
  assert.equal((await http(api.base,status,{cookie:null})).json.authorized,false);
  const csrf=current.json.csrfToken;
  const ended=await http(api.base,logout,{cookie,csrf,method:'POST',body:{}});
  assert.equal(ended.status,200);
  assert.equal((await http(api.base,status,{cookie})).json.authorized,false);
 }finally{await api.close()}
});

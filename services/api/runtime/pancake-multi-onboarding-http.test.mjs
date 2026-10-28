import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {createLocalSessionAuthority} from './local-session.mjs';
import {createPancakeMultiOnboardingHttp} from './pancake-multi-onboarding-http.mjs';
async function fixture({fetchImpl}={}){
 const a=createLocalSessionAuthority(),origin='http://127.0.0.1:44767';
 let stored=null,writes=0,officialCalls=0;
 const proof=a.issueNativeWebView(randomBytes(32).toString('hex'));
 const cookie=proof.cookie.split(';')[0],csrf=proof.csrf;
 const vault={
  withCredentials:async f=>{
   if(!stored)throw Object.assign(new Error('NO_ACCOUNT'),{code:'NO_ACCOUNT',status:401});
   return f(stored);
  },
  saveAccount:async({userAccessToken})=>{
   stored={userAccessToken,pages:{}};writes++;return {stored:true}
  },
  savePage:async({pageId,pagePublicApiToken})=>{
   stored.pages[pageId]=pagePublicApiToken;writes++;return {stored:true}
  }
 };
 const mockFetch=async url=>{
  officialCalls++;
  assert.equal(url.hostname,'pages.fm');
  if(url.pathname==='/api/v1/pages'){
   assert.equal(url.searchParams.get('access_token'),'TEST-ACCOUNT-SYNTHETIC-123');
   return {status:200,headers:new Headers(),text:async()=>JSON.stringify({
    success:true,pages:[{id:'111',name:'A',platform:'FACEBOOK'},
    {id:'222',name:'B',platform:'FACEBOOK'},
    {id:'333',name:'Zalo',platform:'ZALO'}]})};
  }
  if(url.pathname==='/api/public_api/v1/pages/111/users'){
   if(url.searchParams.get('page_access_token')!=='TEST-PAGE-111-SYNTHETIC')
    return {status:401};
   return {status:200,headers:new Headers(),
    text:async()=>JSON.stringify({success:true,users:[]})};
  }
  throw Error('UNEXPECTED_OFFICIAL_API');
 };
 const h=createPancakeMultiOnboardingHttp({
  sessionAuthority:a,webOrigin:origin,custody:vault,fetchImpl:fetchImpl||mockFetch
 });
 const server=createServer((req,res)=>void h(req,res,
    new URL(req.url,'http://127.0.0.1')).then(ok=>{
     if(!ok){res.writeHead(404);res.end('{}')}
    }));
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const root='http://127.0.0.1:'+server.address().port;
 return {get writes(){return writes},get officialCalls(){return officialCalls},
  get stored(){return stored},
  async request(path,{method='GET',body,csrfValue=csrf,originValue=origin}={}){
   const res=await fetch(root+'/api/v2/providers/fb-page/onboarding/'+path,{
    method,headers:{Origin:originValue,'sec-fetch-site':'same-origin',
     'content-type':'application/json','x-yance-csrf':csrfValue,Cookie:cookie},
    ...(method==='POST'?{body:JSON.stringify(body)}:{})
   });
   return {status:res.status,body:await res.json()};
  },
  async close(){server.close();await once(server,'close')}
 };
}
test('original W55 one account discovers FB Page A+B, never Zalo or synthetic messages',async()=>{
 const f=await fixture();
 try{
  const r=await f.request('account',{method:'POST',
   body:{userAccessToken:'TEST-ACCOUNT-SYNTHETIC-123'}});
  assert.equal(r.status,200);assert.equal(r.body.pages.length,2);
  assert.equal(r.body.status,'OFFICIAL_ACCOUNT_DISCOVERED');
  assert.equal(r.body.canSend,false);
  assert.equal(f.writes,1);
  const pages=await f.request('pages');
  assert.deepEqual(pages.body.pages.map(x=>x.pageId),['111','222']);
  assert.equal(pages.body.pages[0].state,'PAGE_TOKEN_REQUIRED');
  assert.equal(JSON.stringify(r.body).includes('TEST-ACCOUNT'),false);
 }finally{await f.close()}
});
test('official categorized pages activated/inactivated/hidden supported; nopermission never grants Page access',async()=>{
 const f=await fixture({fetchImpl:async url=>{
  assert.equal(url.pathname,'/api/v1/pages');
  return {status:200,headers:new Headers(),text:async()=>JSON.stringify({success:true,
   pages:{
    activated:[{id:'111',name:'Alpha',platform:'FACEBOOK'},
      {id:'333',name:'Zalo',platform:'ZALO'}],
    inactivated:[{id:'222',name:'Beta',platform:'FACEBOOK'}],
    hidden:[{id:'444',name:'Hidden',platform:'FACEBOOK'}],
    nopermission:[{id:'555',name:'Denied',platform:'FACEBOOK'}],
    activated_page_ids:['111','333']
   }})};
 }});
 try{
  const saved=await f.request('account',{method:'POST',body:{userAccessToken:'FAKE_ACCOUNT_USER_1234'}});
  assert.equal(saved.status,200);
  assert.deepEqual(saved.body.pages.map(x=>x.pageId),['111','222','444']);
  assert.equal(f.writes,1);
  const after=await f.request('pages');
  assert.equal(after.status,200);
  assert.deepEqual(after.body.pages.map(x=>x.pageId),['111','222','444']);
  assert.equal(JSON.stringify(after.body).includes('Denied'),false);
  assert.equal(JSON.stringify(after.body).includes('FAKE_ACCOUNT_USER'),false);
 }finally{await f.close()}
});
test('official nested/category maps preserve IDs and never grant nopermission',async()=>{
 const f=await fixture({fetchImpl:async()=>({
  status:200,headers:new Headers(),text:async()=>JSON.stringify({success:true,
   pages:{activated:{'111':{name:'Mapped',platform:'FACEBOOK'}},
    inactivated:{data:[{id:'222',name:'Nested',platform:'FACEBOOK'}]},
    hidden:{pages:{'333':{name:'Hidden',platform:'FACEBOOK'}}},
    nopermission:{'444':{name:'Unauthorized',platform:'FACEBOOK'}}
   }})
 })});
 try{
  const r=await f.request('account',{method:'POST',body:{userAccessToken:'FAKE_ACCOUNT_USER_1234'}});
  assert.equal(r.status,200);
  assert.deepEqual(r.body.pages.map(p=>p.pageId),['111','222','333']);
  assert.equal(f.writes,1);
  assert.equal(JSON.stringify(r.body).includes('Unauthorized'),false);
 }finally{await f.close()}
});
test('long authentic-shaped User token within W55 WinCred bound passes account API, no secret returned',async()=>{
 const long='FAKE_LONG_ACCOUNT_USER_TOKEN_'+('a'.repeat(1450));
 const f=await fixture({fetchImpl:async url=>{
  assert.equal(url.searchParams.get('access_token'),long);
  return {status:200,headers:new Headers(),text:async()=>JSON.stringify({
   success:true,pages:{activated:[{id:'1234567',name:'Long Token Page',platform:'FACEBOOK'}]}
  })};
 }});
 try{
  const r=await f.request('account',{method:'POST',body:{userAccessToken:long}});
  assert.equal(r.status,200);assert.equal(f.writes,1);
  assert.deepEqual(r.body.pages.map(p=>p.pageId),['1234567']);
  assert.equal(JSON.stringify(r.body).includes(long),false);
 }finally{await f.close()}
});
test('malformed categorized response is not treated as confirmed authorized account and never stores',async()=>{
 const f=await fixture({fetchImpl:async()=>({
  status:200,headers:new Headers(),text:async()=>JSON.stringify({success:true,
   pages:{activated:{bogus:{id:'111'}},nopermission:[{id:'888'}]}})
 })});
 try{
  const r=await f.request('account',{method:'POST',body:{userAccessToken:'FAKE_ACCOUNT_USER_1234'}});
  assert.equal(r.status,502);
  assert.equal(r.body.error,'PANCAKE_ACCOUNT_PAGES_INVALID');
  assert.equal(f.writes,0);
 }finally{await f.close()}
});
test('Page token verifies only owned Page, independently stored, never returns secrets',async()=>{
 const f=await fixture();
 try{
  await f.request('account',{method:'POST',
   body:{userAccessToken:'TEST-ACCOUNT-SYNTHETIC-123'}});
  let r=await f.request('page-token',{method:'POST',
   body:{pageId:'111',pageAccessToken:'TEST-PAGE-111-SYNTHETIC'}});
  assert.equal(r.status,200);assert.equal(r.body.status,'PAGE_API_CONNECTED_READ_ONLY');
  assert.equal(r.body.currentW24PeerBinding,false);
  assert.equal(f.stored.pages['111'],'TEST-PAGE-111-SYNTHETIC');
  assert.equal(f.stored.pages['222'],undefined);
  r=await f.request('pages');
  assert.equal(r.body.pages[0].tokenConfigured,true);
  assert.equal(r.body.pages[1].tokenConfigured,false);
  assert.equal(JSON.stringify(r.body).includes('TEST-PAGE-111'),false);
  const invalid=await f.request('page-token',{method:'POST',
   body:{pageId:'333',pageAccessToken:'TEST-PAGE-333-SYNTHETIC'}});
  assert.equal(invalid.status,403);
 }finally{await f.close()}
});
test('forged origin/CSRF and unauthorized page cannot store credential',async()=>{
 const f=await fixture();
 try{
  let r=await f.request('account',{method:'POST',
   originValue:'https://evil.invalid',
   body:{userAccessToken:'TEST-ACCOUNT-SYNTHETIC-123'}});
  assert.equal(r.status,403);
  r=await f.request('account',{method:'POST',csrfValue:'a'.repeat(64),
   body:{userAccessToken:'TEST-ACCOUNT-SYNTHETIC-123'}});
  assert.equal(r.status,403);
  assert.equal(f.writes,0);assert.equal(f.officialCalls,0);
 }finally{await f.close()}
});
test('official HTTP 200 but success=false error 102 is explicit auth failure and never stores secret',async()=>{
 const f=await fixture({fetchImpl:async()=>({
  status:200,headers:new Headers(),text:async()=>JSON.stringify({
   success:false,error_code:102,message:'SENSITIVE_UPSTREAM_MESSAGE_MUST_NOT_LEAK'
  })
 })});
 try{
  const r=await f.request('account',{method:'POST',
   body:{userAccessToken:'FAKE_ACCOUNT_TOKEN_NOT_REAL'}});
  assert.equal(r.status,401);
  assert.equal(r.body.error,'PANCAKE_OFFICIAL_AUTH_102');
  assert.equal(f.writes,0);
  assert.equal(JSON.stringify(r.body).includes('SENSITIVE_UPSTREAM_MESSAGE'),false);
  assert.equal(JSON.stringify(r.body).includes('FAKE_ACCOUNT_TOKEN'),false);
 }finally{await f.close()}
});
test('unrecognized official error is not falsely reported as invalid user token',async()=>{
 const f=await fixture({fetchImpl:async()=>({
  status:200,headers:new Headers(),text:async()=>JSON.stringify({
   success:false,error_code:777,message:'Private upstream error'
  })
 })});
 try{
  const r=await f.request('account',{method:'POST',
   body:{userAccessToken:'FAKE_ACCOUNT_TOKEN_NOT_REAL'}});
  assert.equal(r.status,502);
  assert.equal(r.body.error,'PANCAKE_OFFICIAL_ERROR_777');
  assert.equal(f.writes,0);
  assert.equal(JSON.stringify(r.body).includes('Private upstream'),false);
 }finally{await f.close()}
});

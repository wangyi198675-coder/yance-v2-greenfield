import test from 'node:test';
import assert from 'node:assert/strict';
import {pancakeMultiApi} from './pancake-multi-browser.mjs';
const ok=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
const session={ok:true,authorized:true,sessionKind:'WEB_LOCAL_PRIVATE',csrfToken:'a'.repeat(64)};
test('Page capability 401 from stale browser session renews first-party PRIVATE once, then returns verified credentialReady',async()=>{
 let capabilityRequests=0,renewals=0;
 const fetchImpl=async(url,options={})=>{
  if(url.endsWith('/local-session/status'))return ok(session);
  if(url.endsWith('/web-private-start')){assert.equal(options.method,'POST');assert.equal(options.body,'{}');renewals++;return ok({ok:true});}
  if(url.endsWith('/onboarding/capabilities'))return capabilityRequests++===0?ok({ok:false},401):ok({ok:true,credentialReady:true,canSend:false});
  throw Error('WRONG_PATH_'+url);
 };
 const result=await pancakeMultiApi('capabilities',{fetchImpl});
 assert.equal(result.credentialReady,true);assert.equal(renewals,1);assert.equal(capabilityRequests,2);
});
test('Provider-token mutation is never automatically replayed after an unauthorized receipt',async()=>{
 let writes=0,renewals=0;
 const fetchImpl=async(url)=>{
  if(url.endsWith('/local-session/status'))return ok(session);
  if(url.endsWith('/web-private-start')){renewals++;return ok({ok:true});}
  if(url.endsWith('/onboarding/account')){writes++;return ok({ok:false},401);}
  throw Error('WRONG_PATH_'+url);
 };
 await assert.rejects(pancakeMultiApi('account',{fetchImpl,userAccessToken:'abcdefghij'}),/PANCAKE_ACCOUNT_HTTP_401/);
 assert.equal(writes,1);assert.equal(renewals,0);
});

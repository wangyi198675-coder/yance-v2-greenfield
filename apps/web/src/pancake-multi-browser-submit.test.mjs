import test from 'node:test';
import assert from 'node:assert/strict';
import {pancakeMultiApi} from './pancake-multi-browser.mjs';
const session={ok:true,paired:true,authorized:true,sessionKind:'WEB_LOCAL_PRIVATE',csrfToken:'a'.repeat(64)};
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
test('actual Pancake rejection provides sanitized exact cause; never retries submitted account token',async()=>{
 let writes=0;
 const fetchImpl=async(url,opts={})=>{
  if(url.endsWith('/local-session/status'))return response(session);
  if(url.endsWith('/onboarding/account')){
   assert.equal(opts.method,'POST');assert.equal(opts.credentials,'same-origin');assert.ok(opts.signal);
   assert.equal(opts.headers['x-yance-csrf'],session.csrfToken);writes++;
   return response({ok:false,error:'PANCAKE_TOKEN_REJECTED',canSend:false},401);
  }
  throw Error('INVALID_PATH');
 };
 await assert.rejects(pancakeMultiApi('account',{fetchImpl,userAccessToken:'P0_FAKE_ONLY_USER_TOKEN'}),/PANCAKE_ACCOUNT_HTTP_401_CODE_PANCAKE_TOKEN_REJECTED/);
 assert.equal(writes,1);
});
test('account save timeout terminates with explicit code, no replay',async()=>{
 let writes=0;
 const fetchImpl=async url=>{
  if(url.endsWith('/local-session/status'))return response(session);
  if(url.endsWith('/onboarding/account')){writes++;throw Object.assign(new Error('aborted'),{name:'TimeoutError'});}
  throw Error('INVALID_PATH');
 };
 await assert.rejects(pancakeMultiApi('account',{fetchImpl,userAccessToken:'P0_FAKE_ONLY_USER_TOKEN'}),/PANCAKE_ACCOUNT_TIMEOUT_30S/);
 assert.equal(writes,1);
});
test('read-only authorization recheck identifies missing W55 account separately from native unavailable',async()=>{
 let gets=0;
 const fetchImpl=async url=>{
  if(url.endsWith('/local-session/status'))return response(session);
  if(url.endsWith('/onboarding/pages')){gets++;return response({ok:false,error:'PANCAKE_ACCOUNT_NOT_CONFIGURED',canSend:false},403);}
  throw Error('INVALID_PATH');
 };
 await assert.rejects(pancakeMultiApi('pages',{fetchImpl}),/PANCAKE_PAGES_HTTP_403_CODE_PANCAKE_ACCOUNT_NOT_CONFIGURED/);
 assert.equal(gets,1);
});
test('relink request includes exact owner confirmation and W55 revoked revision only by opt-in',async()=>{
 const submissions=[];
 const fetchImpl=async(url,opts={})=>{
  if(url.endsWith('/local-session/status'))return response(session);
  if(url.endsWith('/onboarding/account')){
   submissions.push(JSON.parse(opts.body));
   return response({ok:true,canSend:false,pages:[],userTokenStored:true});
  }
  throw Error('UNEXPECTED_PATH');
 };
 await pancakeMultiApi('account',{fetchImpl,userAccessToken:'FAKE_ONLY_ACCOUNT_TOKEN'});
 await pancakeMultiApi('account',{fetchImpl,userAccessToken:'FAKE_ONLY_ACCOUNT_TOKEN',
  ownerReviewedRelink:true,expectedRevokedRevision:3});
 assert.deepEqual(submissions[0],{userAccessToken:'FAKE_ONLY_ACCOUNT_TOKEN'});
 assert.deepEqual(submissions[1],{userAccessToken:'FAKE_ONLY_ACCOUNT_TOKEN',
  ownerReviewedRelink:true,expectedRevokedRevision:3});
 assert.equal(submissions.length,2);
});

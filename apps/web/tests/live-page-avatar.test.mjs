import test from 'node:test';
import assert from 'node:assert/strict';
import {readAuthorizedFbPageAvatar} from '../src/live-chat-source.mjs';
const c={contactRef:'nativeAccount99|FB_PAGE|realpsid8811|3',
 accountRef:'nativeAccount99',channel:'FB_PAGE',peerRef:'realpsid8811',
 bindingRevision:3};
const good='https://content.pancake.vn/2.1-24/avatars/test-image';
const backend=(body,opts={})=>async(url,init)=>{
 assert.match(url,/^\/api\/v2\/contacts\/avatar\?/);
 assert.match(url,/accountRef=nativeAccount99/);
 assert.match(url,/peerRef=realpsid8811/);
 assert.match(url,/bindingRevision=3/);
 assert.equal(init.method,'GET');
 assert.equal(init.credentials,'same-origin');
 return {ok:opts.ok??true,status:opts.status??200,json:async()=>body};
};
test('contact authorized official image is returned without client inventing a Page/PSID URL',async()=>{
 const u=await readAuthorizedFbPageAvatar({contact:c,fetchImpl:backend({
  ok:true,canSend:false,status:'PRESENT',avatarUrl:good,
  source:'W27_PANCAKE_OFFICIAL_CURRENT_PAGE_PEER'
 })});assert.equal(u,good);
});
test('no avatar is truly empty and UI must fall back to initial',async()=>{
 const u=await readAuthorizedFbPageAvatar({contact:c,fetchImpl:backend({
  ok:true,canSend:false,status:'NO_AVATAR',avatarUrl:null
 })});assert.equal(u,null);
});
test('non Page contacts cannot resolve Facebook image',async()=>{
 let calls=0;
 await assert.rejects(readAuthorizedFbPageAvatar({
  contact:{...c,channel:'TELEGRAM_PERSONAL'},
  fetchImpl:()=>{calls++;throw Error('unexpected')}
 }),/W24_CURRENT_CONTACT_FOR_AVATAR_REQUIRED/);
 assert.equal(calls,0);
});
test('forged frontend identity/contactRef rejected before HTTP call',async()=>{
 let calls=0;
 await assert.rejects(readAuthorizedFbPageAvatar({
  contact:{...c,contactRef:'other-contact'},
  fetchImpl:()=>{calls++;throw Error('unexpected')}
 }),/W24_CURRENT_CONTACT_FOR_AVATAR_REQUIRED/);
 assert.equal(calls,0);
});
test('source and image CDN host cannot be spoofed',async()=>{
 for(const changed of [
  {avatarUrl:'https://evil.invalid/portrait.jpg'},
  {avatarUrl:'http://content.pancake.vn/image'},
  {avatarUrl:'https://content.pancake.vn.evil.test/image'},
  {source:'PROVIDER_STRING_NOT_AUTH'},
  {canSend:true}
 ]){
  const result={ok:true,canSend:false,status:'PRESENT',
   avatarUrl:good,source:'W27_PANCAKE_OFFICIAL_CURRENT_PAGE_PEER',...changed};
  await assert.rejects(readAuthorizedFbPageAvatar({
   contact:c,fetchImpl:backend(result)
  }),/W27_AVATAR_/);
 }
});
test('W47 session 401/503 cannot masquerade as valid avatar',async()=>{
 for(const status of [401,403,409,503]){
  await assert.rejects(readAuthorizedFbPageAvatar({
   contact:c,fetchImpl:backend({}, {ok:false,status})
  }),new RegExp('NATIVE_HTTP_'+status));
 }
});

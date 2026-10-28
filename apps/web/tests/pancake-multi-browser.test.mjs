import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pancakeMultiApi} from '../src/pancake-multi-browser.mjs';
const parent=readFileSync(new URL('../src/BCChannelAccountSetup.vue',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/BCPancakeMultiPageSetup.vue',import.meta.url),'utf8');
const csrf='a'.repeat(64);
function network(){
 const calls=[];
 const fetchImpl=async(url,init)=>{
  calls.push({url,init});
  if(url==='/api/v2/local-session/status')
   return {ok:true,json:async()=>({authorized:true,
    sessionKind:'WEB_LOCAL_PRIVATE',csrfToken:csrf,ok:true,paired:true})};
  if(url.endsWith('/account')){
   assert.equal(init.method,'POST');
   assert.equal(init.headers['x-yance-csrf'],csrf);
   assert.equal(JSON.parse(init.body).userAccessToken,'USER-QA-12345678');
   return {ok:true,json:async()=>({ok:true,canSend:false,
    status:'OFFICIAL_ACCOUNT_DISCOVERED',
    pages:[{pageId:'111',name:'A'},{pageId:'222',name:'B'}]})};
  }
  if(url.endsWith('/pages'))return {ok:true,json:async()=>({ok:true,
   canSend:false,pages:[{pageId:'111',name:'A',tokenConfigured:false},
    {pageId:'222',name:'B',tokenConfigured:true}]})};
  throw Error('UNEXPECTED_PATH '+url);
 };
 return {fetchImpl,calls};
}
test('R4 Facebook Page frontend renders multi-page setup, never old single-Page form',()=>{
 assert.match(parent,/<BCPancakeMultiPageSetup v-if="isFbPage"/);
 assert.match(ui,/data-test="pancake-multi-page-setup"/);
 assert.match(ui,/data-test="pancake-page-list"/);
 assert.match(ui,/v-for="p in pages"/);
 assert.match(ui,/data-test="pancake-account-save"/);
 assert.match(ui,/data-test="pancake-verify-page"/);
 assert.match(ui,/data-test="pancake-independent-page-add"/);
 assert.match(ui,/data-test="pancake-independent-page-id"/);
 assert.match(ui,/data-test="pancake-independent-page-token"/);
 assert.match(ui,/type="password" v-model="independentPageToken"/);
 assert.match(ui,/data-test="pancake-verify-independent-page"/);
 assert.match(ui,/@click="connectIndependentPage"/);
 assert.match(ui,/data-test="pancake-independent-page-id-error"/);
 assert.match(ui,/onIndependentPageIdInput/);
 assert.match(ui,/accountDiscoveryVerified/);
 assert.match(ui,/existing\.discoveryError==='PANCAKE_OFFICIAL_AUTH_102'/);
 assert.match(ui,/action==='page-token'/);
 assert.match(ui,/action==='account'/);
 assert.doesNotMatch(ui,/data-test="pancake-select-independent-page"/);
 assert.match(ui,/existing\.accountVerified===false/);
 assert.doesNotMatch(ui,/localStorage|sessionStorage/);
 assert.doesNotMatch(ui,/generate_page_access_token/);
});
test('one account token initiates only original same-origin Web session, returns verified Page list',async()=>{
 const {fetchImpl,calls}=network();
 const r=await pancakeMultiApi('account',{fetchImpl,userAccessToken:'USER-QA-12345678'});
 assert.equal(r.pages.length,2);assert.equal(r.canSend,false);
 assert.equal(calls.length,2);
 assert.equal(calls[1].init.headers['x-yance-csrf'],csrf);
});
test('multiple managed pages can refresh without other Page token input',async()=>{
 const {fetchImpl,calls}=network();
 const r=await pancakeMultiApi('pages',{fetchImpl});
 assert.equal(r.pages[0].tokenConfigured,false);
 assert.equal(r.pages[1].tokenConfigured,true);
 assert.equal(calls[1].init.method,'GET');
});
test('untrusted session refuses all Pancake token requests before POST',async()=>{
 let calls=0;
 const fetchImpl=async(path)=>{
  calls++;if(path==='/api/v2/local-session/web-private-start')return {ok:true,json:async()=>({ok:true})};
  return {ok:true,json:async()=>({
   authorized:true,sessionKind:'UNKNOWN',csrfToken:'x'.repeat(64),ok:true,paired:true
  })};
 };
 await assert.rejects(pancakeMultiApi('account',{
  fetchImpl,userAccessToken:'USER-QA-12345678'
 }),/LOCAL_FIRST_PARTY_SESSION_NOT_VERIFIED/);
 assert.equal(calls,3);
});

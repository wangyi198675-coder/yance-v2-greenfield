import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseChannelSetup} from '../src/channel-setup-contract.mjs';
import {pancakeMultiApi} from '../src/pancake-multi-browser.mjs';
const fromSrc=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const parent=fromSrc('BCProductWorkspaceCandidate.vue');
const card=fromSrc('BCChannelAccountSetup.vue');
const multi=fromSrc('BCPancakeMultiPageSetup.vue');
const browser=fromSrc('pancake-multi-browser.mjs');
test('R4 preserves one platform picker and one channel step; no four-panel dashboard',()=>{
 assert.match(parent,/data-test="w46-channel-picker"/);
 assert.match(parent,/data-test="w46-channel-step"/);
 assert.match(parent,/selectedChannel=channel.id/);
 assert.match(parent,/:channel="CHANNELS.find\(c=>c.id===selectedChannel\)"/);
 assert.doesNotMatch(parent,/<BCChannelAccountSetup v-for="channel in CHANNELS"/);
 assert.match(parent,/data-test="w46-channel-back"/);
 assert.match(parent,/choose\('CHAT'\)/);
});
test('FB Page renders only ORIGINAL Web compact plus new multi-Page setup, not two logins',()=>{
 assert.match(card,/import BCPancakeMultiPageSetup from/);
 assert.match(card,/const isFbPage=computed\(\(\)=>props.channel.id==='FB_PAGE'\)/);
 assert.match(card,/<BCPancakeMultiPageSetup v-if="isFbPage"/);
 assert.match(card,/<article v-else class="w46-channel"/);
 assert.match(card,/if\(!isFbPage.value\)refresh\(\)/);
 assert.doesNotMatch(card,/data-test="fb-page-config"/);
 assert.doesNotMatch(card,/const pageId=ref\(/);
 assert.doesNotMatch(card,/generate_page_access_token/);
});
test('only original Pancake user token is asked initially, Page tokens scoped individually after discovery',()=>{
 assert.match(multi,/data-test="pancake-account-config"/);
 assert.match(multi,/data-test="pancake-user-token"/);
 assert.match(multi,/data-test="pancake-account-save"/);
 assert.match(multi,/data-test="pancake-page-list"/);
 assert.match(multi,/v-for="p in pages"/);
 assert.match(multi,/data-test="pancake-select-page"/);
 assert.match(multi,/data-test="pancake-page-token-panel"/);
 assert.match(multi,/data-test="pancake-page-token"/);
 assert.match(multi,/data-test="pancake-verify-page"/);
 assert.doesNotMatch(multi,/localStorage|sessionStorage|generate_page_access_token/);
 assert.doesNotMatch(multi,/fake-peer|SYNTHETIC_TEST_ONLY/);
});
test('other three channel SDK account setup and original WhatsApp QR remain intact',()=>{
 assert.match(card,/FB_PERSONAL:/);
 assert.match(card,/WHATSAPP_PERSONAL:/);
 assert.match(card,/TELEGRAM_PERSONAL:/);
 assert.match(card,/await setupChannel/);
 assert.match(card,/receipt\.qr/);
 assert.match(card,/state.value='EXPIRED'/);
 assert.match(card,/data-test="native-provider-qr"/);
 assert.match(card,/data-test="native-provider-details"/);
 assert.doesNotMatch(card,/pages\.fm\/api/);
});
test('original official setup remains a truthful unavailable step, never a Facebook grant',()=>{
 const r=parseChannelSetup('FB_PAGE',{channel:'FB_PAGE',source:'PANCAKE_NATIVE',
  canSend:false,userDecisionRequired:true,nextAction:'OFFICIAL_SETUP_REQUIRED',
  officialSetup:'https://pages.fm/'});
 assert.equal(r.nextAction,'OFFICIAL_SETUP_REQUIRED');
 assert.equal(r.officialDocs,'https://pages.fm/');
});
test('multi-Page browser must use existing W47 same-origin session+CSRF, never provider JS',()=>{
 assert.match(browser,/\/api\/v2\/local-session\/web-private-start/);
 assert.match(browser,/\/api\/v2\/local-session\/status/);
 assert.match(browser,/credentials:'same-origin'/);
 assert.match(browser,/'x-yance-csrf':session.csrfToken/);
 assert.match(browser,/\/api\/v2\/providers\/fb-page\/onboarding/);
 assert.doesNotMatch(browser,/pages\.fm\/api|localStorage\.setItem|sessionStorage\.setItem/);
});
test('invalid original local session blocks Page token POST before requests',async()=>{
 let count=0;
 const fetchImpl=async()=>{
  count++;
  return {ok:true,json:async()=>({authorized:true,sessionKind:'OTHER',
    csrfToken:'a'.repeat(64)})};
 };
 await assert.rejects(pancakeMultiApi('account',{
  fetchImpl,userAccessToken:'SYNTHETIC-QA-TOKEN-NOT-REAL'
 }),/CURRENT_WEB_SESSION_NOT_VERIFIED/);
 assert.equal(count,1);
});
test('compact chat and multi-Page form remain touch usable',()=>{
 assert.match(card,/min-height:41px/);
 assert.match(multi,/@media\(max-width:470px\)/);
 assert.match(multi,/min-height:44px/);
 assert.match(parent,/w46-r4-channel-picker/);
 assert.match(parent,/w46-r4-channel-choice/);
});

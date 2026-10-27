import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {invokeFbPageNativeAuthorization,parseChannelSetup} from '../src/channel-setup-contract.mjs';
const fromSrc=x=>readFileSync(new URL('../src/'+x,import.meta.url),'utf8');
const parent=fromSrc('BCProductWorkspaceCandidate.vue');
const card=fromSrc('BCChannelAccountSetup.vue');
const contract=fromSrc('channel-setup-contract.mjs');
test('R4 user-approved: one platform selection then exactly one channel setup, not four technical cards',()=>{
 assert.match(parent,/data-test="w46-channel-picker"/);
 assert.match(parent,/data-test="w46-channel-step"/);
 assert.match(parent,/selectedChannel=channel.id/);
 assert.match(parent,/:channel="CHANNELS.find\(c=>c.id===selectedChannel\)"/);
 assert.doesNotMatch(parent,/<BCChannelAccountSetup v-for="channel in CHANNELS"/);
 assert.match(parent,/data-test="w46-channel-back"/);
 assert.match(parent,/choose\('CHAT'\)/);
});
test('no static Pancake official docs treated as W27 started user authorization',()=>{
 assert.match(card,/invokeFbPageNativeAuthorization\(\{action:'start'/);
 assert.match(card,/state.value=v.nextAction==='OFFICIAL_SETUP_REQUIRED'/);
 assert.match(card,/'OFFICIAL_SETUP_REQUIRED':'WAITING_USER_AUTH'/);
 assert.match(card,/v-if="!isFbPage&&receipt"/);
 assert.doesNotMatch(card,/state.value='WAITING_USER_AUTH';[\s\S]{0,150}notice.value=v\.qr/);
 const r=parseChannelSetup('FB_PAGE',{channel:'FB_PAGE',source:'PANCAKE_NATIVE',
  canSend:false,userDecisionRequired:true,nextAction:'OFFICIAL_SETUP_REQUIRED',
  officialSetup:'https://pages.fm/'});
 assert.equal(r.nextAction,'OFFICIAL_SETUP_REQUIRED');
 assert.equal(r.officialDocs,'https://pages.fm/');
});
test('R4 native Page wizard displays actual verified User step and selectable real Page',()=>{
 assert.match(card,/data-test="fb-page-actual-started"/);
 assert.match(card,/data-test="fb-page-read-pages"/);
 assert.match(card,/data-test="fb-page-page-selection"/);
 assert.match(card,/data-test="fb-page-choice"/);
 assert.match(card,/data-test="fb-page-bind"/);
 assert.match(card,/statusLabel/);
 assert.match(card,/AUTHORIZED_READ_ONLY/);
 assert.match(card,/未读取到|尚未读取到/);
});
test('old QR reuses original W28, no new QR service or technical workspace',()=>{
 assert.match(card,/await setupChannel/);
 assert.match(card,/receipt\.qr/);
 assert.match(card,/state.value='EXPIRED'/);
 assert.match(card,/data-test="native-provider-qr"/);
 assert.match(card,/data-test="native-provider-details"/);
 assert.match(card,/高级连接诊断/);
 assert.doesNotMatch(parent,/R4 四平台品牌 SVG 路径来源已校验/);
});
test('W27 single action is same-origin session/CSRF gated and not provider SDK on renderer',()=>{
 assert.match(contract,/credentials:'same-origin'/);
 assert.match(contract,/W54_NATIVE_FIRST_PARTY_SESSION_REQUIRED/);
 assert.match(contract,/'x-yance-csrf':s\.csrfToken/);
 assert.match(contract,/\/api\/v2\/providers\/fb-page\/authorization\//);
 assert.doesNotMatch(card,/pages\.fm\/api/);
 assert.doesNotMatch(card,/getProtectedTokenLease/);
 assert.doesNotMatch(card,/fetch\(.+127\.0\.0\.1/);
});
test('actual W54 native session POST START and VERIFIED Page choices',async()=>{
 const calls=[];
 const csrf='a'.repeat(64);
 const fetchImpl=async(url,init)=>{
  calls.push({url,init});
  if(url==='/api/v2/local-session/status')return {ok:true,json:async()=>({
    authorized:true,sessionKind:'NATIVE_FIRST_PARTY',csrfToken:csrf
  })};
  assert.equal(init.method,'POST');assert.equal(init.headers['x-yance-csrf'],csrf);
  if(url.endsWith('/start'))return {ok:true,json:async()=>({
    ok:true,channel:'FB_PAGE',source:'PANCAKE_NATIVE',status:'WAITING_USER_AUTH',
    entryAvailable:true,credentialInput:'NATIVE_PROTECTED_ONLY',canSend:false
  })};
  if(url.endsWith('/pages'))return {ok:true,json:async()=>({
    ok:true,channel:'FB_PAGE',source:'PANCAKE_NATIVE',status:'PAGE_SELECTION_REQUIRED',
    pages:[{providerPageId:'12345',name:'Owned Page'}],canSend:false
  })};
  throw Error('Unexpected path');
 };
 const start=await invokeFbPageNativeAuthorization({action:'start',fetchImpl});
 assert.equal(start.status,'WAITING_USER_AUTH');
 const pages=await invokeFbPageNativeAuthorization({action:'pages',fetchImpl});
 assert.equal(pages.pages.length,1);
 assert.equal(calls.length,4);
});
test('untrusted browser account cannot trigger FB Page POST, or invent Page status',async()=>{
 let posts=0;
 const fetchImpl=async(url)=>{
  if(url==='/api/v2/local-session/status')return {ok:true,json:async()=>({
    authorized:true,sessionKind:'WEB_LOCAL_PRIVATE',csrfToken:'b'.repeat(64)
  })};
  posts++;throw Error('UNAUTHORIZED POST');
 };
 await assert.rejects(invokeFbPageNativeAuthorization({action:'start',fetchImpl}),
   /W54_NATIVE_FIRST_PARTY_SESSION_REQUIRED/);
 assert.equal(posts,0);
});
test('current theme and compact viewport remain touch accessible',()=>{
 assert.match(card,/min-height:44px/);
 assert.match(card,/color:var\(--accent-ink\)!important/);
 assert.match(parent,/max-width:600px/);
 assert.match(parent,/w46-r4-channel-picker/);
 assert.match(parent,/w46-r4-channel-choice/);
});

test('Facebook Page uses single actual R4 multi-Page component, not obsolete one-Page configuration',()=>{
 const multi=fromSrc('BCPancakeMultiPageSetup.vue');
 assert.match(card,/<BCPancakeMultiPageSetup v-if="isFbPage"/);
 assert.match(card,/<article v-else class="w46-channel"/);
 assert.match(multi,/data-test="pancake-multi-page-setup"/);
 assert.match(multi,/data-test="pancake-page-list"/);
 assert.match(multi,/data-test="pancake-user-token"/);
 assert.match(multi,/data-test="pancake-page-token"/);
 assert.match(multi,/v-for="p in pages"/);
 assert.doesNotMatch(multi,/localStorage.setItem|sessionStorage.setItem/);
});
import test from 'node:test';
import assert from 'node:assert/strict';
import {currentFirstPartyWebSession,renewFirstPartyWebSession} from './local-first-party-session.mjs';
import {readWhatsAppNative,connectWhatsAppNative} from './whatsapp-native-user-flow.mjs';
import {currentPancakeWebSession} from './pancake-multi-browser.mjs';

const csrf='a'.repeat(64);
const ready={ok:true,paired:true,authorized:true,sessionKind:'WEB_LOCAL_PRIVATE',
  expiresAt:Date.now()+600000,csrfToken:csrf,canSend:false};

test('WA and original Pancake coalesce first private session bootstrap and read back same Cookie/CSRF',async()=>{
 let issued=false,posts=0,reads=0;
 const fetchImpl=async(url,init={})=>{
  if(url==='/api/v2/local-session/status'){
   reads++;
   return {ok:true,status:200,json:async()=>issued?ready:{
    ok:true,paired:false,authorized:false
   }};
  }
  if(url==='/api/v2/local-session/web-private-start'){
   posts++;
   await new Promise(r=>setTimeout(r,25));
   issued=true;
   return {ok:true,status:200,json:async()=>ready};
  }
  throw Error('UNEXPECTED_URL_'+url);
 };
 const [wa,fb]=await Promise.all([
  currentFirstPartyWebSession(fetchImpl),
  currentPancakeWebSession(fetchImpl)
 ]);
 assert.equal(posts,1,'one real W47 session POST for both original client components');
 assert.equal(reads>=3,true,'actual Cookie must be read back after POST');
 assert.equal(wa.csrfToken,fb.csrfToken);
 assert.equal(wa.sessionKind,'WEB_LOCAL_PRIVATE');
});

test('a pre-existing verified first-party session never triggers bootstrap',async()=>{
 let posts=0;
 const fetchImpl=async(url)=>{
  if(url.endsWith('/web-private-start'))posts++;
  return {ok:true,json:async()=>ready};
 };
 assert.equal((await currentFirstPartyWebSession(fetchImpl)).csrfToken,csrf);
 assert.equal(posts,0);
});

test('failed browser session initialization is not treated as successful consent',async()=>{
 const fetchImpl=async(url)=>url.endsWith('/status')?
  {ok:true,json:async()=>({ok:true,paired:false,authorized:false})}:
  {ok:false,status:503,json:async()=>({ok:false})};
 await assert.rejects(currentFirstPartyWebSession(fetchImpl),/LOCAL_FIRST_PARTY_BOOTSTRAP_HTTP_503/);
});

test('W47 revoked local Cookie after POST is never trusted from POST response alone',async()=>{
 const fetchImpl=async(url)=>url.endsWith('/web-private-start')?
  {ok:true,json:async()=>ready}:
  {ok:true,json:async()=>({ok:true,paired:false,authorized:false})};
 await assert.rejects(currentFirstPartyWebSession(fetchImpl),/LOCAL_FIRST_PARTY_SESSION_NOT_VERIFIED/);
});

test('normal original native status still rejects fake provider data',async()=>{
 const fetchImpl=async(url)=>{
  if(url.endsWith('/local-session/status'))return {ok:true,json:async()=>ready};
  if(url.endsWith('/native/status'))return {ok:true,json:async()=>({
   ok:true,channel:'WHATSAPP_PERSONAL',source:'BAILEYS_NATIVE_SDK',
   state:'WAITING_USER_AUTH',connected:false,qrAvailable:false,canSend:false
  })};
  throw Error('UNEXPECTED_'+url);
 };
 const result=await readWhatsAppNative({fetchImpl});
 assert.equal(result.online,false);
 assert.equal(result.state,'WAITING_USER_AUTH');
});

test('WhatsApp QR modal uses document.body rather than card stacking context',async()=>{
 const {readFileSync}=await import('node:fs');
 const vue=readFileSync(new URL('./BCChannelAccountSetup.vue',import.meta.url),'utf8');
 const start=vue.indexOf('<Teleport to="body">');
 const qr=vue.indexOf('class="w46-qr-backdrop"');
 const end=vue.indexOf('</Teleport>');
 assert.ok(start>=0&&qr>start&&end>qr);
 assert.ok(vue.includes('data-test="native-provider-qr-dialog"'));
});

test('teleported QR reuses active theme tokens rather than transparent root styles',async()=>{
 const {readFileSync}=await import('node:fs');
 const vue=readFileSync(new URL('./BCChannelAccountSetup.vue',import.meta.url),'utf8');
 assert.match(vue,/getComputedStyle\(card\)/);
 assert.match(vue,/watch\(qrOpen,open=>\{if\(open\)syncQrTheme\(\)\}/);
 assert.match(vue,/:style="qrThemeVars"/);
 assert.match(vue,/var\(--surface-raised,\s*#202b31\)/);
 assert.match(vue,/backdrop-filter:none/);
});

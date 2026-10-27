import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseChannelSetup} from '../src/channel-setup-contract.mjs';
const ui=readFileSync(new URL('../src/BCChannelAccountSetup.vue',import.meta.url),'utf8');
test('Messenger user click opens exactly W47-attested owner onboarding URL, never a frontend SDK',()=>{
 assert.match(ui,/globalThis\.open\('about:blank','_blank'\)/);
 assert.match(ui,/loginWindow\.location\.replace\(v\.officialConnectUrl\)/);
 assert.match(ui,/if\(v\.officialConnectUrl\)/);
 assert.match(ui,/loginWindow\.close\(\)/);
 assert.doesNotMatch(ui,/messenger\.(?:send|login)|facebook\.com\/api\/login|new WebSocket/);
});
test('reject hostile redirect and do not grant account from SDK process health',()=>{
 const body={channel:'FB_PERSONAL',source:'OFFICIAL_MAUTRIX_META',
   userDecisionRequired:true,nextAction:'WAITING_USER_AUTH',
   officialConnectUrl:'http://127.0.0.1:29321/api/v2/providers/fb-personal/connect',canSend:false};
 const ok=parseChannelSetup('FB_PERSONAL',body);
 assert.equal(ok.officialConnectUrl,body.officialConnectUrl);
 for(const dest of ['http://127.0.0.1:29321/evil',
  'https://evil.example/connect','http://localhost:29321/api/v2/providers/fb-personal/connect']){
  assert.throws(()=>parseChannelSetup('FB_PERSONAL',{...body,officialConnectUrl:dest}));
 }
});
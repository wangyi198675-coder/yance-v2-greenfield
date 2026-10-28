import test from 'node:test';
import assert from 'node:assert/strict';
import {providerPath,parseChannelState,parseChannelSetup,checkChannel,setupChannel}
 from '../src/channel-setup-contract.mjs';
test('all four approved native channel routes are deterministic and same origin',()=>{
 const pairs=[['FB_PERSONAL','fb-personal'],['FB_PAGE','fb-page'],
  ['WHATSAPP_PERSONAL','whatsapp-personal'],['TELEGRAM_PERSONAL','telegram-personal']];
 for(const [channel,slug] of pairs){
  assert.equal(providerPath(channel,'status'),'/api/v2/providers/'+slug+'/status');
  assert.equal(providerPath(channel,'setup'),'/api/v2/providers/'+slug+'/setup');
 }
 assert.throws(()=>providerPath('UNKNOWN','status'));
 assert.throws(()=>providerPath('FB_PERSONAL','send'));
});
test('GET channel check is a genuine read-only W47 call; 404 never becomes connected',async()=>{
 const logs=[];
 await assert.rejects(checkChannel({channel:'FB_PERSONAL',fetchImpl:async(url,init)=>{
  logs.push({url,init});return {ok:false,status:404};
 }}),/CHANNEL_OWNER_HTTP_404/);
 assert.equal(logs.length,1);
 assert.equal(logs[0].url,'/api/v2/providers/fb-personal/status');
 assert.equal(logs[0].init.credentials,'same-origin');
 assert.equal(logs[0].init.method,'GET');
});
test('verified ONLINE must carry W26–W29 source and native authorization proof',()=>{
 const real={ok:true,channel:'TELEGRAM_PERSONAL',source:'TDLIB_JSON_NATIVE',
  canSend:false,status:'ONLINE_VERIFIED',authorizedByNativeOwner:true};
 assert.equal(parseChannelState('TELEGRAM_PERSONAL',real).online,true);
 for(const x of [{...real,source:'SYNTHETIC'}, {...real,canSend:true},
  {...real,authorizedByNativeOwner:false},{...real,channel:'FB_PERSONAL'}])
  assert.throws(()=>parseChannelState('TELEGRAM_PERSONAL',x));
});
test('Baileys official QR appears only after signed time-bound original native receipt',()=>{
 const o={channel:'WHATSAPP_PERSONAL',source:'BAILEYS_NATIVE_SDK',
  canSend:false,userDecisionRequired:true,nextAction:'WAITING_QR_SCAN',
  qrImageDataUrl:'data:image/png;base64,'+'A'.repeat(128),
  qrExpiresAt:Date.now()+80000,qrGeneration:2};
 assert.ok(parseChannelSetup('WHATSAPP_PERSONAL',o).qr);
 for(const x of [{...o,qrExpiresAt:Date.now()-1},{...o,qrImageDataUrl:'https://evil.invalid/qr'},
  {...o,qrGeneration:0},{...o,source:'FAKE'}])
  assert.throws(()=>parseChannelSetup('WHATSAPP_PERSONAL',x));
 assert.throws(()=>parseChannelSetup('TELEGRAM_PERSONAL',{...o,channel:'TELEGRAM_PERSONAL',
  source:'TDLIB_JSON_NATIVE'}));
});
test('W26 official setup URL must be original verified domain and no query tokens',()=>{
 const o={channel:'FB_PERSONAL',source:'OFFICIAL_MAUTRIX_META',
  canSend:false,userDecisionRequired:true,nextAction:'OFFICIAL_SETUP_REQUIRED',
  officialSetup:'https://docs.mau.fi/bridges/go/setup.html?bridge=meta'};
 assert.match(parseChannelSetup('FB_PERSONAL',o).officialDocs,/docs.mau.fi/);
 assert.throws(()=>parseChannelSetup('FB_PERSONAL',{...o,officialSetup:'https://evil.invalid/login'}));
 assert.throws(()=>parseChannelSetup('FB_PERSONAL',{...o,officialSetup:'http://docs.mau.fi'}));
});
test('never POST, log in on mount, or create placeholder QR from browser',async()=>{
 const urls=[];
 await setupChannel({channel:'FB_PAGE',fetchImpl:async(url,init)=>{
  urls.push({url,init});return {ok:false,status:503};
 }}).then(()=>assert.fail('Should fail closed'),e=>assert.match(e.message,/503/));
 assert.equal(urls[0].init.method,'GET');
 assert.equal(urls[0].init.credentials,'same-origin');
});

test('Facebook upstream connected is not the same as application account bound and cannot send',()=>{
 const actual={ok:true,channel:'FB_PERSONAL',source:'OFFICIAL_MAUTRIX_META',
  canSend:false,status:'UPSTREAM_CONNECTED_BINDING_PENDING',
  nativeProviderSessionConnected:true,authorizedByNativeOwner:false,
  accountIdentityVerified:false};
 const parsed=parseChannelState('FB_PERSONAL',actual);
 assert.equal(parsed.state,'UPSTREAM_CONNECTED_BINDING_PENDING');
 assert.equal(parsed.nativeProviderSessionConnected,true);
 assert.equal(parsed.online,false);
 assert.equal(parsed.accounts,null);
 for(const bad of [
  {...actual,nativeProviderSessionConnected:false},
  {...actual,authorizedByNativeOwner:true},
  {...actual,accountIdentityVerified:true},
  {...actual,canSend:true},
  {...actual,channel:'WHATSAPP_PERSONAL',source:'BAILEYS_NATIVE_SDK'}
 ])assert.throws(()=>parseChannelState(bad.channel,bad));
});

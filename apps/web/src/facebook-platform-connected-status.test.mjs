import test from 'node:test';
import assert from 'node:assert/strict';
import {parseChannelState} from './channel-setup-contract.mjs';
const base={ok:true,channel:'FB_PERSONAL',source:'OFFICIAL_MAUTRIX_META',
 status:'UPSTREAM_CONNECTED_BINDING_PENDING',canSend:false,
 authorizedByNativeOwner:false,accountIdentityVerified:false,
 nativeProviderSessionConnected:true,platformAccountIdentityVerified:true,
 upstreamSource:'REAL_BRIDGE_V3_PROVISIONING_AUTHENTICATED',
 accounts:[{accountId:'123456789012345',displayName:'Official Messenger User',
  platformIdentityVerified:true,state:'ONLINE_VERIFIED'}]};
test('official connected Messenger identity appears without fictitious W24 send consent',()=>{
 const actual=parseChannelState('FB_PERSONAL',base);
 assert.equal(actual.online,false);
 assert.equal(actual.nativeProviderSessionConnected,true);
 assert.equal(actual.accounts.length,1);
 assert.equal(actual.accounts[0].displayName,'Official Messenger User');
});
test('fake bridge identity never populates the account card',()=>{
 for(const bad of [
  {...base,upstreamSource:'UNVERIFIED_BROWSER'},
  {...base,platformAccountIdentityVerified:false},
  {...base,accounts:[{...base.accounts[0],platformIdentityVerified:false}]}
 ]){
  const r=parseChannelState('FB_PERSONAL',bad);
  assert.equal(r.accounts,null);
 }
});
test('other channels cannot use upstream Messenger owner state',()=>{
 assert.throws(()=>parseChannelState('WHATSAPP_PERSONAL',{...base,channel:'WHATSAPP_PERSONAL',source:'BAILEYS_NATIVE_SDK'}));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseChannelState} from '../src/channel-setup-contract.mjs';
const src=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const native=(status='ONLINE_VERIFIED',accounts=[])=>({
 ok:true,channel:'WHATSAPP_PERSONAL',source:'BAILEYS_NATIVE_SDK',canSend:false,
 status,authorizedByNativeOwner:true,accounts
});
test('four existing cards, real connection CTA and multi-account chooser not a new chat engine',()=>{
 const parent=src('BCProductWorkspaceCandidate.vue'),card=src('BCChannelAccountSetup.vue');
 assert.match(parent,/repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(parent,/w46-add-account-global/);
 assert.match(parent,/w46-account-add-dialog/);
 assert.match(parent,/connectTrigger\[channel\.id\]/);
 assert.match(parent,/function connectAnother/);
 assert.match(card,/verifiedAccounts/);
 assert.match(card,/v-for="account in verifiedAccounts\|\|\[\]"/);
 assert.match(card,/添加另一个账号/);
 assert.match(card,/checkChannel/);
 assert.match(card,/setupChannel/);
 assert.doesNotMatch(card,/sock\.sendMessage|native\..*sendMessage/);
});
test('status is NOT an account list without verified native upstream source',()=>{
 assert.equal(parseChannelState('WHATSAPP_PERSONAL',native('WAITING_USER_AUTH',[])).accounts,null);
 const noAccounts=native();delete noAccounts.accounts;
 assert.equal(parseChannelState('WHATSAPP_PERSONAL',noAccounts).accounts,null);
 const forged=native('ONLINE_VERIFIED',[{accountId:'a',displayName:'Ali',identityVerified:false}]);
 assert.equal(parseChannelState('WHATSAPP_PERSONAL',forged).accounts,null);
});
test('two independent native authorized same-provider accounts remain separate',()=>{
 const p=native('ONLINE_VERIFIED',[
  {accountId:'wa:one',displayName:'个人号码',identityVerified:true,state:'ONLINE_VERIFIED'},
  {accountId:'wa:two',displayName:'工作号码',identityVerified:true,state:'ONLINE_VERIFIED'}
 ]);
 const x=parseChannelState('WHATSAPP_PERSONAL',p);
 assert.equal(x.accounts.length,2);
 assert.notEqual(x.accounts[0].accountId,x.accounts[1].accountId);
 assert.equal(x.accounts[0].displayName,'个人号码');
 assert.equal(x.accounts[1].displayName,'工作号码');
 assert.equal(x.online,true);
 assert.equal(x.accounts[0].state,'ONLINE_VERIFIED');
});
test('duplicate source account IDs and empty provider identity fail closed',()=>{
 let s=native('ONLINE_VERIFIED',[
  {accountId:'same',displayName:'A',identityVerified:true},
  {accountId:'same',displayName:'B',identityVerified:true}
 ]);
 assert.equal(parseChannelState('WHATSAPP_PERSONAL',s).accounts,null);
 s=native('ONLINE_VERIFIED',[{accountId:'',displayName:'test',identityVerified:true}]);
 assert.equal(parseChannelState('WHATSAPP_PERSONAL',s).accounts,null);
});
test('backend cannot grant connected status from unverified account or fake channel',()=>{
 assert.throws(()=>parseChannelState('WHATSAPP_PERSONAL',{
  ...native(),authorizedByNativeOwner:false
 }),/CHANNEL_OWNER_UNVERIFIED_STATE/);
 assert.throws(()=>parseChannelState('FB_PAGE',native()),/CHANNEL_OWNER_UNVERIFIED_STATE/);
});

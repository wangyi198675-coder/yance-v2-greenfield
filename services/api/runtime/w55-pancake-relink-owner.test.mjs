import test from 'node:test';
import assert from 'node:assert/strict';
import {createW55PancakeWebCustody} from './w55-pancake-web-custody.mjs';

const userSession={record:{kind:'WEB_LOCAL_PRIVATE'}};
test('revoked W55 credential stays revoked until explicit owner review AND exact revision',async()=>{
 let revision=3,revoked=true,writes=0,secret=null;
 const native={
  async status({provider}){
   assert.equal(provider,'PANCAKE_PAIR');
   return {ok:true,provider,revision,configured:!revoked,revoked};
  },
  async store({provider,expectedRevision,secret:value}){
   assert.equal(provider,'PANCAKE_PAIR');
   assert.equal(revoked,true);
   assert.equal(expectedRevision,3);
   writes++;revision++;revoked=false;secret=JSON.parse(value);
   return {ok:true,provider,revision,configured:true,revoked:false};
  },
  async withPancake({expectedRevision},cb){
   assert.equal(expectedRevision,4);
   return cb(secret);
  },
  async revoke(){throw Error('SHOULD_NOT_REVOKE')}
 };
 const vault=createW55PancakeWebCustody({nativeKeyPort:native});
 const base={session:userSession,explicitUserEntry:true,userAccessToken:'ONLY_FAKE_NEW_OWNER_TOKEN'};
 await assert.rejects(vault.saveAccount(base),/PANCAKE_REVOKED_RELINK_REQUIRES_OWNER_REVIEW/);
 await assert.rejects(vault.saveAccount({...base,ownerReviewedRelink:true}),/PANCAKE_REVOKED_RELINK_REQUIRES_OWNER_REVIEW/);
 await assert.rejects(vault.saveAccount({...base,ownerReviewedRelink:true,expectedRevokedRevision:2}),/PANCAKE_REVOKED_RELINK_REQUIRES_OWNER_REVIEW/);
 await assert.rejects(vault.saveAccount({...base,ownerReviewedRelink:true,expectedRevokedRevision:4}),/PANCAKE_REVOKED_RELINK_REQUIRES_OWNER_REVIEW/);
 assert.equal(writes,0);assert.equal((await vault.status()).revoked,true);
 const approved=await vault.saveAccount({...base,ownerReviewedRelink:true,expectedRevokedRevision:3});
 assert.equal(approved.revision,4);
 assert.equal(writes,1);
 assert.equal((await vault.status()).revoked,false);
 assert.deepEqual((await vault.withCredentials(x=>x)).pages,{});
 await assert.rejects(vault.saveAccount({...base,ownerReviewedRelink:true,expectedRevokedRevision:3}),/PANCAKE_ACCOUNT_ALREADY_CONFIGURED/);
 assert.equal(writes,1);
});
test('forged/missing local session cannot approve revoked relink',async()=>{
 let stores=0;
 const port={
  status:async()=>({ok:true,provider:'PANCAKE_PAIR',revision:3,configured:false,revoked:true}),
  store:async()=>{stores++;throw Error('FORBIDDEN')},
  withPancake:async()=>{throw Error('FORBIDDEN')},
  revoke:async()=>{throw Error('FORBIDDEN')}
 };
 const vault=createW55PancakeWebCustody({nativeKeyPort:port});
 await assert.rejects(vault.saveAccount({
  session:null,explicitUserEntry:true,userAccessToken:'FAKE_OWNER_TOKEN_123',
  ownerReviewedRelink:true,expectedRevokedRevision:3
 }),/PANCAKE_ACCOUNT_USER_INPUT_REQUIRED/);
 assert.equal(stores,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createW55PancakeWebCustody} from './w55-pancake-web-custody.mjs';
const session={record:{kind:'WEB_LOCAL_PRIVATE'}};
function fake(){
 let revision=0,record=null;
 const port={
  status:async({provider})=>{
   assert.equal(provider,'PANCAKE_PAIR');
   return {ok:true,provider,revision,configured:revision>0,revoked:false};
  },
  withPancake:async({expectedRevision},use)=>{
   assert.equal(expectedRevision,revision);
   if(!record)throw Error('NOT_CONFIGURED');
   return use(JSON.parse(record));
  },
  store:async({provider,secret,expectedRevision})=>{
   assert.equal(provider,'PANCAKE_PAIR');
   assert.equal(expectedRevision,revision||undefined);
   revision++;record=secret;
   return {ok:true,provider,revision,configured:true};
  },
  revoke:async()=>({ok:true})
 };
 return {port,get current(){return record}};
}
test('original W55 account token once, per-Page A/B independent encrypted map, no token in HTTP receipt',async()=>{
 const q=fake(),service=createW55PancakeWebCustody({nativeKeyPort:q.port});
 let receipt=await service.saveAccount({session,explicitUserEntry:true,
  userAccessToken:'FAKE-ACCOUNT-ONLY-QA-123456'});
 assert.equal(receipt.revision,1);
 receipt=await service.savePage({session,explicitUserEntry:true,
  pageId:'111',pagePublicApiToken:'FAKE-PAGE-A-ONLY-12345'});
 assert.equal(receipt.revision,2);
 receipt=await service.savePage({session,explicitUserEntry:true,
  pageId:'222',pagePublicApiToken:'FAKE-PAGE-B-ONLY-67890'});
 assert.equal(receipt.revision,3);
 const data=await service.withCredentials(v=>v);
 assert.equal(data.pages['111'],'FAKE-PAGE-A-ONLY-12345');
 assert.equal(data.pages['222'],'FAKE-PAGE-B-ONLY-67890');
 assert.equal(JSON.stringify(receipt).includes('FAKE-'),false);
 receipt=await service.revokePage({session,pageId:'111',explicitUserEntry:true});
 assert.equal(receipt.revoked,true);
 const after=await service.withCredentials(v=>v);
 assert.equal(after.pages['111'],undefined);
 assert.equal(after.pages['222'],'FAKE-PAGE-B-ONLY-67890');
});
test('automatic provider token generation, old credentials resurrection not part of W55',async()=>{
 const q=fake(),service=createW55PancakeWebCustody({nativeKeyPort:q.port});
 await assert.rejects(service.saveAccount({session,userAccessToken:'FAKE-ACCOUNT-TOKEN-12345'}),
   /PANCAKE_ACCOUNT_USER_INPUT_REQUIRED/);
 await service.saveAccount({session,explicitUserEntry:true,
  userAccessToken:'FAKE-ACCOUNT-TOKEN-12345'});
 await assert.rejects(service.saveAccount({session,explicitUserEntry:true,
  userAccessToken:'FAKE-OTHER-ACCOUNT-TOKEN'}),
  /PANCAKE_ACCOUNT_ALREADY_CONFIGURED/);
 assert.equal(JSON.parse(q.current).userAccessToken,'FAKE-ACCOUNT-TOKEN-12345');
});
test('single-page failure does not create a second vault or send path',async()=>{
 const q=fake(),service=createW55PancakeWebCustody({nativeKeyPort:q.port});
 await service.saveAccount({session,explicitUserEntry:true,
  userAccessToken:'FAKE-ACCOUNT-TOKEN-12345'});
 await assert.rejects(service.savePage({session,explicitUserEntry:true,
  pageId:'../../evil',pagePublicApiToken:'FAKE-ANY-TOKEN'}),
  /PANCAKE_PAGE_USER_INPUT_REQUIRED/);
 const after=await service.withCredentials(v=>v);
 assert.deepEqual(after.pages,{});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createPancakeMultiPageManager} from './multi-page-manager.mjs';
function sample({missing=[],wrongToken=[],foreignBinding=false,oldRevocation=false}={}){
 let pageCalls=0,verifyCalls=0,revokeCalls=0;
 const binds=new Map(),steps=[];
 const pages=[
  {id:'1111',name:'Page A',platform:'FACEBOOK'},
  {id:'2222',name:'Page B',platform:'FACEBOOK'},
  {id:'3333',name:'Page C',platform:'FACEBOOK'},
  {id:'4444',name:'Zalo OA',platform:'ZALO'}
 ];
 const manager=createPancakeMultiPageManager({
  listOwnedPages:async()=>{pageCalls++;return {pages,canSend:false};},
  verifyPageAccess:async({pageId})=>{verifyCalls++;return {
    verified:!wrongToken.includes(pageId),pageId,source:'PANCAKE_OFFICIAL_PAGE_API',canSend:false
  }},
  readCurrentW24PageBinding:async({pageId})=>{
    if(foreignBinding)return {pageId:'9999',channel:'FB_PAGE',provider:'PANCAKE'};
    return binds.get(pageId)??null;
  },
  bindVerifiedW24Page:async({pageId})=>{
   steps.push(pageId);
   if(missing.includes(pageId))return {committed:false,pageId};
   if(oldRevocation) return {committed:true,pageId,bindingRevision:1};
   binds.set(pageId,{pageId,channel:'FB_PAGE',provider:'PANCAKE',
     status:'ACTIVE',verified:true,bindingRevision:1});
   return {committed:true,pageId,bindingRevision:1};
  },
  revokeSpecificW24Page:async({pageId})=>{
   revokeCalls++;binds.set(pageId,{pageId,channel:'FB_PAGE',provider:'PANCAKE',status:'REVOKED'});
   return {revoked:true,pageId};
  }
 });
 return {manager,steps,get pageCalls(){return pageCalls},
  get verifyCalls(){return verifyCalls},get revokeCalls(){return revokeCalls}};
}
test('one Pancake user account discovers multiple Facebook Pages without requiring Page IDs entered manually',async()=>{
 const s=sample(),r=await s.manager.discover();
 assert.equal(r.pages.length,3);
 assert.deepEqual(r.pages.map(p=>p.pageId),['1111','2222','3333']);
 assert.ok(r.pages.every(p=>p.connectionState==='NEEDS_PAGE_TOKEN'));
 assert.equal(r.automaticTokenGeneration,false);assert.equal(s.verifyCalls,0);
});
test('two authorized Pages get independent Page-scoped W24 binding receipts',async()=>{
 const s=sample();const r=await s.manager.bindMultiplePages({
   pageIds:['1111','2222'],explicitUserSelection:true
 });
 assert.equal(r.items.length,2);assert.equal(r.allConnected,true);
 assert.equal(r.items[0].bindingRevision,1);
 assert.equal(r.items[1].bindingRevision,1);
 assert.deepEqual(s.steps,['1111','2222']);
 const again=await s.manager.discover();
 assert.equal(again.pages.filter(p=>p.connected).length,2);
});
test('invalid page token affects only that Page, not its siblings',async()=>{
 const s=sample({wrongToken:['2222']});
 const r=await s.manager.bindMultiplePages({
  pageIds:['1111','2222','3333'],explicitUserSelection:true
 });
 assert.deepEqual(r.items.map(p=>p.status),[
  'AUTHORIZED_READ_ONLY','NOT_CONNECTED','AUTHORIZED_READ_ONLY']);
 assert.equal(r.allConnected,false);assert.equal(r.items[1].error,'W27_PAGE_TOKEN_NOT_VERIFIED');
});
test('never generate or rotate Page tokens automatically',async()=>{
 const s=sample();await s.manager.discover();
 assert.equal(s.verifyCalls,0);
 await assert.rejects(s.manager.bindSelectedPage({pageId:'1111'}),
  /W27_EXPLICIT_SELECTED_PAGE_REQUIRED/);
 assert.equal(s.verifyCalls,0);
});
test('unowned Page, duplicate selection, and Zalo OA not mixed into Facebook Page',async()=>{
 const s=sample();
 await assert.rejects(s.manager.bindSelectedPage({
  pageId:'9999',explicitUserSelection:true}),/W27_PAGE_NOT_IN_CURRENT_USER_ACCOUNT/);
 await assert.rejects(s.manager.bindMultiplePages({
  pageIds:['1111','1111'],explicitUserSelection:true}),/W27_MULTI_PAGE_SELECTION_INVALID/);
 await assert.rejects(s.manager.bindSelectedPage({
  pageId:'4444',explicitUserSelection:true}),/W27_PAGE_NOT_IN_CURRENT_USER_ACCOUNT/);
});
test('revoking one Page does not revoke other authorized Pages',async()=>{
 const s=sample();
 await s.manager.bindMultiplePages({pageIds:['1111','2222'],explicitUserSelection:true});
 const r=await s.manager.revokeOne({pageId:'1111',explicitUserSelection:true});
 assert.equal(r.status,'REVOKED');assert.equal(s.revokeCalls,1);
 const refreshed=await s.manager.discover();
 assert.equal(refreshed.pages.find(p=>p.pageId==='1111').connected,false);
 assert.equal(refreshed.pages.find(p=>p.pageId==='2222').connected,true);
});
test('W24 foreign account state and fake write receipt fail closed',async()=>{
 const f=sample({foreignBinding:true});
 await assert.rejects(f.manager.discover(),/W24_PAGE_CROSS_SCOPE_IN_DISCOVERY/);
 const x=sample({missing:['2222']});
 const r=await x.manager.bindMultiplePages({pageIds:['1111','2222'],explicitUserSelection:true});
 assert.equal(r.items[1].status,'NOT_CONNECTED');
 assert.equal(r.items[0].status,'AUTHORIZED_READ_ONLY');
});

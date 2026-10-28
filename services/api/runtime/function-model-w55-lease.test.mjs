import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {createFunctionModelRoutingStore} from './function-model-routing.mjs';
import {createWebPrivateCloudByok} from './web-private-cloud-byok.mjs';
const PROVIDER='OPENROUTER_USER_API',MODEL='anthropic/claude-example';
async function fixture(){
 const folder=mkdtempSync(join(tmpdir(),'yance-function-lease-'));
 let revision=7,configured=true,leaseCount=0;
 const native={
  status:async()=>({provider:'OPENROUTER',configured,revoked:!configured,revision}),
  store:async()=>({configured:true,revoked:false,revision:revision+1}),
  revoke:async()=>({configured:false,revoked:true,revision:revision+1}),
  withSecret:async(args,callback)=>{leaseCount++;return callback('TEST_ONLY_SECRET_KEY_XXXXXXXXXXXXXXXX')}
 };
 const model=()=>({provider:PROVIDER,modelId:MODEL,configured,available:configured,keyRevision:revision});
 const store=createFunctionModelRoutingStore({appLocalDataRoot:folder,readEligibleModels:async()=>[model()]});
 const cloud=createWebPrivateCloudByok({appLocalDataRoot:folder,nativeKeyPort:native,
  resolveScopedSelection:args=>store.matchCloudLease(args)});
 return {folder,store,cloud,model,rotate:()=>revision++,revoke:()=>configured=false,leases:()=>leaseCount,
  close:()=>rmSync(folder,{recursive:true,force:true})};
}
test('PRIVATE scoped model uses W55 exact key revision after explicit user consent; no charge on save',async()=>{
 const f=await fixture();try{
  const result=await f.store.select({functionId:'PRIVATE_BRAIN',provider:PROVIDER,
   modelId:MODEL,confirmPaidCost:true,expectedRevision:0});
  const choice=result.assignments.find(x=>x.functionId==='PRIVATE_BRAIN').choice;
  assert.equal(choice.keyRevision,7);assert.equal(choice.epoch,1);assert.equal(f.leases(),0);
  const claim={modelSelectionEpoch:1};
  const got=await f.cloud.withSecret({profile:claim,provider:'OPENROUTER',modelId:MODEL,selectionEpoch:1},
    async key=>{assert.ok(key.startsWith('TEST_ONLY_'));return 42});
  assert.equal(got,42);assert.equal(f.leases(),1);
  f.rotate();
  await assert.rejects(f.cloud.withSecret({profile:claim,provider:'OPENROUTER',modelId:MODEL,selectionEpoch:1},async()=>1),
   x=>x.status===409);
  assert.equal(f.leases(),1);
 }finally{f.close()}
});
test('reply-only preference cannot lease cloud credentials for unwired W45 executor',async()=>{
 const f=await fixture();try{
  await f.store.select({functionId:'REPLY_SUGGESTIONS',provider:PROVIDER,
    modelId:MODEL,confirmPaidCost:true,expectedRevision:0});
  await assert.rejects(f.cloud.withSecret({profile:{modelSelectionEpoch:1},
    provider:'OPENROUTER',modelId:MODEL,selectionEpoch:1},async()=>1),x=>x.status===409);
  assert.equal(f.leases(),0);
 }finally{f.close()}
});

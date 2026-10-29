import test from 'node:test';
import assert from 'node:assert/strict';
import {createComposerBridge,fullK} from '../src/composer-bridge.mjs';

const A={tenant:'SYNTHETIC_TEST_ONLY',account:'fixture-a',channel:'FB_PERSONAL',
 peer_id:'fake-A',binding_revision:1};
const B={...A,peer_id:'fake-B'},C={...A,account:'fixture-c',peer_id:'fake-C'};
const actions=['TYPE','IME_COMMIT','PASTE','ATTACH','DROP','VOICE','SEND_ATTEMPT'];
function portForAssist({failPost=null,after=null,invalid=null}={}){
 const calls=[],modes=new Map([[fullK(A),'ASSIST'],[fullK(B),'AUTO'],[fullK(C),'AUTO']]);
 const epochs=new Map([[fullK(A),7],[fullK(B),2],[fullK(C),3]]);
 const wrap=(id)=>({identity:{...id},identityKey:fullK(id),status:'NATIVE_TAKEOVER_STATE',
  mode:modes.get(fullK(id)),epoch:epochs.get(fullK(id)),
  accountActive:true,canTakeover:true,accountRevocationEpoch:0,consentEpoch:1,canSend:false});
 return {calls,modes,epochs,
  get:async id=>{calls.push(['GET',fullK(id)]);return invalid?invalid(wrap(id),calls):after&&calls.some(x=>x[0]==='POST')?after(wrap(id)):wrap(id)},
  post:async(id,body)=>{calls.push(['POST',fullK(id),body]);if(failPost)throw Error(failPost);
   assert.equal(body.intent,'TAKEOVER_HUMAN_COMPOSER');assert.ok(actions.includes(body.action));
   assert.equal(body.expectedIdentityKey,fullK(id));assert.equal(body.expectedEpoch,epochs.get(fullK(id)));
   assert.equal(body.expectedAccountRevocationEpoch,0);assert.equal(body.expectedConsentEpoch,1);
   modes.set(fullK(id),'HUMAN');epochs.set(fullK(id),body.expectedEpoch+1);
   return {accepted:true,confirmedByGet:true,identity:{...id},identityKey:fullK(id),
    mode:'HUMAN',epoch:epochs.get(fullK(id)),
    accountRevocationEpoch:0,consentEpoch:1,canSend:false};
  }};
}
test('W24 ASSIST inspection remains visibly ASSIST, passive navigation/view/reselect/quote/draft never POST',async()=>{
 const native=portForAssist(),bridge=createComposerBridge({takeoverPort:native});
 bridge.choose(A);assert.equal((await bridge.inspect(A)).status,'READ_ONLY_ASSIST');
 assert.equal(bridge.view().verifiedEpoch,7);
 bridge.quote(A,{identityKey:fullK(A),mid:'fake-source-mid',original:'Ciao'});
 bridge.adoptCandidate(A,{id:'fake-source-candidate',text:'candidate only',
  provenance:{kind:'AGNO_RUN',runId:'fake-run',identityKey:fullK(A),sourceMid:'fake-mid'}},'fake-mid');
 bridge.choose(B);bridge.choose(C);bridge.choose(A);
 assert.equal((await bridge.inspect(A)).status,'READ_ONLY_ASSIST');
 assert.deepEqual(native.calls.map(x=>x[0]),['GET','GET']);
 for(const action of ['FOCUS','VIEW','HOVER','RIGHT_CLICK','SELECT','SWITCH','CONTEXT_MENU'])
  await assert.rejects(bridge.userAction(A,action),/UNTRUSTED_ACTION/);
 assert.equal(native.calls.some(x=>x[0]==='POST'),false);
 assert.equal(native.modes.get(fullK(A)),'ASSIST');
});
for(const action of actions){
 test('ASSIST real '+action+' performs same K GET→POST→GET and returns HUMAN only at epoch +1',async()=>{
  const native=portForAssist(),bridge=createComposerBridge({takeoverPort:native});bridge.choose(A);
  const payload=action==='TYPE'||action==='IME_COMMIT'||action==='PASTE'?{text:'private draft'}:
   action==='ATTACH'||action==='DROP'?{attachments:[{name:'fake-file.png',size:32}]}:{};
  const result=await bridge.userAction(A,action,payload);
  assert.equal(result.status,'READY_HUMAN',result.reason);assert.equal(result.verifiedEpoch,8);
  assert.equal(result.canSend,false);
  assert.deepEqual(native.calls.map(x=>x[0]),['GET','POST','GET']);
  assert.equal(native.calls[1][2].action,action);
  assert.equal(native.modes.get(fullK(A)),'HUMAN');
  assert.equal(native.modes.get(fullK(B)),'AUTO');
  assert.equal(native.modes.get(fullK(C)),'AUTO');
 });
}
test('A ASSIST takeover is isolated; B/C still AUTO and their drafts preserved',async()=>{
 const native=portForAssist(),bridge=createComposerBridge({takeoverPort:native});
 bridge.choose(B);bridge.adoptCandidate(B,{id:'fake-candidate-B',text:'B untouched',
 provenance:{kind:'AGNO_RUN',runId:'fake-run-B',identityKey:fullK(B),sourceMid:'fake-source-B'}},'fake-source-B');
 bridge.choose(C);await bridge.inspect(C);assert.equal(bridge.view().status,'READ_ONLY_AUTO');
 bridge.choose(A);assert.equal((await bridge.inspect(A)).status,'READ_ONLY_ASSIST');
 assert.equal((await bridge.userAction(A,'PASTE',{text:'A editor'})).status,'READY_HUMAN');
 bridge.choose(B);assert.equal(bridge.view().draft.text,'B untouched');
 assert.equal(native.modes.get(fullK(B)),'AUTO');assert.equal(native.modes.get(fullK(C)),'AUTO');
 assert.deepEqual(native.calls.filter(x=>x[0]==='POST').map(x=>x[1]),[fullK(A)]);
});
test('ASSIST POST rejected 409 leaves unsent draft and never reports HUMAN',async()=>{
 const native=portForAssist({failPost:'NATIVE_HTTP_409'}),bridge=createComposerBridge({takeoverPort:native});
 bridge.choose(A);const r=await bridge.userAction(A,'TYPE',{text:'draft unsent'});
 assert.equal(r.status,'BLOCKED');assert.match(r.reason,/409/);
 assert.equal(r.canSend,false);assert.equal(bridge.view().draft.text,'draft unsent');
 assert.equal(native.modes.get(fullK(A)),'ASSIST');
});
test('ASSIST revoked, expired, wrong current K and stale epoch fail closed',async()=>{
 for(const [name,invalid] of [
  ['revoked',s=>({...s,accountActive:false})],
  ['expired',s=>({...s,canTakeover:false})],
  ['rebound',s=>({...s,identity:{...s.identity,binding_revision:3}})],
  ['wrong-consent',s=>({...s,consentEpoch:0})]
 ]){
  const native=portForAssist({invalid}),bridge=createComposerBridge({takeoverPort:native});
  bridge.choose(A);const r=await bridge.userAction(A,'PASTE',{text:name});
  assert.equal(r.status,'BLOCKED',name);assert.equal(r.canSend,false);
  assert.equal(native.calls.filter(x=>x[0]==='POST').length,0,name);
 }
 const native=portForAssist({after:s=>({...s,epoch:7})}),bridge=createComposerBridge({takeoverPort:native});
 bridge.choose(A);
 const r=await bridge.userAction(A,'SEND_ATTEMPT');
 assert.equal(r.status,'BLOCKED');assert.match(r.reason,/TAKEOVER_NOT_VERIFIED/);
 assert.equal(r.canSend,false);
});
test('ASSIST changed to AUTO in final GET must not be reported HUMAN',async()=>{
 const native=portForAssist({after:s=>({...s,mode:'AUTO'})}),bridge=createComposerBridge({takeoverPort:native});
 bridge.choose(A);const r=await bridge.userAction(A,'VOICE');
 assert.equal(r.status,'BLOCKED');assert.equal(r.canSend,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {fullK,createComposerBridge} from '../src/composer-bridge.mjs';
import {createLoopbackTakeoverPort} from '../src/native-takeover-port.mjs';

// Actually imports existing W24 HTTP owner + W44 SQLite code; no mock authority/sender.
const paths=['YANCE_W24_NATIVE_DIR','YANCE_W44_NATIVE_DIR'];
if(paths.some(name=>!process.env[name])){
 test('real W24/W44 directories required for HTTP test', {skip:'Set YANCE_W24_NATIVE_DIR and YANCE_W44_NATIVE_DIR to checked-out owner source directories'},()=>{});
}else{
 const w24=resolve(process.env.YANCE_W24_NATIVE_DIR);
 const w44=resolve(process.env.YANCE_W44_NATIVE_DIR);
 const load=async(file)=>import(pathToFileURL(file).href);
 const {IdentityConsentService}=await load(join(w24,'identity-consent.mjs'));
 const {TAKEOVER_GET,TAKEOVER_POST,createNativeTakeoverService}=await load(join(w24,'takeover.mjs'));
 const {createNativeTakeoverHttpHandler}=await load(join(w24,'takeover-http.mjs'));
 const {openEligibilityStore}=await load(join(w44,'index.mjs'));
 const {createW24IdentityPorts}=await load(join(w44,'native-bridges.mjs'));
 const context={tenant:'SYNTHETIC_TEST_ONLY',principal_id:'fake-owner-1',input_domain:'CONTACT'};
 const A={tenant:context.tenant,account:'fixture-a',channel:'FB_PERSONAL',peer_id:'fake-contact-A',binding_revision:1};
 const B={...A,account:'fixture-b',peer_id:'fake-contact-B'};
 const C={...A,account:'fixture-c',peer_id:'fake-contact-C'};
 async function setup(){
   const temp=mkdtempSync(join(tmpdir(),'w46-w24-http-'));
   const identity=new IdentityConsentService();
   for(const k of [A,B,C]){
     identity.registerAccount(context,{...k,principal_id:context.principal_id});
     identity.bindPeer(context,k);
   }
   const ports=createW24IdentityPorts({identityService:identity,trustedContext:context,
      readConsentEpoch:({k})=>identity.readConsentEpoch(context,k),
      authorizeOperator:({actor})=>actor===context.principal_id});
   const custody=openEligibilityStore({path:join(temp,'w44.sqlite'),...ports,
     verifyDeliveryArm:({intentId,w25IntentId})=>({verified:intentId==='fake-boundary-lease'&&w25IntentId==='fake-w25-attempt'})});
   for(const id of [B,C])custody.grant({identity:id,scope:'CONTACT',actor:context.principal_id,
      expiresAt:Date.now()+300000,budgetUnits:3});
   const authority=createNativeTakeoverService({identityConsent:identity,custodyStore:custody,
      authorizeTakeover:()=>true});
   const server=createServer(createNativeTakeoverHttpHandler({
      service:authority,resolveTrustedContext:()=>context}));
   await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
   const origin='http://127.0.0.1:'+server.address().port;
   const port=createLoopbackTakeoverPort({baseUrl:origin,enabled:true,
      endpoints:{get:TAKEOVER_GET,post:TAKEOVER_POST}});
   const close=async()=>{await new Promise(resolve=>server.close(resolve));custody.close();rmSync(temp,{recursive:true,force:true})};
   return {origin,port,identity,custody,close};
 }
 async function withServer(fn){
   const s=await setup();try{await fn(s)}finally{await s.close()}
 }
 test('real GET -> complete four-field POST -> client GET verifies same K HUMAN epoch +1; B/C still AUTO',async()=>{
   await withServer(async s=>{
     const trace=[],wrapped={
       get:async id=>{trace.push(['GET',fullK(id)]);return s.port.get(id)},
       post:async(id,data)=>{trace.push(['POST',fullK(id),data]);return s.port.post(id,data)}
     };
     const composer=createComposerBridge({takeoverPort:wrapped});
     composer.choose(A);
     const initial=await composer.inspect(A);
     assert.equal(initial.status,'READ_ONLY_AUTO');
     assert.equal(s.custody.inspection(A).mode,'AUTO');
     assert.equal(trace.filter(x=>x[0]==='POST').length,0);
     const res=await composer.userAction(A,'TYPE',{text:'manual draft'});
     assert.equal(res.status,'READY_HUMAN',res.reason);
     assert.equal(res.verifiedEpoch,1);assert.equal(res.canSend,false);
     assert.deepEqual(trace.map(x=>x[0]),['GET','GET','POST','GET']);
     const body=trace.find(x=>x[0]==='POST')[2];
     assert.deepEqual([body.expectedIdentityKey,body.expectedEpoch,
        body.expectedAccountRevocationEpoch,body.expectedConsentEpoch],
        [fullK(A),0,0,1]);
     assert.equal(s.custody.inspection(A).mode,'HUMAN');
     for(const peer of [B,C]){
       assert.equal(s.custody.inspection(peer).mode,'AUTO');
       assert.equal((await s.port.get(peer)).mode,'AUTO');
       assert.equal(s.custody.inspection(peer).effectiveGrant?.scope,'CONTACT');
     }
     assert.equal(typeof composer.send,'undefined');
   });
 });
 test('focus, select/switch, read inspect and sourced draft adoption never POST',async()=>{
   await withServer(async s=>{
     let posts=0;
     const wrapped={get:s.port.get,post:async(...args)=>{posts++;return s.port.post(...args)}};
     const composer=createComposerBridge({takeoverPort:wrapped});
     for(const peer of [A,B,C]){
       composer.choose(peer);await composer.inspect(peer);
     }
     composer.choose(A);
     composer.adoptCandidate(A,{id:'fake-proposal-1',text:'suggestion only',
       provenance:{kind:'AGNO_RUN',runId:'fake-run',sourceMid:'fake-mid-source',identityKey:fullK(A)}},'fake-mid-source');
     assert.equal(posts,0);
     assert.equal(s.custody.inspection(A).mode,'AUTO');
   });
 });
 test('real W24 HTTP 422 if missing one POST snapshot field: Composer BLOCKED, no false success',async()=>{
   await withServer(async s=>{
     let code=null;
     const wrapped={get:s.port.get,post:async(id,data)=>{
       delete data.expectedConsentEpoch;
       try{return await s.port.post(id,data)}
       catch(e){code=e.message;throw e}
     }};
     const composer=createComposerBridge({takeoverPort:wrapped});
     composer.choose(A);
     const outcome=await composer.userAction(A,'PASTE',{text:'unsent'});
     assert.equal(outcome.status,'BLOCKED');assert.match(outcome.reason,/NATIVE_HTTP_422/);
     assert.match(code,/NATIVE_HTTP_422/);
     assert.equal(s.custody.inspection(A).mode,'AUTO');assert.equal(outcome.canSend,false);
   });
 });
 test('W24 HTTP 409 on stale consent epoch between GET and POST; Composer BLOCKED',async()=>{
   await withServer(async s=>{
     const wrapped={get:s.port.get,post:async(id,data)=>{
       s.identity.createConsent(context,{k:id,consent_id:'fake-consent-race',subject_id:'fake-subject',
         purpose:'TEST',operation:'RECORDING',proof_ref:'fake-evidence',
         now:Date.now(),expires_at:Date.now()+300000});
       return s.port.post(id,data);
     }};
     const composer=createComposerBridge({takeoverPort:wrapped});
     composer.choose(A);const r=await composer.userAction(A,'IME_COMMIT',{text:'local only'});
     assert.equal(r.status,'BLOCKED');assert.match(r.reason,/NATIVE_HTTP_409/);
     assert.equal(s.custody.inspection(A).mode,'AUTO');
   });
 });
 test('W24 HTTP 409 on stale binding and account revocation, no fake success',async()=>{
   await withServer(async s=>{
     const wrapped={get:s.port.get,post:async(id,data)=>{
       s.identity.invalidateAccount(context,{tenant:id.tenant,account:id.account,
         channel:id.channel,expected_revision:1});
       return s.port.post(id,data);
     }};
     const composer=createComposerBridge({takeoverPort:wrapped});
     composer.choose(A);const r=await composer.userAction(A,'ATTACH',{attachments:[{name:'fake.jpg',size:20}]});
     assert.equal(r.status,'BLOCKED');assert.match(r.reason,/NATIVE_HTTP_409/);
     assert.equal(s.custody.inspection(B).mode,'AUTO');
   });
 });
 test('W44 unsettled mutation fence prevents W24 human takeover; no success or send',async()=>{
   await withServer(async s=>{
     const result=s.custody.requestMutationFence({identity:A,scope:'CONTACT',
       actor:context.principal_id,expectedGeneration:0});
     assert.equal(result.ok,true);
     const composer=createComposerBridge({takeoverPort:s.port});composer.choose(A);
     const attempt=await composer.userAction(A,'TYPE',{text:'must stay blocked'});
     assert.equal(attempt.status,'BLOCKED');assert.equal(attempt.canSend,false);
     assert.equal(s.custody.inspection(A).mode,'AUTO');
     assert.equal(s.custody.leaseStatus(A).mutationPending,true);
     assert.equal(s.custody.inspection(B).mode,'AUTO');
   });
 });
 test('POST 200 not enough: forged accepted without authoritative confirmedByGet remains BLOCKED',async()=>{
   await withServer(async s=>{
     const wrapped={get:s.port.get,post:async(id,request)=>{
       const actual=await s.port.post(id,request);
       return {...actual,confirmedByGet:false};
     }};
     const composer=createComposerBridge({takeoverPort:wrapped});composer.choose(A);
     const r=await composer.userAction(A,'DROP',{attachments:[{name:'fake.pdf',size:3}]});
     assert.equal(r.status,'BLOCKED');assert.match(r.reason,/TAKEOVER_POST_NOT_CONFIRMED/);
     assert.equal(r.canSend,false);
   });
 });
 test('already HUMAN: second real user edit skips POST but reconfirms two GETs',async()=>{
   await withServer(async s=>{
     const composer=createComposerBridge({takeoverPort:s.port});composer.choose(A);
     assert.equal((await composer.userAction(A,'TYPE',{text:'first'})).status,'READY_HUMAN');
     let postCount=0,getCount=0;
     const next=createComposerBridge({takeoverPort:{
       get:async id=>{getCount++;return s.port.get(id)},
       post:async(id,payload)=>{postCount++;return s.port.post(id,payload)}
     }});
     next.choose(A);
     assert.equal((await next.userAction(A,'PASTE',{text:'second'})).status,'READY_HUMAN');
     assert.equal(postCount,0);assert.equal(getCount,2);
   });
 });
 test('two real simultaneous W24 HTTP POST requests with same four-field GET snapshot yield 200 + 409',async()=>{
   await withServer(async s=>{
     const before=await s.port.get(A);
     const payload={
       expectedIdentityKey:before.identityKey,expectedEpoch:before.epoch,
       expectedAccountRevocationEpoch:before.accountRevocationEpoch,
       expectedConsentEpoch:before.consentEpoch,
       action:'TYPE',intent:'TAKEOVER_HUMAN_COMPOSER'};
     const both=await Promise.allSettled([s.port.post(A,payload),s.port.post(A,payload)]);
     assert.equal(both.filter(x=>x.status==='fulfilled'&&x.value.accepted===true).length,1);
     assert.equal(both.filter(x=>x.status==='rejected'&&/NATIVE_HTTP_409/.test(x.reason?.message)).length,1);
     assert.equal((await s.port.get(A)).mode,'HUMAN');
     assert.equal((await s.port.get(A)).epoch,before.epoch+1);
     assert.equal((await s.port.get(B)).mode,'AUTO');
     assert.equal((await s.port.get(C)).mode,'AUTO');
   });
 });
 test('real W44 unsettled PRE_NETWORK send boundary lease blocks W24 takeover until W25 proof',async()=>{
   await withServer(async s=>{
     const grant=s.custody.grant({identity:A,scope:'CONTACT',actor:context.principal_id,
       expiresAt:Date.now()+300000,budgetUnits:3});
     assert.equal(grant.enabled,true);
     const reserve=s.custody.reserve({identity:A,intentId:'fake-boundary-lease',units:1});
     assert.equal(reserve.ok,true);
     const entered=s.custody.enterBoundary({identity:A,intentId:'fake-boundary-lease'});
     assert.equal(entered.ok,true);
     const armed=s.custody.armSend({identity:A,intentId:'fake-boundary-lease',w25IntentId:'fake-w25-attempt'});
     assert.equal(armed.ok,true);
     assert.equal(s.custody.leaseStatus(A).active,true);
     const composer=createComposerBridge({takeoverPort:s.port});composer.choose(A);
     const outcome=await composer.userAction(A,'PASTE',{text:'not sent while unresolved'});
     assert.equal(outcome.status,'BLOCKED');
     assert.equal(outcome.canSend,false);
     assert.equal(s.custody.inspection(A).mode,'AUTO');
     assert.equal(s.custody.leaseStatus(A).active,true);
     for(const peer of [B,C])assert.equal(s.custody.inspection(peer).mode,'AUTO');
   });
 });
}

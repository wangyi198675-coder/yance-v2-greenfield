import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {IdentityConsentService} from './identity-consent.mjs';
import {TAKEOVER_GET,TAKEOVER_POST,createNativeTakeoverService} from './takeover.mjs';
import {createNativeTakeoverHttpHandler} from './takeover-http.mjs';

// These are the ACTUAL PR #32/W44 source modules, not a copied/mock custody.
const root=process.env.YANCE_PR32_ROOT;
if(!root)throw Error('YANCE_PR32_ROOT_EXISTING_WORKTREE_REQUIRED');
const w44=resolve(root,'services/api/src/domains/grant-custody-budget');
const {openEligibilityStore}=await import(pathToFileURL(join(w44,'index.mjs')).href);
const {createW24IdentityPorts}=await import(pathToFileURL(join(w44,'native-bridges.mjs')).href);
const tenant='SYNTHETIC_TEST_ONLY';
const ctx={tenant,principal_id:'fake-owner-1',input_domain:'CONTACT'};
const identity=(account='fixture-a',peer_id='fake-contact-A')=>
  ({tenant,account,channel:'FB_PERSONAL',peer_id,binding_revision:1});
const A=identity(),B=identity('fixture-b','fake-contact-B'),
  C=identity('fixture-c','fake-contact-C');
async function setup({trusted=()=>ctx,authorized=()=>true}={}){
  const tmp=mkdtempSync(join(tmpdir(),'w24-human-cas-'));
  const ids=new IdentityConsentService();
  for(const k of [A,B,C]){
    ids.registerAccount(ctx,{...k,principal_id:ctx.principal_id});
    ids.bindPeer(ctx,k);
  }
  const ports=createW24IdentityPorts({identityService:ids,trustedContext:ctx,
    readConsentEpoch:({k})=>ids.readConsentEpoch(ctx,k),
    authorizeOperator:({actor})=>actor===ctx.principal_id});
  const store=openEligibilityStore({path:join(tmp,'w44.sqlite'),...ports});
  for(const k of [B,C]){
    store.grant({identity:k,scope:'CONTACT',actor:ctx.principal_id,
      expiresAt:Date.now()+300000,budgetUnits:3});
  }
  const service=createNativeTakeoverService({
    identityConsent:ids,custodyStore:store,authorizeTakeover:authorized
  });
  const server=createServer(createNativeTakeoverHttpHandler({
    service,resolveTrustedContext:trusted
  }));
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok)});
  const url='http://127.0.0.1:'+server.address().port;
  const head={'X-Yance-Environment':'synthetic-only'};
  const get=async(k=A,headers=head)=>{
    const key=[k.tenant,k.account,k.channel,k.peer_id,k.binding_revision].join('|');
    const res=await fetch(url+TAKEOVER_GET+'?k='+encodeURIComponent(key),{headers});
    return {status:res.status,body:await res.json()};
  };
  const post=async(k=A,receipt=null,action='PASTE',override={},headers=head)=>{
    const s=receipt?.body??receipt;
    const data={identity:k,intent:'TAKEOVER_HUMAN_COMPOSER',action,
      expectedIdentityKey:s?.identityKey,
      expectedEpoch:s?.epoch??0,
      expectedAccountRevocationEpoch:s?.accountRevocationEpoch??0,
      expectedConsentEpoch:s?.consentEpoch??1,...override};
    const res=await fetch(url+TAKEOVER_POST,{method:'POST',headers:{...headers,'content-type':'application/json'},
      body:JSON.stringify(data)});
    return {status:res.status,body:await res.json()};
  };
  return {tmp,ids,store,service,server,url,get,post,head,
    close:async()=>{await new Promise(ok=>server.close(ok));store.close();rmSync(tmp,{recursive:true,force:true})}};
}
const withFixture=async(fn,options)=>{const f=await setup(options);try{await fn(f)}finally{await f.close()}};

test('GET exposes W24 current full-K, consent and account epochs plus real W44 custody; no mutation',async()=>{
  await withFixture(async f=>{
    const first=await f.get();
    assert.equal(first.status,200);
    assert.equal(first.body.mode,'AUTO');
    assert.equal(first.body.epoch,0);
    assert.equal(first.body.accountRevocationEpoch,0);
    assert.equal(first.body.consentEpoch,1);
    assert.equal(first.body.accountActive,true);
    assert.equal(first.body.canTakeover,true);
    assert.equal(first.body.canSend,false);
    assert.deepEqual(first.body.identity,A);
    assert.equal((await f.get()).body.epoch,0);
    assert.equal(f.store.inspection(A).custodyEpoch,0);
  });
});

test('real POST W44 CAS -> second server GET same K HUMAN/new epoch, no send',async()=>{
  await withFixture(async f=>{
    const before=await f.get(A);
    const committed=await f.post(A,before,'PASTE');
    assert.equal(committed.status,200);
    assert.equal(committed.body.accepted,true);
    assert.equal(committed.body.confirmedByGet,true);
    assert.equal(committed.body.epoch,1);
    assert.equal(committed.body.canSend,false);
    assert.deepEqual(committed.body.identity,A);
    const actual=await f.get(A);
    assert.equal(actual.body.mode,'HUMAN');
    assert.equal(actual.body.epoch,1);
    assert.equal(f.store.inspection(A).mode,'HUMAN');
    // W44 existing grants on B and C were not canceled by A's actual HUMAN takeover.
    for(const k of [B,C]){
      const s=await f.get(k);
      assert.equal(s.body.mode,'AUTO');
      assert.equal(s.body.epoch,0);
      assert.equal(f.store.inspection(k).effectiveGrant.scope,'CONTACT');
    }
  });
});

test('GET only, wrong user action, passive focus/view/selection never take over',async()=>{
  await withFixture(async f=>{
    const before=await f.get();
    for(const action of ['FOCUS','SELECT','VIEW','SWITCH','INSPECT']){
      const result=await f.post(A,before,action);
      assert.equal(result.status,422);
      assert.equal(result.body.accepted,false);
    }
    assert.equal((await f.get()).body.mode,'AUTO');
    assert.equal(f.store.inspection(A).custodyEpoch,0);
  });
});

test('all seven explicit edit/paste/media/send-attempt actions are accepted as W44 USER_EDIT only',async()=>{
  for(const action of ['TYPE','IME_COMMIT','PASTE','ATTACH','DROP','VOICE','SEND_ATTEMPT']){
    await withFixture(async f=>{
      const result=await f.post(A,await f.get(A),action);
      assert.equal(result.status,200,action+': '+JSON.stringify(result.body));
      assert.equal((await f.get()).body.mode,'HUMAN');
    });
  }
});

test('identical old epoch, expired client snapshot, reused POST all fail 409 not success',async()=>{
  await withFixture(async f=>{
    const old=await f.get();
    const committed=await f.post(A,old,'TYPE');
    assert.equal(committed.status,200);
    const replay=await f.post(A,old,'TYPE');
    assert.equal(replay.status,409);
    assert.equal(replay.body.accepted,false);
    assert.equal((await f.get()).body.epoch,1);
    const wrongEpoch=await f.post(A,old,'TYPE',{expectedEpoch:9});
    assert.equal(wrongEpoch.status,409);
  });
});

test('two concurrent takeover requests using same W44 SQLite CAS admit exactly one',async()=>{
  await withFixture(async f=>{
    const old=await f.get();
    const two=await Promise.all([f.post(A,old,'TYPE'),f.post(A,old,'PASTE')]);
    assert.deepEqual(two.map(x=>x.status).sort(),[200,409]);
    assert.equal(two.filter(x=>x.body.accepted===true).length,1);
    assert.equal((await f.get()).body.epoch,1);
    assert.equal(f.store.inspection(B).mode,'AUTO');
  });
});

test('old account revocation epoch and consent epoch are rejected 409',async()=>{
  await withFixture(async f=>{
    const before=await f.get();
    assert.equal((await f.post(A,before,'TYPE',{expectedAccountRevocationEpoch:15})).status,409);
    assert.equal((await f.post(A,before,'TYPE',{expectedConsentEpoch:44})).status,409);
    assert.equal((await f.post(A,before,'TYPE',{expectedConsentEpoch:undefined})).status,422);
    assert.equal((await f.get()).body.mode,'AUTO');
  });
});

test('consent create/revoke advances epoch: old GET token cannot cause takeover',async()=>{
  await withFixture(async f=>{
    const before=await f.get();
    f.ids.createConsent(ctx,{k:A,consent_id:'fake-consent-A',subject_id:'fake-subject',
      purpose:'TEST',operation:'RECORDING',proof_ref:'fake-proof',
      expires_at:Date.now()+200000});
    assert.equal((await f.post(A,before)).status,409);
    const mid=await f.get();
    f.ids.revokeConsent(ctx,{consent_id:'fake-consent-A',expected_revision:1,
      idempotency_key:'fake-revoke'});
    assert.equal((await f.post(A,mid)).status,409);
    assert.equal((await f.get()).body.mode,'AUTO');
  });
});

test('account disconnect/rebind invalidates old K, no takeover even after explicit relink',async()=>{
  await withFixture(async f=>{
    const old=await f.get();
    f.ids.invalidateAccount(ctx,{...A,expected_revision:1});
    assert.equal((await f.post(A,old)).status,409);
    assert.equal((await f.get()).status,409);
    f.ids.relinkAccount(ctx,{...A,expected_revision:2});
    assert.equal((await f.post(A,old)).status,409);
    assert.equal(f.store.inspection(B).mode,'AUTO');
  });
});

test('cross account, cross principal, untrusted HTTP and forged trusted claim fail closed',async()=>{
  await withFixture(async f=>{
    const before=await f.get();
    assert.equal((await f.post(identity('fixture-attacker','fake-contact-A'),before)).status,409); // Unknown K/binding fails closed.
    assert.equal((await f.post(A,before,'TYPE',{identity:B})).status,409,
      'GET snapshot from A cannot be swapped onto B even when owner controls both');
  });
  await withFixture(async f=>{
    assert.equal((await f.get()).status,401);
    assert.equal((await f.post(A,null,'TYPE')).status,401);
  },{trusted:()=>null});
  await withFixture(async f=>{
    assert.equal((await f.get()).status,403);
  },{trusted:()=>({...ctx,principal_id:'fake-attacker'})});
});

test('HTTP route/method/env strictness; no fake success when auth action denied',async()=>{
  await withFixture(async f=>{
    const missing=await f.get(A,{});
    assert.equal(missing.status,403);
    const wrong=await fetch(f.url+TAKEOVER_POST,{method:'GET',headers:f.head});
    assert.equal(wrong.status,405);
    const before=await f.get();
    assert.equal((await f.post(A,before,'TYPE')).status,403);
    assert.equal((await f.get()).body.mode,'AUTO');
  },{authorized:({action})=>action==='READ_STATE'});
});

test('POST success is not returned when W44 mutation is not confirmed by real GET',async()=>{
  const ids=new IdentityConsentService();
  ids.registerAccount(ctx,{...A,principal_id:ctx.principal_id});
  ids.bindPeer(ctx,A);
  const falseCustody={
    inspection:()=>({ok:true,mode:'AUTO',custodyEpoch:0}),
    setCustody:()=>({mode:'HUMAN',epoch:1})
  };
  const svc=createNativeTakeoverService({identityConsent:ids,custodyStore:falseCustody,
    authorizeTakeover:()=>true});
  const before=svc.get({trustedContext:ctx,identity:A});
  assert.throws(()=>svc.post({trustedContext:ctx,identity:A,
    expectedIdentityKey:before.identityKey,
    expectedEpoch:before.epoch,expectedAccountRevocationEpoch:before.accountRevocationEpoch,
    expectedConsentEpoch:before.consentEpoch,action:'TYPE',
    intent:'TAKEOVER_HUMAN_COMPOSER'}),e=>e.code==='TAKEOVER_POST_VERIFY_FAILED');
});

test('existing W46 loopback GET/POST port talks to exact W24 owner endpoints',async()=>{
  const w46root=process.env.YANCE_W46_ROOT;
  if(!w46root)throw Error('YANCE_W46_ROOT_EXISTING_W46_WORKTREE_REQUIRED');
  const {createLoopbackTakeoverPort}=await import(pathToFileURL(
    resolve(w46root,'apps/web/src/native-takeover-port.mjs')).href);
  await withFixture(async f=>{
    const port=createLoopbackTakeoverPort({baseUrl:f.url,enabled:true,
      endpoints:{get:TAKEOVER_GET,post:TAKEOVER_POST}});
    const first=await port.get(A);
    assert.equal(first.mode,'AUTO');
    assert.equal(first.epoch,0);
    const success=await port.post(A,{
      expectedIdentityKey:first.identityKey,
      expectedEpoch:first.epoch,
      expectedAccountRevocationEpoch:first.accountRevocationEpoch,
      expectedConsentEpoch:first.consentEpoch,
      action:'PASTE',intent:'TAKEOVER_HUMAN_COMPOSER'
    });
    assert.equal(success.accepted,true);
    assert.equal(success.confirmedByGet,true);
    const after=await port.get(A);
    assert.equal(after.mode,'HUMAN');
    assert.equal(after.epoch,1);
    assert.equal((await port.get(B)).mode,'AUTO');
    assert.equal((await port.get(C)).mode,'AUTO');
  });
});

test('current W46 Composer forwards all CAS versions; real PASTE becomes HUMAN after W24 GET→POST→GET',async()=>{
  const w46root=process.env.YANCE_W46_ROOT;
  if(!w46root)throw Error('YANCE_W46_ROOT_EXISTING_W46_WORKTREE_REQUIRED');
  const src=resolve(w46root,'apps/web/src');
  const {createLoopbackTakeoverPort}=await import(pathToFileURL(join(src,'native-takeover-port.mjs')).href);
  const {createComposerBridge}=await import(pathToFileURL(join(src,'composer-bridge.mjs')).href);
  await withFixture(async f=>{
    const port=createLoopbackTakeoverPort({baseUrl:f.url,enabled:true,
      endpoints:{get:TAKEOVER_GET,post:TAKEOVER_POST}});
    const bridge=createComposerBridge({takeoverPort:port});
    bridge.choose(A);
    const before=await port.get(A);
    assert.equal(before.mode,'AUTO');
    const inspected=await bridge.inspect(A);
    assert.equal(inspected.status,'READ_ONLY_AUTO');
    assert.equal((await port.get(A)).epoch,before.epoch,
      'select/view/inspect must never take human custody');
    const response=await bridge.userAction(A,'PASTE',{text:'fake-test-edit'});
    assert.equal(response.status,'READY_HUMAN');
    assert.equal(response.key,before.identityKey);
    assert.equal(response.verifiedEpoch,before.epoch+1);
    assert.equal(response.canSend,false,'takeover is never a send authorization');
    const after=await port.get(A);
    assert.deepEqual(after.identity,before.identity);
    assert.equal(after.identityKey,before.identityKey);
    assert.equal(after.mode,'HUMAN');
    assert.equal(after.epoch,before.epoch+1);
    assert.equal(after.accountRevocationEpoch,before.accountRevocationEpoch);
    assert.equal(after.consentEpoch,before.consentEpoch);
    assert.equal(f.store.inspection(A).mode,'HUMAN','must reflect W44 SQLite custody');
    for(const peer of [B,C]){
      const other=await port.get(peer);
      assert.equal(other.mode,'AUTO');
      assert.equal(other.epoch,0);
      assert.equal(f.store.inspection(peer).effectiveGrant.scope,'CONTACT');
    }
  });
});

test('current W46 HTTP rejects stale full-K and stale custody CAS with independent 409 responses',async()=>{
  await withFixture(async f=>{
    const before=await f.get(A);
    const badK=await f.post(A,before,'TYPE',{expectedIdentityKey:
      'SYNTHETIC_TEST_ONLY|fixture-a|FB_PERSONAL|fake-contact-A|99'});
    assert.equal(badK.status,409);
    assert.equal(badK.body.accepted,false);
    assert.equal(badK.body.error,'STALE_TAKEOVER_IDENTITY');
    const staleEpoch=await f.post(A,before,'PASTE',{expectedEpoch:before.body.epoch+1});
    assert.equal(staleEpoch.status,409);
    assert.equal(staleEpoch.body.accepted,false);
    assert.equal(staleEpoch.body.error,'STALE_TAKEOVER_EPOCH');
    assert.equal((await f.get(A)).body.mode,'AUTO');
    for(const peer of [B,C])assert.equal((await f.get(peer)).body.mode,'AUTO');
  });
});

test('current W46 HTTP rejects missing mandatory CAS fields with independent 422 responses',async()=>{
  await withFixture(async f=>{
    const before=await f.get(A);
    const missingConsent=await f.post(A,before,'TYPE',{expectedConsentEpoch:undefined});
    assert.equal(missingConsent.status,422);
    assert.equal(missingConsent.body.error,'EXPECTED_EPOCHS_REQUIRED');
    assert.equal(missingConsent.body.accepted,false);
    const missingAccount=await f.post(A,before,'PASTE',{expectedAccountRevocationEpoch:undefined});
    assert.equal(missingAccount.status,422);
    assert.equal(missingAccount.body.error,'EXPECTED_EPOCHS_REQUIRED');
    assert.equal(missingAccount.body.accepted,false);
    assert.equal((await f.get(A)).body.mode,'AUTO');
    for(const peer of [B,C])assert.equal((await f.get(peer)).body.mode,'AUTO');
  });
});

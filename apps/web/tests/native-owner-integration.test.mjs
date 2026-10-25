// Actual W24/W45 source integration tests. Run with exact owner file paths in env,
// not with imported mock domain implementations or any platform/model network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createComposerBridge,fullK} from '../src/composer-bridge.mjs';
import {createW24ReadOnlyPort,readW45ForComposer} from '../src/native-owner-bindings.mjs';
if(!process.env.YANCE_W24_MODULE||!process.env.YANCE_W45_MODULE){
  test('native Owner source paths explicitly required', {skip:'Use exact W24 and W45 checked-out source modules; not a mock or CI proof'},()=>{});
}else{
 const W24=await import(pathToFileURL(process.env.YANCE_W24_MODULE).href);
 const W45=await import(pathToFileURL(process.env.YANCE_W45_MODULE).href);
 const identity={tenant:'SYNTHETIC_TEST_ONLY',account:'fixture-account-1',
   channel:'FB_PERSONAL',peer_id:'fake-peer-001',binding_revision:1};
 const ctx={tenant:identity.tenant,principal_id:'fake-owner-1',input_domain:'CONTACT'};
 function owner(){
   const svc=new W24.IdentityConsentService();
   svc.registerAccount(ctx,{...identity,principal_id:ctx.principal_id});
   svc.bindPeer(ctx,identity);
   return svc;
 }
 test('W24 actual native IdentityConsent assertCurrent/evaluate grant only READ, no takeover post',async()=>{
   const svc=owner(),port=createW24ReadOnlyPort({identityConsent:svc,trustedContext:ctx});
   assert.equal(W24.canonicalK(identity),fullK(identity));
   assert.equal((await port.get(identity)).status,'IDENTITY_READ_VERIFIED');
   assert.equal(typeof port.post,'undefined');
   const composer=createComposerBridge({takeoverPort:port});
   composer.choose(identity);
   assert.equal((await composer.inspect(identity)).status,'READ_ONLY_IDENTITY_VERIFIED');
   const action=await composer.userAction(identity,'TYPE',{text:'draft'});
   assert.equal(action.status,'READ_ONLY_NO_TAKEOVER_API');assert.equal(action.canSend,false);
   assert.equal(composer.view().draft.text,'draft');
 });
 test('actual W24 revocation fences an old Composer K immediately',async()=>{
   const svc=owner(),port=createW24ReadOnlyPort({identityConsent:svc,trustedContext:ctx});
   svc.invalidateAccount(ctx,{tenant:identity.tenant,account:identity.account,
     channel:identity.channel,expected_revision:1});
   await assert.rejects(()=>port.get(identity),/ACCOUNT_OR_PEER_UNBOUND|STALE_BINDING_REVISION/);
   const composer=createComposerBridge({takeoverPort:port});composer.choose(identity);
   assert.equal((await composer.inspect(identity)).status,'BLOCKED');
   assert.equal((await composer.userAction(identity,'PASTE',{text:'never send'})).canSend,false);
 });
 test('W45 actual native PeopleService ingest original, translator absent => no zh/candidates',async()=>{
   const people=W45.createPeopleTranslationReplyService(),svc=owner();
   const input={identity,mid:'fake-mid-w46-001',original:'Guten Morgen',
     targetLanguage:'zh-CN',source:{kind:'SYNTHETIC_FIXTURE',fixture_id:'W46-integration-01'}};
   const received=await people.ingestInbound(input);
   assert.equal(received.translation.status,'UNAVAILABLE');
   const output=readW45ForComposer({identityConsent:svc,trustedContext:ctx,
     peopleService:people,identity,mid:input.mid});
   assert.equal(output.original,input.original);assert.equal(output.zh,null);
   assert.deepEqual(output.suggestions,[]);assert.equal(output.canSend,false);
   assert.equal(output.delivery,'NOT_REQUESTED');
 });
 test('W45 actual fixture translator is displayed as fixture-only, never authentic zh',async()=>{
   const svc=owner();
   const translator={translate:async x=>({status:'OK',translatedText:'模拟译文',
     sourceLanguage:'de',targetLanguage:x.targetLanguage,
     provenance:{kind:'SYNTHETIC_FIXTURE',provider:'fixture-only',
       requestId:'fake-translate-01',sourceMid:x.mid,inputSha256:x.inputSha256}})};
   const people=W45.createPeopleTranslationReplyService({translator});
   await people.ingestInbound({identity,mid:'fake-mid-w46-002',original:'Hallo',
     targetLanguage:'zh-CN',source:{kind:'SYNTHETIC_FIXTURE',fixture_id:'W46-002'}});
   const out=readW45ForComposer({identityConsent:svc,trustedContext:ctx,
     peopleService:people,identity,mid:'fake-mid-w46-002'});
   assert.equal(out.translationStatus,'FIXTURE_ONLY');assert.equal(out.zh,null);
   assert.equal(out.translationProvenance,null);assert.equal(out.suggestions.length,0);
 });
 test('W45 cannot mix same peer across account; actual W24 current identity checked',async()=>{
   const svc=owner(),people=W45.createPeopleTranslationReplyService();
   await people.ingestInbound({identity,mid:'fake-mid-w46-003',original:'Cześć',
     targetLanguage:'zh-CN',source:{kind:'SYNTHETIC_FIXTURE',fixture_id:'W46-003'}});
   const wrong={...identity,account:'fixture-account-2'};
   assert.throws(()=>readW45ForComposer({identityConsent:svc,trustedContext:ctx,
     peopleService:people,identity:wrong,mid:'fake-mid-w46-003'}),/ACCOUNT_UNBOUND/);
   assert.throws(()=>readW45ForComposer({identityConsent:svc,trustedContext:ctx,
     peopleService:people,identity,mid:'fake-mid-w46-999'}),/UNKNOWN_K_OR_MID/);
 });
}

if(process.env.YANCE_W24_MODULE&&process.env.YANCE_W45_MODULE){
 test('real W45 DTO LOCAL_ENGINE metadata alone is NOT proof of translation model quality',async()=>{
   const native24=await import(pathToFileURL(process.env.YANCE_W24_MODULE).href);
   const native45=await import(pathToFileURL(process.env.YANCE_W45_MODULE).href);
   const id={tenant:'SYNTHETIC_TEST_ONLY',account:'fixture-account-1',channel:'TELEGRAM_PERSONAL',
     peer_id:'fake-peer-125',binding_revision:1};
   const context={tenant:id.tenant,principal_id:'fake-owner-1',input_domain:'CONTACT'};
   const svc=new native24.IdentityConsentService();
   svc.registerAccount(context,{...id,principal_id:context.principal_id});
   svc.bindPeer(context,id);
   // Deliberate test stub, must NOT count as verified translation.
   const translator={translate:async req=>({status:'OK',translatedText:'unvalidated result',
     sourceLanguage:'en',targetLanguage:req.targetLanguage,
     provenance:{kind:'LOCAL_ENGINE',provider:'unverified-test-stub',
       requestId:'fake-translation-attempt',sourceMid:req.mid,inputSha256:req.inputSha256}})};
   const people=native45.createPeopleTranslationReplyService({translator});
   await people.ingestInbound({identity:id,mid:'fake-mid-w46-unqualified',
     original:'hello',targetLanguage:'zh-CN',
     source:{kind:'SYNTHETIC_FIXTURE',fixture_id:'W46-no-quality-attestation'}});
   const row=readW45ForComposer({identityConsent:svc,trustedContext:context,peopleService:people,
     identity:id,mid:'fake-mid-w46-unqualified'});
   assert.equal(row.translationStatus,'TRANSLATED'); // owner metadata only
   assert.equal(row.zh,null);assert.equal(row.translationProvenance,null);
   assert.deepEqual(row.suggestions,[]); // user cannot see synthetic translation as verified
 });
}

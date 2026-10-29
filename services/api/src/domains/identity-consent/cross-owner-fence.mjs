/**
 * W24-owned read-only cross-owner regression runner for PR #32 composition.
 * node cross-owner-fence.mjs <absolute path to an EXISTING PR32 worktree>
 * Imports existing W44 native-bridges/index; does not duplicate its schema.
 * Nonproduction fake accounts and temporary SQLite only.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {IdentityConsentService} from './identity-consent.mjs';

const root=process.argv[2];
if(!root)throw Error('EXISTING_PR32_COMPOSITION_WORKTREE_REQUIRED');
const dir=resolve(root,'services/api/src/domains/grant-custody-budget');
for(const f of ['index.mjs','native-bridges.mjs'])
  if(!existsSync(join(dir,f)))throw Error('W44_SOURCE_MISSING:'+f);
const {openEligibilityStore}=await import(pathToFileURL(join(dir,'index.mjs')).href);
const {createW24IdentityPorts,createW24GrantAuthority,createW25EligibilityPort}=
  await import(pathToFileURL(join(dir,'native-bridges.mjs')).href);
const {MessageDelivery,SyntheticConnectorSink}=
  await import(pathToFileURL(resolve(root,'services/api/src/domains/message-delivery/index.mjs')).href);
const temp=mkdtempSync(join(tmpdir(),'w24-w44-consent-fence-'));
const k={tenant:'SYNTHETIC_TEST_ONLY',account:'fixture-w24-account',channel:'FB_PERSONAL',
  peer_id:'fake-contact-A',binding_revision:1};
const b={tenant:k.tenant,account:k.account,channel:k.channel,peer_id:k.peer_id};
const ctx={tenant:k.tenant,principal_id:'fake-owner-1',input_domain:'CONTACT'};
const ids=new IdentityConsentService({proofAuthority:{evaluate:()=>({approved:true})}});
ids.registerAccount(ctx,{...k,principal_id:ctx.principal_id});
ids.bindPeer(ctx,k);
const ports=createW24IdentityPorts({identityService:ids,trustedContext:ctx,
  readConsentEpoch:({k})=>ids.readConsentEpoch(ctx,k),
  authorizeOperator:({actor})=>actor===ctx.principal_id});
let store;
try {
  store=openEligibilityStore({path:join(temp,'w44.sqlite'),...ports});
  store.grant({identity:k,scope:'GLOBAL',actor:ctx.principal_id,budgetUnits:3,
    expiresAt:Date.now()+300000});
  const idA='fake-consent-fence-A';
  assert.equal(store.reserve({identity:k,intentId:idA,units:1}).ok,true);
  assert.equal(store.checkForSend({identity:k,intentId:idA}).ok,true);
  assert.equal(ids.readConsentEpoch(ctx,k),1);

  ids.createConsent(ctx,{k,consent_id:'fake-consent-A',subject_id:'fake-user',
    proof_ref:'fake-proof',operation:'VOICE_SYNTHESIS',purpose:'SYNTHETIC_PERSONALIZATION',
    expires_at:Date.now()+300000});
  const consentEpoch=ids.readConsentEpoch(ctx,k);
  assert.equal(consentEpoch,2);
  const staleOnConsentCreate=store.checkForSend({identity:k,intentId:idA});
  assert.equal(staleOnConsentCreate.ok,false);
  assert.equal(staleOnConsentCreate.reason,'W24_EPOCH_STALE');
  assert.equal(store.finish({identity:k,intentId:idA,action:'RELEASE'}).ok,true);
  const idB='fake-consent-fence-B';
  assert.equal(store.reserve({identity:k,intentId:idB,units:1}).ok,true);
  ids.revokeConsent(ctx,{consent_id:'fake-consent-A',expected_revision:1,
    idempotency_key:'fake-revoke-A'});
  assert.equal(ids.readConsentEpoch(ctx,k),3);
  const staleOnRevocation=store.checkForSend({identity:k,intentId:idB});
  assert.equal(staleOnRevocation.ok,false);
  assert.equal(staleOnRevocation.reason,'W24_EPOCH_STALE');

  const idC='fake-binding-fence-C';
  assert.equal(store.reserve({identity:k,intentId:idC,units:1}).ok,true);
  ids.invalidateAccount(ctx,{...b,expected_revision:1});
  // The existing W44 adapter propagates W24's fail-closed exception rather
  // than normalizing it into {ok:false}; this integration shape remains W44-owned.
  assert.throws(()=>store.checkForSend({identity:k,intentId:idC}),
    e=>e?.code==='ACCOUNT_OR_PEER_UNBOUND');
  console.log('W24_W44_REAL_BRIDGE_SYNTHETIC_PASS',JSON.stringify({
    cases:3,actualW44SQLite:true,consentEpoch,
    consentCreateFenced:staleOnConsentCreate.reason,
    consentRevokeFenced:staleOnRevocation.reason,
    bindingInvalidateFenced:'THROWS_ACCOUNT_OR_PEER_UNBOUND',providerSends:0}));

  // Execute W25's actual existing PRE_NETWORK boundary: queued intent,
  // consent revoked before dispatch, zero calls to W25's SYNTHETIC sink.
  let store2,delivery;
  const k2={...k,account:'fixture-w24-b',peer_id:'fake-contact-B'};
  const agent=()=>({active:true,revision:'fake-agent-v1'});
  const nativeGrant=createW24GrantAuthority({getStore:()=>store2,readAgentState:agent});
  const ids2=new IdentityConsentService({grantAuthority:nativeGrant,
    proofAuthority:{evaluate:()=>({approved:true})}});
  try {
    ids2.registerAccount(ctx,{...k2,principal_id:ctx.principal_id});
    ids2.bindPeer(ctx,k2);
    const port2=createW24IdentityPorts({identityService:ids2,trustedContext:ctx,
      readConsentEpoch:({k})=>ids2.readConsentEpoch(ctx,k),
      authorizeOperator:({actor})=>actor===ctx.principal_id});
    store2=openEligibilityStore({path:join(temp,'w44b.sqlite'),...port2});
    store2.grant({identity:k2,scope:'GLOBAL',actor:ctx.principal_id,
      budgetUnits:3,expiresAt:Date.now()+300000});
    const elig=createW25EligibilityPort({store:store2,identityService:ids2,
      trustedContext:ctx,readAgentState:agent,
      readRouteState:()=>({ready:true,revision:'fake-route-v1'})});
    const sink=new SyntheticConnectorSink();
    delivery=new MessageDelivery({databasePath:join(temp,'w25.sqlite'),eligibility:elig,sink,
      receiptVerifier:async()=>({verified:true,source:'SYNTHETIC_TEST_ONLY'})});
    const k25={tenantId:k2.tenant,accountId:k2.account,channel:k2.channel,
      peerId:k2.peer_id,bindingRevision:'1'};
    const intent=await delivery.submitIntent({k:k25,
      businessMessageId:'fake-w24-cross-boundary',
      payload:{text:'synthetic only; must be blocked by consent revocation'},
      mode:'AUTO',actorId:ctx.principal_id,sessionId:'fake-session'});
    assert.equal(intent.state,'QUEUED');
    ids2.createConsent(ctx,{k:k2,consent_id:'fake-consent-B',subject_id:'fake-user',
      proof_ref:'fake-proof',operation:'VOICE_SYNTHESIS',purpose:'SYNTHETIC_TEST',
      expires_at:Date.now()+300000});
    ids2.revokeConsent(ctx,{consent_id:'fake-consent-B',expected_revision:1,
      idempotency_key:'fake-revoke-B'});
    const result=await delivery.dispatchOne(intent.id);
    assert.equal(result.state,'DENIED');
    assert.equal(sink.calls.length,0);
    console.log('W24_W44_W25_REAL_PRE_NETWORK_REVOKE_PASS',JSON.stringify({
      state:result.state,sinkCalls:sink.calls.length,actualW44SQLite:true,actualW25OutboxSQLite:true,
      providerConnected:false}));
  } finally {
    delivery?.close();store2?.close();
  }
} finally {
  store?.close();
  rmSync(temp,{recursive:true,force:true});
}

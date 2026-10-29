import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalK} from './identity-consent.mjs';
import {createW24ConversationAccessPort} from './native-conversation-access.mjs';

const principal=Object.freeze({verified:true,source:'W54_NATIVE_CURRENT_USER',
 principalRef:'fake-owner',installationRef:'fake-install',
 revocationGeneration:1});
const session={id:'fake-session'};
const K=(account='fixture-A')=>Object.freeze({tenant:'SYNTHETIC_TEST_ONLY',
 account,channel:'FB_PAGE',peer_id:'fake-same-peer',binding_revision:1});
function fixture(){
 let revoked=false,profile=principal,denyRbac=false,changeOnRead=false;
 let reads=0,mutations=0,confirm=false;
 const accounts=()=>['fixture-A','fixture-B'].filter(x=>!revoked||x!=='fixture-A')
  .map((account,i)=>({accountRef:account==='fixture-A'?'accountAAA':'accountBBB',
   accountId:account,tenant:'SYNTHETIC_TEST_ONLY',channel:'FB_PAGE',
   authorization:'ONLINE_VERIFIED',ownerPrincipalRef:principal.principalRef,
   bindingRevision:1,accountEpoch:0}));
 const contacts=()=>accounts().map(a=>({
  accountRef:a.accountRef,peerRef:'fake-same-peer',channel:'FB_PAGE',
  bindingRevision:1,identity:K(a.accountId),
  identityKey:canonicalK(K(a.accountId)),accountEpoch:changeOnRead&&reads>1?1:0,
  consentEpoch:1,w24CurrentKVerified:true,w24ConsentCurrent:true,
  displayName:'Same Name'
 }));
 const port=createW24ConversationAccessPort({
  resolveNativePrincipal:async()=>profile,
  readW24AuthorizedAccounts:async()=>accounts(),
  readW24VerifiedContacts:async()=>{reads++;return contacts()},
  authorizeOwnerRbac:async({action,actor,identityKey,scope})=>
   denyRbac?{authorized:false}:{authorized:true,action,actor,identityKey,scope},
  newServerScopedRequestId:async()=>{mutations++;return 'fake-request-'+mutations},
  verifyOriginalDeleteConfirmation:async({actor,identityKey,operation,
    confirmationRef,expectedConversationVersion})=>({
     verified:confirm,actor,identityKey,operation,confirmationRef,
     expectedConversationVersion,expiresAt:110000}),
  clock:()=>100000
 });
 const base=(account='fixture-A')=>({principal,session,
  contactSelector:canonicalK(K(account))});
 const action=(operation,account='fixture-A')=>({
  ...base(account),operation,expectedConversationVersion:4,
  expectedBindingRevision:1,expectedAccountEpoch:0,expectedConsentEpoch:1
 });
 return {port,base,action,readCount:()=>reads,mutateCount:()=>mutations,
  revoke:()=>revoked=true,rbacDeny:()=>denyRbac=true,
  changePrincipal:()=>profile={...principal,revocationGeneration:2},
  changeEpoch:()=>changeOnRead=true,confirm:()=>confirm=true};
}
test('requires existing original identity, RBAC and server request ports',()=>{
 assert.throws(()=>createW24ConversationAccessPort(),
  /W24_ORIGINAL_IDENTITY_RBAC_PORTS_REQUIRED/);
});
test('two same-name and same Peer contacts on different accounts never coalesce',async()=>{
 const f=fixture(),a=await f.port.readAccess(f.base('fixture-A')),
  b=await f.port.readAccess(f.base('fixture-B'));
 assert.notEqual(a.identityKey,b.identityKey);
 assert.notEqual(a.accountRef,b.accountRef);
 assert.equal(a.identity.peer_id,b.identity.peer_id);
 assert.equal(a.persisted,false);assert.equal(a.canSend,false);
 assert.equal(f.mutateCount(),0);
});
test('all conversation operation proofs are server-side, scoped and never claim DB writes',async()=>{
 const f=fixture();
 for(const operation of ['PIN','UNPIN','MARK_UNREAD','MARK_READ',
  'UNMUTE','ARCHIVE','RESTORE']){
  const x=await f.port.prepareMutation(f.action(operation));
  assert.equal(x.operation,operation);assert.equal(x.persisted,false);
  assert.equal(x.expectedConversationVersion,4);
  assert.equal(x.scope,'CONTACT');assert.equal(x.actor,principal.principalRef);
 }
 assert.equal(f.mutateCount(),7);
});
test('denies browser-supplied unknown peer/account, wrong RBAC and revoked account',async()=>{
 const f=fixture();
 await assert.rejects(f.port.readAccess({...f.base(),
  contactSelector:canonicalK({...K(),peer_id:'fake-other'})}),
  /W24_CONTACT_OUTSIDE_CURRENT_SCOPE/);
 f.rbacDeny();
 await assert.rejects(f.port.prepareMutation(f.action('PIN')),
  /CONVERSATION_RBAC_NOT_AUTHORIZED/);
 const g=fixture();g.revoke();
 await assert.rejects(g.port.readAccess(g.base()),
  /W24_CONTACT_OUTSIDE_CURRENT_SCOPE/);
 const b=await g.port.readAccess(g.base('fixture-B'));
 assert.equal(b.identity.account,'fixture-B');
});
test('stale identity epoch, account switch during authorization and W54 revoke fail closed',async()=>{
 const f=fixture();
 await assert.rejects(f.port.prepareMutation({...f.action('PIN'),
  expectedAccountEpoch:2}),/W24_STALE_IDENTITY_EPOCH/);
 const g=fixture();g.changeEpoch();
 await assert.rejects(g.port.readAccess(g.base()),/W24_CURRENT_ACCOUNT_PEER_EPOCH_REQUIRED/);
 const h=fixture();h.changePrincipal();
 await assert.rejects(h.port.readAccess(h.base()),/NATIVE_OWNER_CHANGED/);
});
test('mute requires bounded duration and favorite requires original MID, not fake write',async()=>{
 const f=fixture();
 await assert.rejects(f.port.prepareMutation(f.action('MUTE_UNTIL')),
  /W24_MUTE_DURATION_INVALID/);
 const mute=await f.port.prepareMutation({...f.action('MUTE_UNTIL'),
  muteUntil:125000});
 assert.equal(mute.muteUntil,125000);
 await assert.rejects(f.port.prepareMutation(f.action('FAVORITE_MESSAGE')),
  /W24_ORIGINAL_MESSAGE_MID_REQUIRED/);
 const favorite=await f.port.prepareMutation({...f.action('FAVORITE_MESSAGE'),
  providerMid:'fake-provider-mid'});
 assert.equal(favorite.providerMid,'fake-provider-mid');
});
test('deletion requires independent confirmation and explicit local/soft semantics',async()=>{
 const f=fixture();
 for(const op of ['LOCAL_HIDE','SOFT_DELETE'])
  await assert.rejects(f.port.prepareMutation(f.action(op)),
   /W24_DELETE_CONFIRMATION_REQUIRED/);
 await assert.rejects(f.port.prepareMutation({...f.action('SOFT_DELETE'),
  confirmationRef:'fake-user-confirmation'}),/W24_DELETE_PROOF_NOT_VERIFIED/);
 f.confirm();
 const r=await f.port.prepareMutation({...f.action('SOFT_DELETE'),
  confirmationRef:'fake-user-confirmation'});
 assert.equal(r.deleteSemantics,'SOFT_DELETE');
 assert.equal(r.confirmationVerified,true);
 assert.equal(r.persisted,false);
 await assert.rejects(f.port.prepareMutation(f.action('PROVIDER_DELETE')),
  /W24_CONVERSATION_ACTION_INVALID/);
});
test('version from Conversation DB is mandatory; W24 never invents 409 DB version',async()=>{
 const f=fixture();
 await assert.rejects(f.port.prepareMutation({...f.action('PIN'),
  expectedConversationVersion:undefined}),/W24_EXPLICIT_CAS_REQUIRED/);
 const r=await f.port.prepareMutation(f.action('PIN'));
 assert.equal(r.expectedConversationVersion,4);
 assert.equal('dbVersion' in r,false);
 assert.equal('committed' in r,false);
});

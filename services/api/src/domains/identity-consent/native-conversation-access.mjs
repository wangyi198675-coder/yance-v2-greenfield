/**
 * W24-only permission and current-identity fence for original Conversation
 * database Owner. DOES NOT persist state, change a conversation, or call SDK.
 * All selectors are looked up in the current authorized W24/Provider roster.
 */
import {canonicalK} from './identity-consent.mjs';

const READ=new Set(['READ_CONVERSATION','READ_PROFILE','READ_CONVERSATION_INFO']);
const WRITE=new Set(['PIN','UNPIN','MARK_UNREAD','MARK_READ','MUTE_UNTIL',
 'UNMUTE','ARCHIVE','RESTORE','FAVORITE_MESSAGE','UNFAVORITE_MESSAGE',
 'LOCAL_HIDE','SOFT_DELETE']);
const DELETES=new Set(['LOCAL_HIDE','SOFT_DELETE']);
const FAVORITES=new Set(['FAVORITE_MESSAGE','UNFAVORITE_MESSAGE']);
const fail=code=>{const e=new Error(code);e.code=code;throw e};
const isText=(x,max=900)=>typeof x==='string'&&x.length>0&&x.length<=max;
const int=x=>Number.isSafeInteger(x)&&x>=0;
const sameNative=(a,b)=>a?.verified===true&&b?.verified===true&&
 a.source==='W54_NATIVE_CURRENT_USER'&&b.source===a.source&&
 isText(a.principalRef,200)&&a.principalRef===b.principalRef&&
 a.installationRef===b.installationRef&&
 a.revocationGeneration===b.revocationGeneration;
const equal=(a,b)=>a?.identityKey===b?.identityKey&&
 a?.accountRef===b?.accountRef&&a?.accountEpoch===b?.accountEpoch&&
 a?.consentEpoch===b?.consentEpoch&&a?.bindingRevision===b?.bindingRevision;

/**
 * The actual RBAC and Conversation DB Owner MUST inject their existing ports;
 * a default allow or mock durable state is intentionally not provided.
 */
export function createW24ConversationAccessPort({
 resolveNativePrincipal,readW24AuthorizedAccounts,readW24VerifiedContacts,
 authorizeOwnerRbac,newServerScopedRequestId,verifyOriginalDeleteConfirmation,
 clock=Date.now
}={}){
 if([resolveNativePrincipal,readW24AuthorizedAccounts,readW24VerifiedContacts,
  authorizeOwnerRbac,newServerScopedRequestId,clock].some(p=>typeof p!=='function')||
  (verifyOriginalDeleteConfirmation!==undefined&&
   typeof verifyOriginalDeleteConfirmation!=='function'))
  fail('W24_ORIGINAL_IDENTITY_RBAC_PORTS_REQUIRED');

 async function current({principal,session,selector}){
  if(!isText(selector))fail('W24_FULL_K_LOOKUP_REQUIRED');
  const native=await resolveNativePrincipal({session,operation:'READ_CONTACTS'});
  if(!sameNative(principal,native))fail('NATIVE_OWNER_CHANGED');
  const accounts=await readW24AuthorizedAccounts({principal:native,session});
  const peers=await readW24VerifiedContacts({principal:native,session,accounts});
  if(!Array.isArray(accounts)||!Array.isArray(peers))fail('W24_OWNER_SCOPE_NOT_VERIFIED');
  const matches=peers.filter(c=>c.identityKey===selector);
  if(matches.length!==1)fail('W24_CONTACT_OUTSIDE_CURRENT_SCOPE');
  const peer=matches[0],account=accounts.find(a=>a.accountRef===peer.accountRef);
  const k=peer.identity;
  if(!account||account.ownerPrincipalRef!==native.principalRef||
     account.authorization!=='ONLINE_VERIFIED'||
     account.channel!==peer.channel||account.tenant!==k?.tenant||
     account.accountId!==k?.account||
     account.bindingRevision!==k?.binding_revision||
     peer.peerRef!==k?.peer_id||peer.bindingRevision!==k?.binding_revision||
     canonicalK(k)!==selector||!int(peer.accountEpoch)||!int(account.accountEpoch)||
     !int(peer.consentEpoch)||peer.consentEpoch<=0||
     peer.accountEpoch!==account.accountEpoch||
     peer.w24CurrentKVerified!==true||peer.w24ConsentCurrent!==true)
   fail('W24_CURRENT_ACCOUNT_PEER_EPOCH_REQUIRED');
  return Object.freeze({principal:native,account,peer,k:Object.freeze({...k})});
 }
 async function authorized({principal,session,selector,action}){
  const first=await current({principal,session,selector});
  const grant=await authorizeOwnerRbac({actor:first.principal.principalRef,
   identity:first.k,identityKey:selector,accountRef:first.peer.accountRef,
   action,scope:'CONTACT',accountEpoch:first.peer.accountEpoch,
   consentEpoch:first.peer.consentEpoch});
  if(grant?.authorized!==true||grant?.action!==action||
    grant.actor!==first.principal.principalRef||
    grant.identityKey!==selector||grant.scope!=='CONTACT')
   fail('CONVERSATION_RBAC_NOT_AUTHORIZED');
  const last=await current({principal,session,selector});
  if(!sameNative(first.principal,last.principal)||
     !equal(first.peer,last.peer)||canonicalK(last.k)!==canonicalK(first.k))
   fail('W24_CONVERSATION_SCOPE_CHANGED');
  return last;
 }
 async function readAccess({principal,session,contactSelector,
   operation='READ_CONVERSATION'}={}){
  if(!READ.has(operation))fail('W24_READ_ACTION_INVALID');
  const x=await authorized({principal,session,selector:contactSelector,action:operation});
  return Object.freeze({authorized:true,persisted:false,operation,
   identity:Object.freeze({...x.k}),identityKey:canonicalK(x.k),
   actor:x.principal.principalRef,accountRef:x.peer.accountRef,
   bindingRevision:x.k.binding_revision,accountEpoch:x.peer.accountEpoch,
   consentEpoch:x.peer.consentEpoch,scope:'CONTACT',canSend:false});
 }
 async function prepareMutation({principal,session,contactSelector,operation,
   expectedConversationVersion,expectedBindingRevision,expectedAccountEpoch,
   expectedConsentEpoch,muteUntil=null,providerMid=null,confirmationRef=null}={}){
  if(!WRITE.has(operation))fail('W24_CONVERSATION_ACTION_INVALID');
  if(!int(expectedConversationVersion)||!int(expectedAccountEpoch)||
     !int(expectedConsentEpoch)||!Number.isSafeInteger(expectedBindingRevision)||
     expectedBindingRevision<=0)
   fail('W24_EXPLICIT_CAS_REQUIRED');
  const x=await authorized({principal,session,selector:contactSelector,action:operation});
  if(x.k.binding_revision!==expectedBindingRevision||
     x.peer.accountEpoch!==expectedAccountEpoch||
     x.peer.consentEpoch!==expectedConsentEpoch)
   fail('W24_STALE_IDENTITY_EPOCH');
  if(operation==='MUTE_UNTIL'&&
     (!int(muteUntil)||muteUntil<=clock()||
       muteUntil>clock()+30*24*60*60*1000))
   fail('W24_MUTE_DURATION_INVALID');
  if(FAVORITES.has(operation)&&!isText(providerMid,250))
   fail('W24_ORIGINAL_MESSAGE_MID_REQUIRED');
  if(DELETES.has(operation)){
   if(!isText(confirmationRef,180)||
      typeof verifyOriginalDeleteConfirmation!=='function')
    fail('W24_DELETE_CONFIRMATION_REQUIRED');
   const proof=await verifyOriginalDeleteConfirmation({
    session,actor:x.principal.principalRef,identity:x.k,
    identityKey:contactSelector,operation,confirmationRef,
    expectedConversationVersion,now:clock()});
   if(proof?.verified!==true||proof.actor!==x.principal.principalRef||
      proof.identityKey!==contactSelector||proof.operation!==operation||
      proof.confirmationRef!==confirmationRef||!int(proof.expiresAt)||
      proof.expiresAt<=clock()||proof.expectedConversationVersion!==expectedConversationVersion)
    fail('W24_DELETE_PROOF_NOT_VERIFIED');
  }
  const id=await newServerScopedRequestId({
   session,principal:x.principal,identityKey:contactSelector,operation});
  if(!isText(id,180))fail('W24_SERVER_REQUEST_ID_REQUIRED');
  const closing=await current({principal,session,selector:contactSelector});
  if(!sameNative(closing.principal,x.principal)||!equal(closing.peer,x.peer))
   fail('W24_CONVERSATION_SCOPE_CHANGED');
  // The original Conversation DB must enforce expectedConversationVersion
  // atomically and return 409; this W24 DTO is NOT a DB write or ACK.
  return Object.freeze({authorized:true,persisted:false,scope:'CONTACT',
   identity:Object.freeze({...x.k}),identityKey:contactSelector,
   actor:x.principal.principalRef,accountRef:x.peer.accountRef,operation,
   idempotencyKey:id,expectedConversationVersion,
   expectedBindingRevision,expectedAccountEpoch,expectedConsentEpoch,
   ...(operation==='MUTE_UNTIL'?{muteUntil}:{}),
   ...(FAVORITES.has(operation)?{providerMid}:{}),
   ...(DELETES.has(operation)?{deleteSemantics:operation,
     confirmationVerified:true}:{}),canSend:false});
 }
 return Object.freeze({readAccess,prepareMutation});
}

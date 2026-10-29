/**
 * W24-only, read-only Smart Inbox projection from the EXISTING durable W24/W44
 * identity authority and the four original verified upstream account/peer ports.
 *
 * No user/contact database, new login, artificial unread counts, W46 takeover,
 * outbound Sender, or platform SDK is created here.
 */
import {canonicalK} from './identity-consent.mjs';

const fail=code=>{throw Object.assign(new Error(code),{code})};
const CHANNELS=new Set(['FB_PERSONAL','FB_PAGE','WHATSAPP_PERSONAL','TELEGRAM_PERSONAL']);
const bounded=(x,n)=>typeof x==='string'&&x.length>0&&x.length<=n;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 Object.getPrototypeOf(x)===Object.prototype;
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const flags=new Set(['unreadOnly','pinnedOnly','archivedOnly','managedOnly','needsReplyOnly','tag']);
const filters=new Set(['channel','accountRef','query',...flags]);

function validateFilter(input){
 if(!plain(input)||Object.keys(input).some(k=>!filters.has(k)))
   fail('W24_CONTACT_FILTER_INVALID');
 const channel=input.channel??'ALL',accountRef=input.accountRef??'ALL',query=input.query??'';
 if(channel!=='ALL'&&!CHANNELS.has(channel)||
   accountRef!=='ALL'&&!bounded(accountRef,150)||
   typeof query!=='string'||query.length>120)
   fail('W24_CONTACT_FILTER_INVALID');
 for(const name of flags){
  if(!own(input,name))continue;
  if(name==='tag'?!bounded(input.tag,80):typeof input[name]!=='boolean')
   fail('W24_CONTACT_FILTER_INVALID');
 }
 return {channel,accountRef,query:query.normalize('NFKC').toLocaleLowerCase(),
   requestedFlags:[...flags].filter(k=>own(input,k)),
   ...Object.fromEntries([...flags].filter(k=>own(input,k)).map(k=>[k,input[k]]))};
}
function matchingK(contact,account){
 const k=contact?.identity;
 if(!k||!plain(k)||!CHANNELS.has(k.channel)||k.channel!==contact.channel||
   k.channel!==account.channel||k.tenant!==account.tenant||
   k.account!==account.accountId||k.peer_id!==contact.peerRef||
   k.binding_revision!==contact.bindingRevision||
   k.binding_revision!==account.bindingRevision||
   !Number.isSafeInteger(k.binding_revision)||k.binding_revision<1||
   contact.identityKey!==canonicalK(k)||
   !Number.isSafeInteger(contact.accountEpoch)||contact.accountEpoch<0||
   contact.accountEpoch!==account.accountEpoch||
   !Number.isSafeInteger(contact.consentEpoch)||contact.consentEpoch<1||
   contact.w24CurrentKVerified!==true||contact.w24ConsentCurrent!==true)
   fail('W24_VERIFIED_FULL_K_REQUIRED');
 return k;
}
function checkedSnapshot(accounts,contacts){
 if(!Array.isArray(accounts)||accounts.length>50||!Array.isArray(contacts)||contacts.length>10000)
   fail('W24_ORIGINAL_CONTACT_SCOPE_INVALID');
 const byRef=new Map(),byK=new Set();
 for(const a of accounts){
  if(!plain(a)||!bounded(a.accountRef,150)||byRef.has(a.accountRef)||
    !CHANNELS.has(a.channel)||a.authorization!=='ONLINE_VERIFIED'||
    !bounded(a.tenant,200)||!bounded(a.accountId,200)||
    !Number.isSafeInteger(a.bindingRevision)||a.bindingRevision<1||
    !Number.isSafeInteger(a.accountEpoch)||a.accountEpoch<0)
   fail('W24_AUTHORIZED_ACCOUNT_REQUIRED');
  byRef.set(a.accountRef,a);
 }
 const rows=[];
 for(const c of contacts){
  if(!plain(c)||!byRef.has(c.accountRef)||!bounded(c.displayName,180))
   fail('W24_CONTACT_OUTSIDE_ACCOUNT_SCOPE');
  const account=byRef.get(c.accountRef),k=matchingK(c,account);
  if(byK.has(c.identityKey))fail('W24_DUPLICATE_CANONICAL_CONTACT');
  byK.add(c.identityKey);
  rows.push(Object.freeze({
   // The original five-part K itself is the stable cross-restart selector.
   contactRef:c.identityKey,identityKey:c.identityKey,
   identity:Object.freeze({...k}),
   tenant:k.tenant,accountId:k.account,accountRef:c.accountRef,
   channel:k.channel,peerRef:k.peer_id,
   bindingRevision:k.binding_revision,accountEpoch:c.accountEpoch,
   consentEpoch:c.consentEpoch,displayName:c.displayName,
   w24CurrentKVerified:true,w24ConsentCurrent:true
  }));
 }
 return rows;
}
const pick=(rows,filter)=>rows.filter(c=>
  (filter.channel==='ALL'||c.channel===filter.channel)&&
  (filter.accountRef==='ALL'||c.accountRef===filter.accountRef)&&
  (!filter.query||[c.displayName,c.peerRef,c.accountRef].some(s=>
    s.normalize('NFKC').toLocaleLowerCase().includes(filter.query))));
function trustedMeta(contacts,rows){
 if(!Array.isArray(rows)||rows.length!==contacts.length)fail('ORIGINAL_CONTACT_METADATA_UNAVAILABLE');
 const byId=new Map();
 for(const r of rows){
  if(!plain(r)||!bounded(r.identityKey,900)||byId.has(r.identityKey)||
    r.authoritative!==true||!bounded(r.accountRef,150)||
    !Number.isSafeInteger(r.bindingRevision)||r.bindingRevision<1)
   fail('ORIGINAL_CONTACT_METADATA_UNVERIFIED');
  byId.set(r.identityKey,r);
 }
 for(const c of contacts){
  const r=byId.get(c.identityKey);
  if(!r||r.accountRef!==c.accountRef||r.bindingRevision!==c.bindingRevision||
     r.accountEpoch!==c.accountEpoch||r.consentEpoch!==c.consentEpoch)
   fail('ORIGINAL_CONTACT_METADATA_SCOPE_STALE');
 }
 return byId;
}
export function createW24ScopedContactProjection({
 readW24AuthorizedAccounts,readW24VerifiedContacts,readOriginalContactMetadata
}={}){
 if(typeof readW24AuthorizedAccounts!=='function'||typeof readW24VerifiedContacts!=='function'||
    readOriginalContactMetadata!==undefined&&typeof readOriginalContactMetadata!=='function')
   fail('W24_ORIGINAL_AUTHORIZED_READ_PORTS_REQUIRED');
 async function readContacts({principal,session,filter={}}={}){
  const f=validateFilter(filter);
  // ALWAYS enumerate the user's entire current authorized W24 scope first.
  // Browser-supplied search/account filters can only reduce this scope.
  const accounts=await readW24AuthorizedAccounts({principal,session});
  const verified=await readW24VerifiedContacts({principal,session,accounts});
  const base=checkedSnapshot(accounts,verified);
  if(f.accountRef!=='ALL'&&!accounts.some(a=>a.accountRef===f.accountRef))
   fail('ACCOUNT_FILTER_OUTSIDE_AUTHORIZED_SCOPE');
  let result=pick(base,f);
  if(f.requestedFlags.length>0){
   if(typeof readOriginalContactMetadata!=='function')
    fail('CONTACT_FILTER_NATIVE_METADATA_NOT_CONNECTED');
   // Metadata MUST be read from existing W25/managed original owner, and
   // may NEVER expand identity/K, create a zero unread value or new peer.
   const metas=trustedMeta(base,await readOriginalContactMetadata({
     principal,session,contacts:base.map(c=>({identityKey:c.identityKey,
      identity:c.identity,accountRef:c.accountRef,accountEpoch:c.accountEpoch,
      consentEpoch:c.consentEpoch}))}));
   result=result.filter(c=>{
    const m=metas.get(c.identityKey);
    if(f.requestedFlags.some(k=>k!=='tag'&&typeof m[k]!=='boolean'))
     fail('CONTACT_FILTER_NATIVE_METADATA_NOT_CONNECTED');
    if(own(f,'tag')&&(!Array.isArray(m.tags)||!m.tags.every(t=>bounded(t,80))))
     fail('CONTACT_FILTER_NATIVE_METADATA_NOT_CONNECTED');
    return f.requestedFlags.every(k=>k==='tag'?m.tags.includes(filter.tag):
      m[k]===filter[k]);
   });
   // Owner statuses can be stale after an async native call; W24 rechecks
   // K/epoch and account scope before returning anything to W47.
   const closingAccounts=await readW24AuthorizedAccounts({principal,session});
   const closingRows=checkedSnapshot(closingAccounts,
     await readW24VerifiedContacts({principal,session,accounts:closingAccounts}));
   if(closingRows.length!==base.length||
     closingRows.some(c=>!base.some(a=>a.identityKey===c.identityKey&&
      a.accountEpoch===c.accountEpoch&&a.consentEpoch===c.consentEpoch)))
    fail('W24_AUTHORIZED_SCOPE_CHANGED_DURING_FILTER');
  }
  return Object.freeze({
   authoritative:true,source:'W24_CURRENT_K_AND_NATIVE_CHANNEL_OWNERS',
   connectedAccountCount:accounts.length,
   // These are NOT unread totals. No false zero is supplied.
   contacts:Object.freeze(result),canSend:false
  });
 }
 return Object.freeze({readContacts});
}

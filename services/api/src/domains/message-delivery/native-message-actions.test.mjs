import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createW25MessageActionFence} from './native-message-actions.mjs';

const k=(peerId='peerA',accountId='acctA')=>({tenantId:'local-authorized-test',
 accountId,channel:'WHATSAPP_PERSONAL',peerId,bindingRevision:'3'});
const full=x=>[x.tenantId,x.accountId,x.channel,x.peerId,x.bindingRevision].join('|');
const origin=(p='m-in',fromMe=0,k0=k())=>({
 k:k0,mid:p,fromMe
});
function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'w25-action-owner-')),path=join(dir,'original-outbox.sqlite');
 const instances=[];
 let w24=true,w44=true,agent=true,capable=true,expiry=false,accountEpoch='4',consentEpoch='7';
 let calls=0;
 const open=()=>{
  const db=new DatabaseSync(path,{timeout:3000});
  db.exec("PRAGMA journal_mode=WAL;CREATE TABLE IF NOT EXISTS inbound_messages("+
   "id TEXT PRIMARY KEY,tenant_id TEXT,account_id TEXT,channel TEXT,peer_id TEXT,"+
   "binding_revision TEXT,source TEXT,provider_mid TEXT,from_me INTEGER)");
  const delivery={db,tx(fn){
   db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v}
   catch(e){db.exec('ROLLBACK');throw e}
  }};
  const fence=createW25MessageActionFence({
   delivery,now:()=>1_000_000,
   checkW24:async ({k:x,actorId,sessionId})=>({
    valid:w24&&x.peerId!=='peerC',strictDurable:true,accountActive:true,identityKey:full(x),
    channelAccountId:x.accountId,peerId:x.peerId,bindingRevision:x.bindingRevision,
    actorId,sessionId,accountEpoch,consentEpoch,expiresAt:expiry?900_000:2_000_000
   }),
   checkW44:async ({k:x,actorId,mode})=>({
    allowed:w44,actorId,identityKey:full(x),accountEpoch,consentEpoch,
    custodyEpoch:'8',grantRevision:'9',agentRevision:'10',agentActive:agent,
    grantActive:true,humanAuthorized:true,expiresAt:expiry?900_000:2_000_000
   }),
   checkNativeCapability:async ({k:x,action,providerMid})=>{
    calls++;return {verified:capable,status:'SIGNED_CAPABILITY_PRESENT',
      accountId:x.accountId,channel:x.channel,action,providerMid}
   }
  });
  instances.push(db);
  return {db,fence,delivery};
 };
 const a=open();
 const add=({k:k0,mid,fromMe})=>a.db.prepare('INSERT INTO inbound_messages VALUES(?,?,?,?,?,?,?,?,?)')
  .run('history-'+k0.accountId+'-'+k0.peerId+'-'+mid,k0.tenantId,k0.accountId,
    k0.channel,k0.peerId,k0.bindingRevision,'baileys',mid,fromMe);
 add(origin('m-in',0));add(origin('m-out',1));add(origin('m-B',0,k('peerB')));
 add(origin('m-foreign',0,k('peerA','acctB')));
 t.after(()=>{instances.reverse().forEach(x=>x.close());
  rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:50})});
 return {a,open,add,get calls(){return calls},
  disableW24:()=>w24=false,disableW44:()=>w44=false,
  stopAgent:()=>agent=false,removeCapability:()=>capable=false,
  expire:()=>expiry=true,changeEpoch:()=>accountEpoch='5'};
}
const req=(action='REACTION',mid='m-in',more={})=>({
 k:k(),action,providerMid:mid,requestId:'request-1',actorId:'actorA',
 sessionId:'sessionA',mode:'HUMAN',payload:{emoji:'👍'},...more
});
test('missing original W25/W24/W44/provider port fails closed',()=>{
 assert.throws(()=>createW25MessageActionFence(),/ORIGINAL_W25_W24_W44_OWNER_PORTS_REQUIRED/);
});
test('verified source MID qualifies hold with no provider attempt, ACK or network',t=>{
 const h=fixture(t);
 const r=h.a.fence.prepare(req());
 return r.then(v=>{
  assert.equal(v.state,'HELD_FOR_PROVIDER_OWNER');
  assert.equal(v.canSend,false);assert.equal(v.canAutoRetry,false);
  assert.equal(v.providerAckVerified,false);assert.equal(v.duplicate,false);
  assert.equal(h.a.db.prepare('SELECT COUNT(*) AS n FROM message_action_holds').get().n,1);
  assert.throws(()=>h.a.fence.dispatch(),/SECOND_SENDER_FORBIDDEN/);
  assert.throws(()=>h.a.fence.recordProviderReceipt(),/NO_LINKED_W25_PROVIDER_ATTEMPT/);
 });
});
test('same request and changed request ID dedupe across separate WAL workers; payload conflict 409',async t=>{
 const h=fixture(t),second=h.open();
 const [a,b]=await Promise.all([h.a.fence.prepare(req()),second.fence.prepare(req())]);
 assert.equal(Number(a.duplicate)+Number(b.duplicate),1);
 const c=await second.fence.prepare(req('REACTION','m-in',{requestId:'request-2'}));
 assert.equal(c.duplicate,true);assert.equal(c.id,a.id);
 await assert.rejects(h.a.fence.prepare(req('REACTION','m-in',
  {payload:{emoji:'❤️'}})),/NATIVE_ACTION_REQUEST_CONFLICT/);
 assert.equal(h.a.db.prepare('SELECT COUNT(*) AS n FROM message_action_holds').get().n,1);
});
test('reaction quote/reply binds original provider MID; forwarding checks recipient K',async t=>{
 const h=fixture(t);
 const q=await h.a.fence.prepare(req('QUOTE_REPLY','m-in',{
  requestId:'quote',payload:{text:'reply in original Composer'}}));
 assert.equal(q.providerMid,'m-in');assert.equal(q.canSend,false);
 const f=await h.a.fence.prepare(req('FORWARD','m-in',{requestId:'forward',
  targetK:k('peerB'),payload:{text:'forward in original Composer'}}));
 assert.equal(f.action,'FORWARD');
 await assert.rejects(h.a.fence.prepare(req('FORWARD','m-in',{
  targetK:k('peerB','acctB'),payload:{text:'blocked'}})),/FORWARD_CROSS_ACCOUNT_HOLD/);
 await assert.rejects(h.a.fence.prepare(req('FORWARD','m-in',{
  targetK:k('peerC'),payload:{text:'not verified'},requestId:'peerC'})),/FORWARD_TARGET_NOT_AUTHORIZED/);
});
test('edit and revoke require own-originated provider history; local delete stays DB owner',async t=>{
 const h=fixture(t);
 await assert.rejects(h.a.fence.prepare(req('EDIT','m-in',{
   payload:{text:'edit'}})),/ONLY_OWN_SENT_MESSAGE_CAN_EDIT_OR_REVOKE/);
 const a=await h.a.fence.prepare(req('EDIT','m-out',{
  payload:{text:'corrected'}}));assert.equal(a.state,'HELD_FOR_PROVIDER_OWNER');
 const b=await h.a.fence.prepare(req('REVOKE','m-out',{
  payload:{},requestId:'revoke'}));assert.equal(b.canSend,false);
 await assert.rejects(h.a.fence.prepare(req('LOCAL_DELETE','m-out',
  {payload:{},requestId:'del'})),/LOCAL_DELETE_REQUIRES_CONVERSATION_DB_OWNER/);
});
test('missing signed Provider proof and media owner proof never create operation row',async t=>{
 const h=fixture(t);h.removeCapability();
 await assert.rejects(h.a.fence.prepare(req()),/NATIVE_PROVIDER_CAPABILITY_NOT_WIRED/);
 await assert.rejects(h.a.fence.prepare(req('MEDIA_ACTION','m-out',{
  payload:{assetId:'a1',mediaType:'IMAGE'}})),/W23_MEDIA_OWNER_SCOPE_HOLD/);
 assert.equal(h.a.db.prepare('SELECT COUNT(*) AS n FROM message_action_holds').get().n,0);
});
test('revoked W24, W44 Grant, expired Consent and stopped Agent reject',async t=>{
 for(const reason of ['w24','w44','expiry','agent']){
  const h=fixture(t);
  if(reason==='w24')h.disableW24();
  if(reason==='w44')h.disableW44();
  if(reason==='expiry')h.expire();
  if(reason==='agent')h.stopAgent();
  const action=req('REACTION','m-in',{mode:reason==='agent'?'AUTO':'HUMAN'});
  await assert.rejects(h.a.fence.prepare(action),/W24_CURRENT_ACTOR_ACCOUNT_PEER_EPOCH_DENIED|W44_GRANT_AGENT_OPERATION_SCOPE_DENIED/);
 }
});
test('cross account MID collision blocked; same MID in other legitimate account independently scoped',async t=>{
 const h=fixture(t);
 await assert.rejects(h.a.fence.prepare(req('REACTION','m-foreign')),
  /ORIGINAL_PROVIDER_MID_NOT_VERIFIED/);
 const other=await h.a.fence.prepare(req('REACTION','m-foreign',{
  k:k('peerA','acctB')}));
 assert.equal(other.state,'HELD_FOR_PROVIDER_OWNER');
});
test('per-actor concurrent mutation same logical operation is fenced',async t=>{
 const h=fixture(t);
 await h.a.fence.prepare(req());
 await assert.rejects(h.a.fence.prepare(req('REACTION','m-in',{
  actorId:'actorB',sessionId:'sessionB',requestId:'other-request'
 })),/NATIVE_ACTION_CONCURRENT_ACTOR_CONFLICT/);
});
test('enumerated action matrix is not a claim of Provider support',t=>{
 const m=fixture(t).a.fence.matrix();
 assert.equal(m.REACTION,'NOT_WIRED');
 assert.equal(m.QUOTE_REPLY,'COMPOSER_MID_ONLY');
 assert.equal(m.PROVIDER_DELETE,'NOT_WIRED');
 assert.equal(m.LOCAL_DELETE,'CONVERSATION_DB_OWNER');
 assert.equal(m.MEDIA_ACTION,'W23_AND_PROVIDER_HOLD');
});

test('status GET is W24/W44 and full-K scoped, not an untrusted ID read',async t=>{
 const h=fixture(t);
 const saved=await h.a.fence.prepare(req());
 assert.equal((await h.a.fence.getStatus({id:saved.id,k:k(),
   actorId:'actorA',sessionId:'sessionA'})).state,'HELD_FOR_PROVIDER_OWNER');
 await assert.rejects(h.a.fence.getStatus({id:saved.id,k:k('peerB'),
   actorId:'actorA',sessionId:'sessionA'}),/OPERATION_STATUS_CROSS_ACCOUNT_DENIED/);
 await assert.rejects(h.a.fence.getStatus({id:saved.id,k:k(),
   actorId:'attacker',sessionId:'another-session'}),/OPERATION_STATUS_ACTOR_DENIED/);
 h.disableW24();
 await assert.rejects(h.a.fence.getStatus({id:saved.id,k:k(),
   actorId:'actorA',sessionId:'sessionA'}),/W24_CURRENT_ACTOR_ACCOUNT_PEER_EPOCH_DENIED/);
});

test('Grant/Consent epoch mutation cannot reuse prior held logical operation or read it',async t=>{
 const h=fixture(t);
 const first=await h.a.fence.prepare(req());
 assert.equal(first.state,'HELD_FOR_PROVIDER_OWNER');
 h.changeEpoch();
 await assert.rejects(h.a.fence.prepare(req('REACTION','m-in',{
   requestId:'new-request'})),/OPERATION_AUTHORITY_VERSION_CONFLICT/);
 await assert.rejects(h.a.fence.getStatus({id:first.id,k:k(),
   actorId:'actorA',sessionId:'sessionA'}),/OPERATION_HOLD_AUTHORITY_STALE/);
 assert.equal(h.a.db.prepare('SELECT COUNT(*) AS n FROM message_action_holds').get().n,1);
});

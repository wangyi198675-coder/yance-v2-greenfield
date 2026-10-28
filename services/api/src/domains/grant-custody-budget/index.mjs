/**
 * W44 Issue #8: NONPRODUCTION SYNTHETIC grant/custody/budget store.
 * W24 is authoritative for identity/consent; W25 alone owns MessageDelivery.
 * NOT real authorization, an HTTP service, real model billing or a sender.
 */
import { DatabaseSync } from 'node:sqlite';
import {attachDurableAuthority} from './authority-db.mjs';
import {attachW44OfficialWhatsAppIdentity} from './native-whatsapp-identity.mjs';
const CHANNELS=new Set(['FB_PERSONAL','FB_PAGE','WHATSAPP_PERSONAL','TELEGRAM_PERSONAL']);
const pos=x=>Number.isSafeInteger(x)&&x>0;
const nonneg=x=>Number.isSafeInteger(x)&&x>=0;
const bounded=x=>nonneg(x)&&x<=1_000_000_000;
const safe=x=>typeof x==='string'&&x.length>0&&x.length<=180&&!/[\r\n\u0000-\u001f]/.test(x);
const deny=reason=>({ok:false,reason});

export function canonicalK(k) {
  if(!k||k.tenant!=='SYNTHETIC_TEST_ONLY'||!safe(k.account)||!k.account.startsWith('fixture-')||
    !CHANNELS.has(k.channel)||!safe(k.peer_id)||!k.peer_id.startsWith('fake-')||
    !pos(k.binding_revision))throw Error('ONLY_SYNTHETIC_FULL_K');
  return JSON.stringify([k.tenant,k.account,k.channel,k.peer_id,k.binding_revision]);
}
function scopeKey(k,scope) {
  if(scope==='GLOBAL')return JSON.stringify(['G',k.tenant,k.account,k.channel]);
  if(scope==='CONTACT')return JSON.stringify(['C',canonicalK(k)]);
  throw Error('INVALID_SCOPE');
}
function intentKey(k,id){
  if(!safe(id)||!id.startsWith('fake-'))throw Error('ONLY_SYNTHETIC_INTENT');
  return JSON.stringify([canonicalK(k),id]);
}

export function openEligibilityStore({path,verifyIdentity,authorizeMutation,verifySettlement,verifyDeliveryArm,verifyOwnerMutation,verifyOwnerCancellation,requireDurableIdentity=false,
  officialWhatsAppOwner=null,now=Date.now}={}) {
  if(typeof path!=='string'||!path||path.length>1024||
    (!requireDurableIdentity&&typeof verifyIdentity!=='function')||typeof authorizeMutation!=='function'||
    typeof now!=='function')throw Error('EXPLICIT_NONPROD_PATH_AND_W24_PORTS_REQUIRED');
  const db=new DatabaseSync(path,{timeout:5000});
  db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  db.exec([
    'CREATE TABLE IF NOT EXISTS grants (scope_key TEXT PRIMARY KEY, scope TEXT NOT NULL, enabled INTEGER NOT NULL, epoch INTEGER NOT NULL, expires_at INTEGER NOT NULL, budget_limit INTEGER NOT NULL, spent INTEGER NOT NULL, reserved INTEGER NOT NULL);',
    'CREATE TABLE IF NOT EXISTS custody (k TEXT PRIMARY KEY, mode TEXT NOT NULL, epoch INTEGER NOT NULL);',
    'CREATE TABLE IF NOT EXISTS reservations (intent_key TEXT PRIMARY KEY, k TEXT NOT NULL, scope_key TEXT NOT NULL, grant_epoch INTEGER NOT NULL, custody_epoch INTEGER NOT NULL, binding_revision INTEGER NOT NULL, identity_epoch INTEGER NOT NULL, consent_epoch INTEGER NOT NULL, units INTEGER NOT NULL, valid_until INTEGER NOT NULL, state TEXT NOT NULL);',
    'CREATE TABLE IF NOT EXISTS boundary_leases (k TEXT PRIMARY KEY, intent_key TEXT NOT NULL UNIQUE, armed_at INTEGER NOT NULL, w25_attempt_id TEXT NOT NULL);',
    'CREATE TABLE IF NOT EXISTS mutation_barriers (scope_key TEXT PRIMARY KEY, generation INTEGER NOT NULL, scope TEXT NOT NULL, pending INTEGER NOT NULL);'
  ].join(' '));
  const readGrant=db.prepare('SELECT * FROM grants WHERE scope_key=?');
  const readCustody=db.prepare('SELECT * FROM custody WHERE k=?');
  const readReservation=db.prepare('SELECT * FROM reservations WHERE intent_key=?');
  const readLease=db.prepare('SELECT * FROM boundary_leases WHERE k=?');
  const readBarrier=db.prepare('SELECT * FROM mutation_barriers WHERE scope_key=?');

  const globalBarrier=k=>readBarrier.get(scopeKey(k,'GLOBAL'))?.pending===1;
  const peerBarrier=k=>readBarrier.get(scopeKey(k,'CONTACT'))?.pending===1;
  const anyBarrier=k=>globalBarrier(k)||peerBarrier(k);
  const hasLease=(k,scope)=>scope==='CONTACT'
    ?Boolean(readLease.get(canonicalK(k)))
    :Boolean(db.prepare("SELECT 1 FROM boundary_leases WHERE json_extract(k,'$[0]')=? AND json_extract(k,'$[1]')=? AND json_extract(k,'$[2]')=? LIMIT 1")
      .get(k.tenant,k.account,k.channel));
  const time=()=>{const t=now();if(!pos(t))throw Error('INVALID_CLOCK');return t};
  function transaction(fn){
    db.exec('BEGIN IMMEDIATE');
    try {const v=fn();db.exec('COMMIT');return v}
    catch(e){db.exec('ROLLBACK');throw e}
  }
  function admin(actor,action,k){
    canonicalK(k);
    if(!safe(actor)||!actor.startsWith('fake-')||
      authorizeMutation({actor,action,identity:k})!==true)throw Error('W24_MUTATION_NOT_AUTHORIZED');
  }
  const durable=attachDurableAuthority({db,transaction,canonicalK,admin,
    hasLease,readBarrier,now,verifyOwnerMutation,verifyOwnerCancellation});
  // W44 original SAME SQLite DB; official SDK reads never affect fixture
  // grants/OUTBOX and never inherit fake test authorization.
  const nativeWhatsApp=officialWhatsAppOwner?
    attachW44OfficialWhatsAppIdentity({db,transaction,...officialWhatsAppOwner}):null;
  // Same W44 SQLite after the additive native-schema initialization.
  const readPause=db.prepare('SELECT paused,epoch FROM grant_pauses WHERE scope_key=?');
  function currentIdentity(k){
    canonicalK(k);
    const native=durable.readNativeCurrent(k);
    if(native!==undefined)return native;
    if(requireDurableIdentity)return null;
    const s=verifyIdentity(k); // MUST read authoritative W24 state at every fence
    return s?.valid===true&&s.binding_revision===k.binding_revision&&
      pos(s.identity_epoch)&&pos(s.consent_epoch)?s:null;
  }
  function effective(k){
    const global=readPause.get(scopeKey(k,'GLOBAL'));
    const contact=readPause.get(scopeKey(k,'CONTACT'));
    if(global?.paused===1)return {reason:'GLOBAL_PAUSED'};
    if(contact?.paused===1)return {reason:'CONTACT_PAUSED'};
    const g=readGrant.get(scopeKey(k,'GLOBAL'));
    const c=readGrant.get(scopeKey(k,'CONTACT'));
    if(g&&(!g.enabled||g.expires_at<=time()))
      return {reason:g.enabled?'GLOBAL_EXPIRED':'GLOBAL_REVOKED'};
    if(c&&(!c.enabled||c.expires_at<=time()))
      return {reason:c.enabled?'CONTACT_EXPIRED':'CONTACT_REVOKED'};
    const found=c||g;
    return found&&found.enabled?{grant:found}:{reason:'NO_EFFECTIVE_GRANT'};
  }
  function qualify(k,units=1){
    if(!pos(units)||!bounded(units))throw Error('INVALID_BUDGET_UNITS');
    const key=canonicalK(k),s=currentIdentity(k);
    if(anyBarrier(k))return deny('AUTHORITY_MUTATION_PENDING');
    if(!s)return deny('W24_IDENTITY_OR_CONSENT_INVALID');
    const custody=readCustody.get(key);
    if(custody&&custody.mode!=='AUTO')return deny(custody.mode==='ASSIST'?
      'ASSIST_MODE_NO_AUTO':'HUMAN_CUSTODY');
    const choice=effective(k);
    if(!choice.grant)return deny(choice.reason);
    const g=choice.grant;
    if(g.spent+g.reserved+units>g.budget_limit)return deny('BUDGET_EXHAUSTED');
    return {ok:true,k:key,scopeKey:g.scope_key,grantEpoch:g.epoch,
      custodyEpoch:custody?.epoch??0,identityEpoch:s.identity_epoch,
      consentEpoch:s.consent_epoch,expiresAt:g.expires_at,availableUnits:g.budget_limit-g.spent-g.reserved};
  }
  function grant({identity:k,scope,actor,enabled=true,expiresAt,budgetUnits,expectedEpoch=0}){
    canonicalK(k);
    if(typeof enabled!=='boolean'||!pos(expiresAt)||!bounded(budgetUnits)||!nonneg(expectedEpoch))
      throw Error('INVALID_GRANT_TERMS');
    admin(actor,'GRANT_'+scope,k);
    const key=scopeKey(k,scope);
    return transaction(()=>{
      const old=readGrant.get(key);
      if(anyBarrier(k))throw Error('AUTHORITY_MUTATION_PENDING');
      if(hasLease(k,scope))throw Error('BOUNDARY_LEASE_ACTIVE');
      if((old?.epoch??0)!==expectedEpoch)throw Error('STALE_GRANT_EPOCH');
      const epoch=expectedEpoch+1;
      // A version rollover must NOT erase previously spent or unresolved reserved units.
      // Otherwise renew/revoke/regrant turns an outstanding attempt into fresh budget.
      db.prepare('INSERT INTO grants(scope_key,scope,enabled,epoch,expires_at,budget_limit,spent,reserved) VALUES(?,?,?,?,?,?,0,0) ON CONFLICT(scope_key) DO UPDATE SET enabled=excluded.enabled,epoch=excluded.epoch,expires_at=excluded.expires_at,budget_limit=excluded.budget_limit')
        .run(key,scope,Number(enabled),epoch,expiresAt,budgetUnits);
      return {scopeKey:key,epoch,enabled};
    });
  }
  function revoke({identity:k,scope,actor,expectedEpoch}){
    canonicalK(k);admin(actor,'REVOKE_'+scope,k);
    const key=scopeKey(k,scope);
    return transaction(()=>{
      const old=readGrant.get(key);
      if(anyBarrier(k))throw Error('AUTHORITY_MUTATION_PENDING');
      if(hasLease(k,scope))throw Error('BOUNDARY_LEASE_ACTIVE');
      if(!old&&expectedEpoch===0){
        // Revoking one contact under a global grant must create a durable DENY
        // tombstone. Otherwise absence of a contact row silently falls back to GLOBAL.
        db.prepare('INSERT INTO grants(scope_key,scope,enabled,epoch,expires_at,budget_limit,spent,reserved) VALUES(?,?,0,1,8640000000000000,0,0,0)').run(key,scope);
        return {scopeKey:key,epoch:1,enabled:false};
      }
      if(!old||old.epoch!==expectedEpoch)throw Error('STALE_GRANT_EPOCH');
      // Preserve unresolved reservations across revoke; W25 receipt/no-send
      // reconciliation must explicitly release them, not the grant mutation.
      db.prepare('UPDATE grants SET enabled=0,epoch=epoch+1 WHERE scope_key=?').run(key);
      return {scopeKey:key,epoch:old.epoch+1,enabled:false};
    });
  }
  function setCustody({identity:k,mode,action,actor,expectedEpoch=0}){
    if(requireDurableIdentity)throw Error('NATIVE_TRANSACTIONAL_TAKEOVER_REQUIRED');
    const key=canonicalK(k);
    if(!nonneg(expectedEpoch)||
      !(mode==='HUMAN'&&action==='USER_EDIT'||mode==='AUTO'&&action==='EXPLICIT_RESUME'))
      throw Error('FOCUS_CANNOT_TAKEOVER');
    admin(actor,'CUSTODY_'+action,k);
    return transaction(()=>{
      const old=readCustody.get(key);
      if(anyBarrier(k))throw Error('AUTHORITY_MUTATION_PENDING');
      if(readLease.get(key))throw Error('BOUNDARY_LEASE_ACTIVE');
      if((old?.epoch??0)!==expectedEpoch)throw Error('STALE_CUSTODY_EPOCH');
      const epoch=expectedEpoch+1;
      db.prepare('INSERT INTO custody(k,mode,epoch) VALUES(?,?,?) ON CONFLICT(k) DO UPDATE SET mode=excluded.mode,epoch=excluded.epoch')
        .run(key,mode,epoch);
      return {k:key,mode,epoch};
    });
  }
  function reserve({identity:k,intentId,units=1,ttlMs=60000}){
    const key=intentKey(k,intentId);
    if(!pos(units)||!bounded(units)||!pos(ttlMs)||ttlMs>300000)throw Error('INVALID_RESERVATION_TERMS');
    return transaction(()=>{
      const old=readReservation.get(key);
      if(old)return old.units===units?
        {ok:false,reason:'IDEMPOTENT_'+old.state,intentKey:key,state:old.state}:
        deny('IDEMPOTENCY_CONFLICT');
      const s=qualify(k,units);
      if(!s.ok)return s;
      const expiry=Math.min(time()+ttlMs,readGrant.get(s.scopeKey).expires_at);
      if(expiry<=time())return deny('GRANT_EXPIRED');
      const changed=db.prepare('UPDATE grants SET reserved=reserved+? WHERE scope_key=? AND epoch=? AND enabled=1 AND budget_limit-spent-reserved>=?')
        .run(units,s.scopeKey,s.grantEpoch,units);
      if(changed.changes!==1)return deny('RACING_BUDGET_OR_EPOCH');
      db.prepare('INSERT INTO reservations(intent_key,k,scope_key,grant_epoch,custody_epoch,binding_revision,identity_epoch,consent_epoch,units,valid_until,state) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .run(key,s.k,s.scopeKey,s.grantEpoch,s.custodyEpoch,k.binding_revision,
          s.identityEpoch,s.consentEpoch,units,expiry,'RESERVED');
      return {ok:true,intentKey:key,state:'RESERVED',grantEpoch:s.grantEpoch,
        custodyEpoch:s.custodyEpoch,identityEpoch:s.identityEpoch,
        consentEpoch:s.consentEpoch,validUntil:expiry};
    });
  }
  function fenceWithinTransaction(k,r){
    if(anyBarrier(k))return deny('AUTHORITY_MUTATION_PENDING');
    if(time()>=r.valid_until)return deny('RESERVATION_EXPIRED');
    const s=currentIdentity(k);
    if(!s||s.identity_epoch!==r.identity_epoch||s.consent_epoch!==r.consent_epoch||
      s.binding_revision!==r.binding_revision)return deny('W24_EPOCH_STALE');
    const c=readCustody.get(r.k);
    if((c?.epoch??0)!==r.custody_epoch||c?.mode==='HUMAN')return deny('CUSTODY_CHANGED');
    const choice=effective(k);
    if(!choice.grant||choice.grant.scope_key!==r.scope_key||
      choice.grant.epoch!==r.grant_epoch)return deny('GRANT_CHANGED');
    return {ok:true};
  }
  function checkForSend({identity:k,intentId}){
    const key=intentKey(k,intentId);
    return transaction(()=>{
      const r=readReservation.get(key);
      if(!r||r.state!=='RESERVED')return deny('NO_ACTIVE_RESERVATION');
      const check=fenceWithinTransaction(k,r);
      return check.ok?{ok:true,intentKey:key,grantEpoch:r.grant_epoch,
        custodyEpoch:r.custody_epoch,identityEpoch:r.identity_epoch,
        consentEpoch:r.consent_epoch}:check;
    });
  }
  function enterBoundary({identity:k,intentId}) {
    // This is W44's durable budget boundary marker, NOT a second delivery
    // Outbox. W25 alone decides when to reach its irreversible fake sink.
    const key=intentKey(k,intentId);
    return transaction(()=>{
      const r=readReservation.get(key);
      if(!r||!['RESERVED','BOUNDARY_ENTERED'].includes(r.state))return deny('BOUNDARY_MISSING_OR_SETTLED');
      const fence=fenceWithinTransaction(k,r);
      if(!fence.ok)return fence;
      // W25 executes PRE_NETWORK twice (once before persisting the attempt,
      // once immediately before its single sink). Repeat read is NOT another
      // reservation or sender; fail if W24/W44 authority changed meanwhile.
      if(r.state==='RESERVED'){
        const updated=db.prepare("UPDATE reservations SET state='BOUNDARY_ENTERED' WHERE intent_key=? AND state='RESERVED'").run(key);
        if(updated.changes!==1)throw Error('BOUNDARY_RACE');
      }
      return {ok:true,idempotent:r.state==='BOUNDARY_ENTERED',intentKey:key,state:'BOUNDARY_ENTERED',
        grantEpoch:r.grant_epoch,custodyEpoch:r.custody_epoch,
        identityEpoch:r.identity_epoch,consentEpoch:r.consent_epoch};
    });
  }
  function settleBoundary({identity:k,intentId,evidence}) {
    // Only actual W25 persisted evidence can settle an ambiguous boundary.
    // A client-supplied status, raw ACK, or timeout has no authority here.
    if(typeof verifySettlement!=='function')return deny('W25_SETTLEMENT_AUTHORITY_UNAVAILABLE');
    const key=intentKey(k,intentId);
    return transaction(()=>{
      const r=readReservation.get(key);
      if(!r||r.state!=='BOUNDARY_ENTERED')return deny('NO_UNRESOLVED_BOUNDARY');
      const result=verifySettlement({identity:k,intentId,evidence});
      if(result&&typeof result.then==='function')throw Error('ASYNC_SETTLEMENT_PORT_UNSUPPORTED');
      if(result?.verified!==true||!['CHARGED','PROVEN_NO_SEND'].includes(result.outcome))
        return deny('W25_RECEIPT_UNVERIFIED');
      const actual=result.outcome==='CHARGED'?result.actualUnits:0;
      if(!nonneg(actual)||actual>r.units)return deny('INVALID_SETTLEMENT_UNITS');
      const g=readGrant.get(r.scope_key);
      if(!g||g.reserved<r.units)return deny('BUDGET_LEDGER_INCONSISTENT');
      const update=db.prepare('UPDATE grants SET reserved=reserved-?,spent=spent+? WHERE scope_key=? AND reserved>=?')
        .run(r.units,actual,r.scope_key,r.units);
      if(update.changes!==1)throw Error('BUDGET_SETTLEMENT_CAS_FAILED');
      const state=result.outcome==='CHARGED'?'COMMITTED':'RELEASED';
      db.prepare('UPDATE reservations SET state=? WHERE intent_key=?').run(state,key);
      // No lease may disappear on UNKNOWN, crash or unverified evidence.
      db.prepare('DELETE FROM boundary_leases WHERE intent_key=?').run(key);
      return {ok:true,state,unitsCharged:actual};
    });
  }
  function finish({identity:k,intentId,action,actualUnits}){
    if(!['RELEASE','COMMIT'].includes(action))throw Error('BAD_RESERVATION_ACTION');
    const key=intentKey(k,intentId);
    return transaction(()=>{
      const r=readReservation.get(key);
      if(!r||!['RESERVED','BOUNDARY_ENTERED'].includes(r.state))return deny('RESERVATION_NOT_ACTIVE');
      if(action==='RELEASE'&&r.state==='BOUNDARY_ENTERED')return deny('BOUNDARY_UNCERTAIN_HOLD');
      if(action==='COMMIT'&&r.state==='BOUNDARY_ENTERED')return deny('W25_SETTLEMENT_PROOF_REQUIRED');
      if(action==='COMMIT'&&(!nonneg(actualUnits)||actualUnits>r.units))
        return deny('INVALID_ACTUAL_UNITS');
      if(action==='COMMIT'){
        const f=fenceWithinTransaction(k,r);
        if(!f.ok)return f;
      }
      const g=readGrant.get(r.scope_key);
      if(!g||g.reserved<r.units)return deny('BUDGET_LEDGER_INCONSISTENT');
      // RELEASE is safe for proven noncharges even after a grant epoch changes.
      // COMMIT still requires an active, exact pre-send fence above.
      const update=db.prepare('UPDATE grants SET reserved=reserved-?,spent=spent+? WHERE scope_key=? AND reserved>=?')
        .run(r.units,action==='COMMIT'?actualUnits:0,r.scope_key,r.units);
      if(update.changes!==1)throw Error('BUDGET_LEDGER_CAS_FAILED');
      const state=action==='COMMIT'?'COMMITTED':'RELEASED';
      db.prepare('UPDATE reservations SET state=? WHERE intent_key=?').run(state,key);
      return {ok:true,state};
    });
  }
  // Atomic with W44 budget rows, but not yet bound to W24's mutation
  // entrypoints or W25's irreversible sink. W25 remains sole sender.
  function armSend({identity:k,intentId,w25IntentId}){
    const key=intentKey(k,intentId),peer=canonicalK(k);
    if(!safe(w25IntentId))return deny('W25_ATTEMPT_ID_REQUIRED');
    return transaction(()=>{
      if(anyBarrier(k))return deny('AUTHORITY_MUTATION_PENDING');
      const existing=readLease.get(peer);
      if(existing) return existing.intent_key===key&&existing.w25_attempt_id===w25IntentId
        ?{ok:true,armed:true,idempotent:true,intentKey:key}:deny('RECIPIENT_SEND_GATE_BUSY');
      const r=readReservation.get(key);
      if(!r||r.state!=='BOUNDARY_ENTERED')return deny('BOUNDARY_NOT_DURABLY_ARMED');
      const f=fenceWithinTransaction(k,r);
      if(!f.ok)return f;
      if(typeof verifyDeliveryArm!=='function')return deny('W25_PERSISTED_ATTEMPT_PROOF_MISSING');
      const proof=verifyDeliveryArm({identity:k,intentId,w25IntentId});
      if(proof&&typeof proof.then==='function')throw Error('ASYNC_W25_ARM_PORT_UNSUPPORTED');
      if(proof?.verified!==true)return deny('W25_PERSISTED_ATTEMPT_UNVERIFIED');
      db.prepare('INSERT INTO boundary_leases(k,intent_key,armed_at,w25_attempt_id) VALUES(?,?,?,?)')
        .run(peer,key,time(),w25IntentId);
      return {ok:true,armed:true,intentKey:key};
    });
  }
  function requestMutationFence({identity:k,scope,actor,expectedGeneration=0}){
    if(requireDurableIdentity)throw Error('NATIVE_TRANSACTIONAL_MUTATION_REQUIRED');
    canonicalK(k);
    if(!nonneg(expectedGeneration))throw Error('INVALID_MUTATION_GENERATION');
    admin(actor,'REQUEST_'+scope+'_MUTATION',k);
    const key=scopeKey(k,scope);
    return transaction(()=>{
      const current=readBarrier.get(key);
      if(current?.pending===1)return deny('MUTATION_ALREADY_PENDING');
      if((current?.generation??0)!==expectedGeneration)return deny('STALE_MUTATION_GENERATION');
      const generation=expectedGeneration+1;
      db.prepare('INSERT INTO mutation_barriers(scope_key,generation,scope,pending) VALUES(?,?,?,1) ON CONFLICT(scope_key) DO UPDATE SET generation=excluded.generation,scope=excluded.scope,pending=1')
        .run(key,generation,scope);
      return {ok:true,generation,pending:true,activeLease:hasLease(k,scope)};
    });
  }
  function finalizeMutationFence({identity:k,scope,actor,generation,kind,applyW24}){
    if(requireDurableIdentity)throw Error('IN_MEMORY_W24_CALLBACK_FORBIDDEN');
    canonicalK(k);
    if(!pos(generation)||!['REVOKE_GRANT','REVOKE_ACCOUNT','REVOKE_CONSENT','HUMAN_TAKEOVER'].includes(kind)
        ||typeof applyW24!=='function')throw Error('EXPLICIT_W24_MUTATION_REQUIRED');
    if(kind==='HUMAN_TAKEOVER'&&scope!=='CONTACT')throw Error('INVALID_TAKEOVER_SCOPE');
    admin(actor,'FINALIZE_'+kind,k);
    return transaction(()=>{
      const row=readBarrier.get(scopeKey(k,scope));
      if(!row||row.pending!==1||row.generation!==generation)return deny('MUTATION_BARRIER_STALE');
      if(hasLease(k,scope))return deny('ACTIVE_SEND_MUST_SETTLE_FIRST');
      // W24 owns the authoritative mutation. Only trusted synchronous
      // in-process W24 mutation may run here; never accept a prior snapshot.
      const result=applyW24({identity:k,kind,scope});
      if(result&&typeof result.then==='function')throw Error('ASYNC_W24_MUTATION_NOT_ATOMIC');
      if(result?.committed!==true)throw Error('W24_MUTATION_NOT_COMMITTED');
      if(['REVOKE_GRANT','REVOKE_ACCOUNT'].includes(kind)){
        const g=readGrant.get(scopeKey(k,scope));
        if(g)db.prepare('UPDATE grants SET enabled=0,epoch=epoch+1 WHERE scope_key=?')
          .run(scopeKey(k,scope));
        else db.prepare('INSERT INTO grants(scope_key,scope,enabled,epoch,expires_at,budget_limit,spent,reserved) VALUES(?,?,0,1,8640000000000000,0,0,0)')
          .run(scopeKey(k,scope),scope);
      }
      if(kind==='HUMAN_TAKEOVER'){
        const peer=canonicalK(k),old=readCustody.get(peer);
        const epoch=(old?.epoch??0)+1;
        db.prepare('INSERT INTO custody(k,mode,epoch) VALUES(?,?,?) ON CONFLICT(k) DO UPDATE SET mode=excluded.mode,epoch=excluded.epoch')
          .run(peer,'HUMAN',epoch);
      }
      db.prepare('UPDATE mutation_barriers SET pending=0 WHERE scope_key=?')
        .run(scopeKey(k,scope));
      return {ok:true,committed:true,generation,w24AuthorityConfirmed:true};
    });
  }
  function leaseStatus(k){
    const peer=canonicalK(k),active=readLease.get(peer);
    return {ok:true,active:!!active,mutationPending:anyBarrier(k),
      intentKey:active?.intent_key??null};
  }
  // W09 management interface: authoritative readback, never synthetic=real.
  // Browser caller must NOT use a local toggle or its own principal as proof.
  function readGrantState({identity:k,actor,scope}={}){
    const key=scopeKey(k,scope);
    admin(actor,'READ_GRANT_'+scope,k);
    const native=durable.readIdentityAuthority({identity:k,actor});
    const grantRow=readGrant.get(key);
    const global=readPause.get(scopeKey(k,'GLOBAL'));
    const contact=readPause.get(scopeKey(k,'CONTACT'));
    const pause=readPause.get(key);
    const fence=durable.readMutationFence({identity:k,scope,actor});
    const globalFence=scope==='GLOBAL'?fence:
      durable.readMutationFence({identity:k,scope:'GLOBAL',actor});
    const current=effective(k);
    const mode=readCustody.get(canonicalK(k))?.mode??'AUTO';
    const reason=(!native.account)?'ACCOUNT_NOT_CONFIGURED':
      (!native.valid)?'ACCOUNT_OR_PEER_UNBOUND':
      anyBarrier(k)?'AUTHORITY_MUTATION_PENDING':
      mode==='HUMAN'?'HUMAN_CUSTODY':
      mode==='ASSIST'?'ASSIST_MODE_NO_AUTO':
      current.reason??(
        current.grant&&current.grant.spent+current.grant.reserved>=current.grant.budget_limit
          ?'BUDGET_EXHAUSTED':null);
    const limits=grantRow?{budgetLimit:grantRow.budget_limit,
      spent:grantRow.spent,reserved:grantRow.reserved,
      available:Math.max(0,grantRow.budget_limit-grantRow.spent-grantRow.reserved)}:null;
    return {ok:true,status:reason?'DENIED':'ELIGIBLE_SYNTHETIC',
      reason,scope,fullK:canonicalK(k),
      // Never confuse a test fixture or a recorded grant with user consent.
      realUserAuthorized:false,realAccountVerified:false,
      authorityClass:'SYNTHETIC_FIXTURE_ONLY',
      identityValid:native.valid,custodyMode:mode,
      grant:grantRow?{enabled:!!grantRow.enabled,epoch:grantRow.epoch,
        expiresAt:grantRow.expires_at,...limits}:null,
      paused:pause?.paused===1,pauseEpoch:pause?.epoch??0,
      globalPaused:global?.paused===1,contactPaused:contact?.paused===1,
      effectiveScope:current.grant?.scope??null,
      scopeConfigured:!!grantRow,
      effectiveBudget:current.grant?{budgetLimit:current.grant.budget_limit,
        spent:current.grant.spent,reserved:current.grant.reserved,
        available:Math.max(0,current.grant.budget_limit-current.grant.spent-current.grant.reserved)}:null,
      budget:limits,barrier:{generation:fence.generation,pending:fence.pending,
        globalPending:globalFence.pending,activeLease:fence.activeLease,
        requestId:fence.requestId,status:fence.status,
        blockingRequestId:globalFence.pending?globalFence.requestId:
          fence.pending?fence.requestId:null},
      identityEpochs:{bindingRevision:native.bindingRevision,
        accountEpoch:native.accountEpoch,consentEpoch:native.consentEpoch,
        custodyEpoch:native.custodyEpoch}};
  }
  function grantAction({identity:k,actor,scope,action,idempotencyKey,
    expectedGeneration,expectedBindingRevision,expectedAccountEpoch,
    expectedConsentEpoch,expectedCustodyEpoch,payload}={}){
    if(!requireDurableIdentity)return {ok:false,status:'DENIED',reason:'NATIVE_IDENTITY_REQUIRED'};
    const kinds={ISSUE:'ISSUE_GRANT',PAUSE:'PAUSE_GRANT',
      RESUME:'RESUME_GRANT',REVOKE:'REVOKE_GRANT'};
    if(!kinds[action])return {ok:false,status:'DENIED',reason:'UNKNOWN_GRANT_ACTION'};
    if(!payload||payload.grantScope!==scope)
      return {ok:false,status:'CONFLICT',reason:'GRANT_SCOPE_MISMATCH'};
    const native=durable.readIdentityAuthority({identity:k,actor});
    if(!native.valid)return {ok:false,status:'DENIED',reason:'ACCOUNT_OR_PEER_UNBOUND'};
    // The user authorization proof is a typed W24-owned immutable reference,
    // independently validated again inside native finalizeMutationFence.
    if(typeof payload.approvalRef!=='string'||!payload.approvalRef)
      return {ok:false,status:'DENIED',reason:'USER_APPROVAL_PROOF_REQUIRED'};
    const req=durable.requestMutationFence({identity:k,actor,scope,
      kind:kinds[action],idempotencyKey,payload,expectedGeneration,
      expectedBindingRevision,expectedAccountEpoch,expectedConsentEpoch,
      expectedCustodyEpoch});
    if(!req.ok)return {...req,action};
    if(req.status==='COMMITTED')return {ok:true,status:'COMMITTED',
      requestId:req.requestId,generation:req.generation,replayed:true,
      readback:readGrantState({identity:k,actor,scope})};
    const finished=durable.finalizeMutationFence({requestId:req.requestId,
      generation:req.generation,actor,ownerValidatedMutation:payload});
    if(finished.status==='PENDING')return {ok:true,status:'PENDING',
      requestId:req.requestId,generation:req.generation,
      reason:finished.reason??'ARMED_SEND_PENDING',
      readback:readGrantState({identity:k,actor,scope})};
    if(finished.status!=='COMMITTED')return {...finished,action,
      requestId:req.requestId,generation:req.generation};
    const stored=durable.mutationResult({requestId:req.requestId,actor});
    if(stored.status!=='COMMITTED')throw Error('W44_GRANT_POSTCOMMIT_READBACK_FAILED');
    return {ok:true,status:'COMMITTED',requestId:req.requestId,
      generation:req.generation,readback:readGrantState({identity:k,actor,scope})};
  }
  // W47 signed owner DTO: same W24 actor, full K, and existing custody/grant ledger.
  // The in-repo synthetic store NEVER authorizes real platform sending.
  function readModeState({identity:k,actor}={}){
    const state=readGrantState({identity:k,actor,scope:'CONTACT'});
    const custodyMode=state.custodyMode;
    const selectedMode=custodyMode==='HUMAN'?'MANUAL':
      custodyMode==='ASSIST'?'ASSIST':'AUTO';
    const checked=qualify(k);
    const nativeAutoEligible=selectedMode==='AUTO'&&checked.ok===true;
    return Object.freeze({ok:true,selectedMode,
      // An unset legacy custody row is AUTO but never creates a grant.
      effectiveMode:nativeAutoEligible?'AUTO':selectedMode==='ASSIST'?'ASSIST':'MANUAL',
      nativeAutoEligible,realAutoAuthorized:false,
      authorityClass:state.authorityClass,realAccountVerified:false,
      realUserAuthorized:false,status:nativeAutoEligible?'SYNTHETIC_ONLY':
        state.barrier.pending||state.barrier.globalPending?'PENDING':'NOT_AUTO_ELIGIBLE',
      reason:checked.ok?null:checked.reason,
      identityKey:state.fullK,bindingRevision:state.identityEpochs.bindingRevision,
      identityEpochs:state.identityEpochs,budget:state.effectiveBudget,
      effectiveScope:state.effectiveScope,grant:state.grant,
      barriers:state.barrier,globalPaused:state.globalPaused,
      contactPaused:state.contactPaused,
      canSend:false});
  }
  function switchMode({identity:k,actor,targetMode,idempotencyKey,
    expectedGeneration,expectedBindingRevision,expectedAccountEpoch,
    expectedConsentEpoch,expectedCustodyEpoch,payload}={}){
    if(!requireDurableIdentity)return {ok:false,status:'DENIED',reason:'NATIVE_IDENTITY_REQUIRED'};
    if(!['MANUAL','ASSIST','AUTO'].includes(targetMode))
      return {ok:false,status:'DENIED',reason:'INVALID_TARGET_MODE'};
    if(!payload||payload.targetMode!==targetMode||
       typeof payload.approvalRef!=='string'||!payload.approvalRef)
      return {ok:false,status:'DENIED',reason:'EXPLICIT_MODE_APPROVAL_REQUIRED'};
    const current=durable.readIdentityAuthority({identity:k,actor});
    if(!current.valid)return {ok:false,status:'DENIED',reason:'ACCOUNT_OR_PEER_REVOKED'};
    const scope='CONTACT',kind='MODE_'+targetMode;
    const req=durable.requestMutationFence({identity:k,scope,actor,kind,
      idempotencyKey,payload,expectedGeneration,expectedBindingRevision,
      expectedAccountEpoch,expectedConsentEpoch,expectedCustodyEpoch});
    if(!req.ok)return {...req,targetMode};
    if(req.status==='COMMITTED')return {ok:true,status:'COMMITTED',replayed:true,
      requestId:req.requestId,generation:req.generation,
      readback:readModeState({identity:k,actor})};
    const finished=durable.finalizeMutationFence({requestId:req.requestId,
      generation:req.generation,actor,ownerValidatedMutation:payload});
    if(finished.status==='PENDING')return {ok:true,status:'PENDING',
      reason:finished.reason??'ACTIVE_SEND_MUST_SETTLE_FIRST',
      requestId:req.requestId,generation:req.generation,
      readback:readModeState({identity:k,actor})};
    if(finished.status!=='COMMITTED')return {...finished,targetMode,
      requestId:req.requestId,generation:req.generation};
    const settled=durable.mutationResult({requestId:req.requestId,actor});
    if(settled.status!=='COMMITTED')throw Error('W44_MODE_POSTCOMMIT_READBACK_FAILED');
    const readback=readModeState({identity:k,actor});
    if(readback.selectedMode!==targetMode)throw Error('W44_MODE_READBACK_MISMATCH');
    return {ok:true,status:'COMMITTED',requestId:req.requestId,
      generation:req.generation,readback};
  }
  function inspection(k){
    const key=canonicalK(k);
    if(!currentIdentity(k))return deny('W24_IDENTITY_OR_CONSENT_INVALID');
    const c=readCustody.get(key),s=effective(k);
    return {ok:true,mode:c?.mode??'AUTO',custodyEpoch:c?.epoch??0,
      effectiveGrant:s.grant?{scope:s.grant.scope,epoch:s.grant.epoch,
        expiresAt:s.grant.expires_at,budgetLimit:s.grant.budget_limit,spent:s.grant.spent,
        reserved:s.grant.reserved}:null,reason:s.reason??null};
  }
  return Object.freeze({grant,revoke,setCustody,qualify,reserve,checkForSend,
    enterBoundary,armSend,leaseStatus,
    requestMutationFence:requireDurableIdentity?durable.requestMutationFence:requestMutationFence,
    finalizeMutationFence:requireDurableIdentity?durable.finalizeMutationFence:finalizeMutationFence,
    settleBoundary,finish,inspection,readGrantState,grantAction,
    readModeState,switchMode,
    readIdentityAuthority:durable.readIdentityAuthority,
    readMutationFence:durable.readMutationFence,
    requestNativeMutationFence:durable.requestMutationFence,
    finalizeNativeMutationFence:durable.finalizeMutationFence,
    cancelMutationFence:durable.cancelMutationFence,
    mutationResult:durable.mutationResult,
    nativeWhatsApp,
    close:()=>db.close()});
}

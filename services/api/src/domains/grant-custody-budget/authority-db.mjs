/**
 * W44 P0 native, SYNTHETIC-ONLY durable W24 identity/consent repository.
 * Runs on the SAME DatabaseSync and BEGIN IMMEDIATE as grants, custody,
 * budget, reservations, send leases and mutation barriers. No other DB.
 * W24 owns typed mutation validation; this module owns atomic persistence.
 */
const positive=x=>Number.isSafeInteger(x)&&x>0;
const nonnegative=x=>Number.isSafeInteger(x)&&x>=0;
const str=x=>typeof x==='string'&&x.length>0&&x.length<=180&&
  !/[\r\n\u0000-\u001f]/.test(x);
const refuse=(reason,other={})=>({ok:false,status:'CONFLICT',reason,...other});
const frozen=x=>Object.freeze(x);
const KINDS=new Set(['REGISTER_ACCOUNT','BIND_PEER','CREATE_CONSENT',
 'REVOKE_CONSENT','REVOKE_ACCOUNT','RELINK_ACCOUNT','HUMAN_TAKEOVER','REVOKE_GRANT']);
const GLOBAL=new Set(['REGISTER_ACCOUNT','REVOKE_ACCOUNT','RELINK_ACCOUNT']);
const CONTACT=new Set(['BIND_PEER','CREATE_CONSENT','REVOKE_CONSENT','HUMAN_TAKEOVER']);
const aj=k=>JSON.stringify([k.tenant,k.account,k.channel]);
const pj=k=>JSON.stringify([k.tenant,k.account,k.channel,k.peer_id]);
const sj=(k,scope,canonicalK)=>scope==='GLOBAL'?JSON.stringify(['G',...JSON.parse(aj(k))]):
 scope==='CONTACT'?JSON.stringify(['C',canonicalK(k)]):(()=>{throw Error('INVALID_SCOPE')})();
const json=x=>JSON.stringify(x);

export function attachDurableAuthority({db,transaction,canonicalK,admin,hasLease,readBarrier,now,
  verifyOwnerMutation,verifyOwnerCancellation}={}){
 if(!db||!transaction||!canonicalK||!admin||!hasLease||!readBarrier||!now)
   throw Error('W44_SHARED_SQLITE_PORTS_REQUIRED');
 db.exec([
  "CREATE TABLE IF NOT EXISTS identity_accounts(tenant TEXT NOT NULL, account TEXT NOT NULL, channel TEXT NOT NULL, owner TEXT NOT NULL, binding_revision INTEGER NOT NULL, revocation_epoch INTEGER NOT NULL, active INTEGER NOT NULL, binding_proof_ref TEXT NOT NULL, PRIMARY KEY(tenant,account,channel));",
  "CREATE TABLE IF NOT EXISTS identity_peers(tenant TEXT NOT NULL, account TEXT NOT NULL, channel TEXT NOT NULL, peer_id TEXT NOT NULL, binding_revision INTEGER NOT NULL, bound INTEGER NOT NULL, proof_ref TEXT NOT NULL, revocation_epoch INTEGER NOT NULL, PRIMARY KEY(tenant,account,channel,peer_id));",
  "CREATE TABLE IF NOT EXISTS identity_consent_epochs(tenant TEXT NOT NULL, account TEXT NOT NULL, channel TEXT NOT NULL, peer_id TEXT NOT NULL, epoch INTEGER NOT NULL, PRIMARY KEY(tenant,account,channel,peer_id));",
  "CREATE TABLE IF NOT EXISTS identity_consents(consent_id TEXT PRIMARY KEY, tenant TEXT NOT NULL, account TEXT NOT NULL, channel TEXT NOT NULL, peer_id TEXT NOT NULL, binding_revision INTEGER NOT NULL, owner TEXT NOT NULL, subject_id TEXT NOT NULL, purpose TEXT NOT NULL, operation TEXT NOT NULL, proof_ref TEXT NOT NULL, expires_at INTEGER NOT NULL, status TEXT NOT NULL, consent_revision INTEGER NOT NULL, revocation_epoch INTEGER NOT NULL);",
  "CREATE TABLE IF NOT EXISTS authority_mutation_requests(request_id TEXT PRIMARY KEY, idempotency_key TEXT UNIQUE NOT NULL, scope_key TEXT NOT NULL, full_k TEXT NOT NULL, kind TEXT NOT NULL, actor TEXT NOT NULL, generation INTEGER NOT NULL, expected_json TEXT NOT NULL, payload_json TEXT NOT NULL, state TEXT NOT NULL, result_json TEXT, created_at INTEGER NOT NULL, committed_at INTEGER, UNIQUE(scope_key,generation));",
  "CREATE TABLE IF NOT EXISTS authority_privacy_audit(event_id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, kind TEXT NOT NULL, full_k TEXT NOT NULL, actor TEXT NOT NULL, epoch_json TEXT NOT NULL, at INTEGER NOT NULL);"
 ].join('\n'));
 const account=k=>db.prepare('SELECT * FROM identity_accounts WHERE tenant=? AND account=? AND channel=?')
   .get(k.tenant,k.account,k.channel);
 const peer=k=>db.prepare('SELECT * FROM identity_peers WHERE tenant=? AND account=? AND channel=? AND peer_id=?')
   .get(k.tenant,k.account,k.channel,k.peer_id);
 const epoch=k=>db.prepare('SELECT epoch FROM identity_consent_epochs WHERE tenant=? AND account=? AND channel=? AND peer_id=?')
   .get(k.tenant,k.account,k.channel,k.peer_id)?.epoch??0;
 const custody=k=>db.prepare('SELECT * FROM custody WHERE k=?').get(canonicalK(k));
 const readReq=id=>db.prepare('SELECT * FROM authority_mutation_requests WHERE request_id=?').get(id);
 const status=row=>frozen({ok:true,requestId:row.request_id,generation:row.generation,
    state:row.state,status:row.state==='APPLIED'?'COMMITTED':row.state,
    result:row.result_json?JSON.parse(row.result_json):null});
 const snapshot=k=>{
   canonicalK(k);
   const a=account(k),p=peer(k),c=custody(k);
   return {bindingRevision:a?.binding_revision??0,accountEpoch:a?.revocation_epoch??0,
     consentEpoch:epoch(k),custodyEpoch:c?.epoch??0,
     account:a?{active:!!a.active,owner:a.owner,bindingProofRef:a.binding_proof_ref}:null,
     peer:p?{bound:!!p.bound,bindingRevision:p.binding_revision,revocationEpoch:p.revocation_epoch,proofRef:p.proof_ref}:null,
     mode:c?.mode??'AUTO'};
 };
 const checkActor=(actor,k,kind)=>{
   if(!str(actor)||!actor.startsWith('fake-'))throw Error('TRUSTED_ACTOR_REQUIRED');
   admin(actor,'NATIVE_'+kind,k);
   const a=account(k);
   if(a&&a.owner!==actor)throw Error('W24_OWNER_MISMATCH');
 };
 function readIdentityAuthority({actor,identity:k}={}){
   canonicalK(k);
   return transaction(()=>{
   checkActor(actor,k,'READ_IDENTITY');
   const s=snapshot(k),a=account(k),p=peer(k);
   const consents=db.prepare('SELECT consent_id,subject_id,purpose,operation,proof_ref,expires_at,status,consent_revision,revocation_epoch FROM identity_consents WHERE tenant=? AND account=? AND channel=? AND peer_id=? ORDER BY consent_id')
     .all(k.tenant,k.account,k.channel,k.peer_id);
   return frozen({...s,identity:k,valid:!!(a?.active&&p?.bound&&
      a.binding_revision===k.binding_revision&&p.binding_revision===k.binding_revision),
     identityEpoch:(a?.revocation_epoch??0)+1,consents});
   });
 }
 // Undefined indicates an unmigrated legacy fixture; null means authoritative
 // account exists but this K is invalid. The production caller MUST require
 // durable identity, rather than silently trusting a second in-memory source.
 function readNativeCurrent(k){
   canonicalK(k);
   const a=account(k);
   if(!a)return undefined;
   const p=peer(k);
   if(!a.active||!p?.bound||a.binding_revision!==k.binding_revision||
      p.binding_revision!==k.binding_revision)return null;
   return {valid:true,binding_revision:a.binding_revision,
     identity_epoch:a.revocation_epoch+1,consent_epoch:epoch(k)};
 }
 function readMutationFence({identity:k,scope,actor}={}){
   canonicalK(k);
   return transaction(()=>{
   checkActor(actor,k,'READ_FENCE');
   const key=sj(k,scope,canonicalK),r=readBarrier.get(key);
   const recent=db.prepare('SELECT * FROM authority_mutation_requests WHERE scope_key=? ORDER BY generation DESC LIMIT 1')
     .get(key);
   return frozen({ok:true,generation:r?.generation??0,pending:r?.pending===1,
     activeLease:hasLease(k,scope),requestId:recent?.request_id??null,
     kind:recent?.kind??null,
     status:recent?.state==='APPLIED'?'COMMITTED':recent?.state??'NONE'});
   });
 }
 function requestMutationFence({identity:k,scope,actor,kind,expectedGeneration,
   expectedBindingRevision,expectedAccountEpoch,expectedConsentEpoch,expectedCustodyEpoch,
   idempotencyKey,payload={}}={}){
   canonicalK(k);
   if(!KINDS.has(kind)||!['GLOBAL','CONTACT'].includes(scope)||
       (GLOBAL.has(kind)&&scope!=='GLOBAL')||(CONTACT.has(kind)&&scope!=='CONTACT'))
       throw Error('MUTATION_KIND_SCOPE_MISMATCH');
   if(!str(idempotencyKey)||!idempotencyKey.startsWith('fake-')||
      ![expectedGeneration,expectedBindingRevision,expectedAccountEpoch,
        expectedConsentEpoch,expectedCustodyEpoch].every(nonnegative))
     throw Error('EXPLICIT_MUTATION_CAS_AND_ID_REQUIRED');
   if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('INVALID_TYPED_PAYLOAD');
   checkActor(actor,k,kind);
   const full=canonicalK(k),scopeId=sj(k,scope,canonicalK);
   const exp={expectedBindingRevision,expectedAccountEpoch,expectedConsentEpoch,
     expectedCustodyEpoch};
   return transaction(()=>{
     const prior=db.prepare('SELECT * FROM authority_mutation_requests WHERE idempotency_key=?')
       .get(idempotencyKey);
     if(prior)return prior.full_k===full&&prior.kind===kind&&prior.actor===actor&&
       prior.expected_json===json(exp)&&prior.payload_json===json(payload)
       ?{...status(prior),replayed:true}:refuse('IDEMPOTENCY_CONFLICT');
     const b=readBarrier.get(scopeId);
     if(b?.pending===1)return refuse('MUTATION_ALREADY_PENDING');
     if((b?.generation??0)!==expectedGeneration)
       return refuse('STALE_MUTATION_GENERATION',{generation:b?.generation??0});
     const current=snapshot(k);
     if(current.bindingRevision!==expectedBindingRevision||
        current.accountEpoch!==expectedAccountEpoch||
        current.consentEpoch!==expectedConsentEpoch||
        current.custodyEpoch!==expectedCustodyEpoch)return refuse('STALE_IDENTITY_EPOCH',{
          current:{bindingRevision:current.bindingRevision,accountEpoch:current.accountEpoch,
            consentEpoch:current.consentEpoch,custodyEpoch:current.custodyEpoch}});
     if(kind!=='REGISTER_ACCOUNT'&&
       (current.bindingRevision!==k.binding_revision||!current.account))
       return refuse('ACCOUNT_OR_BINDING_NOT_CURRENT');
     if(kind==='REGISTER_ACCOUNT'&&current.account)return refuse('ACCOUNT_ALREADY_EXISTS');
     const generation=expectedGeneration+1,requestId=idempotencyKey,at=now();
     db.prepare('INSERT INTO authority_mutation_requests(request_id,idempotency_key,scope_key,full_k,kind,actor,generation,expected_json,payload_json,state,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
       .run(requestId,idempotencyKey,scopeId,full,kind,actor,generation,json(exp),json(payload),'PENDING',at);
     db.prepare('INSERT INTO mutation_barriers(scope_key,generation,scope,pending) VALUES(?,?,?,1) ON CONFLICT(scope_key) DO UPDATE SET generation=excluded.generation,scope=excluded.scope,pending=1')
       .run(scopeId,generation,scope);
     return {ok:true,status:'PENDING',state:'PENDING',requestId,generation,
       activeLease:hasLease(k,scope)};
   });
 }
 const bumpEpoch=k=>db.prepare('INSERT INTO identity_consent_epochs(tenant,account,channel,peer_id,epoch) VALUES(?,?,?,?,1) ON CONFLICT(tenant,account,channel,peer_id) DO UPDATE SET epoch=epoch+1')
   .run(k.tenant,k.account,k.channel,k.peer_id);
 const invalidatePeers=k=>{
   const all=db.prepare('SELECT peer_id FROM identity_peers WHERE tenant=? AND account=? AND channel=?').all(k.tenant,k.account,k.channel);
   for(const row of all)bumpEpoch({...k,peer_id:row.peer_id});
   db.prepare('UPDATE identity_peers SET bound=0,revocation_epoch=revocation_epoch+1 WHERE tenant=? AND account=? AND channel=?')
     .run(k.tenant,k.account,k.channel);
   db.prepare("UPDATE identity_consents SET status='REVOKED',consent_revision=consent_revision+1,revocation_epoch=revocation_epoch+1 WHERE tenant=? AND account=? AND channel=? AND status!='REVOKED'")
     .run(k.tenant,k.account,k.channel);
 };
 function execute(row,k,p,actor){
   const a=account(k),pr=peer(k),kind=row.kind;
   if(kind==='REGISTER_ACCOUNT'){
     if(a)return refuse('ACCOUNT_ALREADY_EXISTS');
     if(!str(p.bindingProofRef)||!p.bindingProofRef.startsWith('fake-')||
       k.binding_revision!==1)return refuse('W24_VERIFIED_BINDING_REQUIRED');
     db.prepare('INSERT INTO identity_accounts VALUES(?,?,?,?,?,?,?,?)')
       .run(k.tenant,k.account,k.channel,actor,1,0,1,p.bindingProofRef);
   } else if(kind==='BIND_PEER'){
     if(!a?.active||!str(p.peerProofRef)||!p.peerProofRef.startsWith('fake-'))
       return refuse('W24_PEER_PROOF_REQUIRED');
     db.prepare('INSERT INTO identity_peers(tenant,account,channel,peer_id,binding_revision,bound,proof_ref,revocation_epoch) VALUES(?,?,?,?,?,1,?,0) ON CONFLICT(tenant,account,channel,peer_id) DO UPDATE SET binding_revision=excluded.binding_revision,bound=1,proof_ref=excluded.proof_ref,revocation_epoch=identity_peers.revocation_epoch+1')
       .run(k.tenant,k.account,k.channel,k.peer_id,k.binding_revision,p.peerProofRef);
     bumpEpoch(k);
   } else if(kind==='CREATE_CONSENT'){
     if(!a?.active||!pr?.bound||!['SEND_MESSAGE','TRANSLATE','ANALYZE'].includes(p.operation)||
        ![p.consentId,p.subjectId,p.purpose,p.proofRef].every(str)||
        !p.consentId.startsWith('fake-')||!p.proofRef.startsWith('fake-')||
        !positive(p.expiresAt)||p.expiresAt<=now()||p.approved!==true)
       return refuse('W24_VERIFIED_CONSENT_REQUIRED');
     if(db.prepare('SELECT consent_id FROM identity_consents WHERE consent_id=?').get(p.consentId))
       return refuse('CONSENT_EXISTS');
     db.prepare("INSERT INTO identity_consents VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'ACTIVE',1,0)")
       .run(p.consentId,k.tenant,k.account,k.channel,k.peer_id,k.binding_revision,
         actor,p.subjectId,p.purpose,p.operation,p.proofRef,p.expiresAt);
     bumpEpoch(k);
   } else if(kind==='REVOKE_CONSENT'){
     const c=db.prepare('SELECT * FROM identity_consents WHERE consent_id=?').get(p.consentId);
     if(!c||c.tenant!==k.tenant||c.account!==k.account||c.channel!==k.channel||
        c.peer_id!==k.peer_id||c.binding_revision!==k.binding_revision||
        c.status!=='ACTIVE'||!positive(p.expectedConsentRevision)||
        c.consent_revision!==p.expectedConsentRevision)return refuse('CONSENT_VERSION_CONFLICT');
     db.prepare("UPDATE identity_consents SET status='REVOKED',consent_revision=consent_revision+1,revocation_epoch=revocation_epoch+1 WHERE consent_id=?")
       .run(p.consentId);bumpEpoch(k);
   } else if(kind==='REVOKE_ACCOUNT'||kind==='RELINK_ACCOUNT'){
     if(!a)return refuse('ACCOUNT_NOT_REGISTERED');
     if(kind==='REVOKE_ACCOUNT'&&!a.active)return refuse('ACCOUNT_ALREADY_REVOKED');
     if(kind==='RELINK_ACCOUNT'&&(a.active||!str(p.bindingProofRef)||
       !p.bindingProofRef.startsWith('fake-')))return refuse('W24_RELINK_PROOF_REQUIRED');
     db.prepare('UPDATE identity_accounts SET active=?,binding_revision=binding_revision+1,revocation_epoch=revocation_epoch+1,binding_proof_ref=? WHERE tenant=? AND account=? AND channel=?')
       .run(kind==='RELINK_ACCOUNT'?1:0,kind==='RELINK_ACCOUNT'?p.bindingProofRef:a.binding_proof_ref,
         k.tenant,k.account,k.channel);
     invalidatePeers(k);
     if(kind==='REVOKE_ACCOUNT'){
       // Prevent a new provider binding from reviving the previous GLOBAL
       // auto-grant; never discard spent or ambiguous reserved units.
       const globalKey=sj(k,'GLOBAL',canonicalK);
       db.prepare('INSERT INTO grants(scope_key,scope,enabled,epoch,expires_at,budget_limit,spent,reserved) VALUES(?,?,0,1,8640000000000000,0,0,0) ON CONFLICT(scope_key) DO UPDATE SET enabled=0,epoch=grants.epoch+1')
         .run(globalKey,'GLOBAL');
     }
   } else if(kind==='HUMAN_TAKEOVER'){
     if(!a?.active||!pr?.bound||p.action!=='USER_EDIT')return refuse('NOT_AN_ACTUAL_USER_EDIT');
     const key=canonicalK(k);
     db.prepare("INSERT INTO custody(k,mode,epoch) VALUES(?,'HUMAN',1) ON CONFLICT(k) DO UPDATE SET mode='HUMAN',epoch=epoch+1").run(key);
   } else if(kind==='REVOKE_GRANT'){
     const key=sj(k,p.grantScope||'CONTACT',canonicalK),scope=p.grantScope||'CONTACT';
     if(scope!==p.grantScope||!['CONTACT','GLOBAL'].includes(scope))return refuse('GRANT_SCOPE_REQUIRED');
     const g=db.prepare('SELECT epoch FROM grants WHERE scope_key=?').get(key);
     if(g)db.prepare('UPDATE grants SET enabled=0,epoch=epoch+1 WHERE scope_key=?').run(key);
     else db.prepare('INSERT INTO grants(scope_key,scope,enabled,epoch,expires_at,budget_limit,spent,reserved) VALUES(?,?,0,1,8640000000000000,0,0,0)').run(key,scope);
   }
   return {ok:true};
 }
 function finalizeMutationFence({requestId,generation,actor,ownerValidatedMutation}={}){
   if(!str(requestId)||!positive(generation)||!str(actor)||!ownerValidatedMutation||
     typeof ownerValidatedMutation!=='object')throw Error('W24_TYPED_MUTATION_REQUIRED');
   return transaction(()=>{
     const row=readReq(requestId);
     if(!row)return refuse('MUTATION_NOT_FOUND');
     if(row.generation!==generation)return refuse('MUTATION_GENERATION_CONFLICT');
     if(row.actor!==actor)return refuse('MUTATION_ACTOR_MISMATCH');
     if(row.state==='APPLIED')return {...status(row),replayed:true};
     if(row.state!=='PENDING')return refuse('MUTATION_NOT_PENDING');
     const k=JSON.parse(row.full_k),identity={
       tenant:k[0],account:k[1],channel:k[2],peer_id:k[3],binding_revision:k[4]};
     if(hasLease(identity,JSON.parse(row.scope_key)[0]==='G'?'GLOBAL':'CONTACT'))
       return {ok:false,status:'PENDING',requestId,generation,reason:'ACTIVE_SEND_MUST_SETTLE_FIRST'};
     const barrier=readBarrier.get(row.scope_key);
     if(!barrier||barrier.pending!==1||barrier.generation!==generation)
       return refuse('BARRIER_GENERATION_CHANGED');
     const payload=JSON.parse(row.payload_json);
     if(json(ownerValidatedMutation)!==json(payload))return refuse('W24_TYPED_PAYLOAD_MISMATCH');
     if(typeof verifyOwnerMutation!=='function')return refuse('W24_MUTATION_VALIDATOR_REQUIRED');
     const ownerProof=verifyOwnerMutation({
       actor:row.actor,kind:row.kind,identity,mutation:payload,requestId});
     if(ownerProof&&typeof ownerProof.then==='function')throw Error('ASYNC_W24_PROOF_NOT_ATOMIC');
     if(ownerProof?.verified!==true)return refuse('W24_MUTATION_PROOF_REJECTED');
     const s=snapshot(identity),expected=JSON.parse(row.expected_json);
     if(s.bindingRevision!==expected.expectedBindingRevision||
       s.accountEpoch!==expected.expectedAccountEpoch||
       s.consentEpoch!==expected.expectedConsentEpoch||
       s.custodyEpoch!==expected.expectedCustodyEpoch)return refuse('MUTATION_EPOCH_CHANGED');
     const applied=execute(row,identity,payload,row.actor);
     if(!applied.ok)return applied;
     const after=snapshot(identity),result={
       kind:row.kind,identity,epochs:{bindingRevision:after.bindingRevision,
       accountEpoch:after.accountEpoch,consentEpoch:after.consentEpoch,
       custodyEpoch:after.custodyEpoch},active:!!after.account?.active,
       peerBound:!!after.peer?.bound};
     const at=now();
     db.prepare("UPDATE authority_mutation_requests SET state='APPLIED',result_json=?,committed_at=? WHERE request_id=? AND state='PENDING'")
       .run(json(result),at,requestId);
     db.prepare('UPDATE mutation_barriers SET pending=0 WHERE scope_key=? AND generation=? AND pending=1')
       .run(row.scope_key,generation);
     db.prepare('INSERT INTO authority_privacy_audit VALUES(?,?,?,?,?,?,?)')
       .run('fake-event-'+requestId,requestId,row.kind,row.full_k,row.actor,json(result.epochs),at);
     return {ok:true,status:'COMMITTED',state:'APPLIED',requestId,generation,result};
   });
 }
 function cancelMutationFence({requestId,expectedGeneration,actor,provenNoMutation}={}){
   if(!str(requestId)||!positive(expectedGeneration)||!str(actor)||
       !provenNoMutation||typeof provenNoMutation!=='object')
     throw Error('EXPLICIT_CANCEL_PROOF_REQUIRED');
   return transaction(()=>{
     const row=readReq(requestId);
     if(!row||row.actor!==actor)return refuse('MUTATION_NOT_FOUND_OR_UNAUTHORIZED');
     if(row.generation!==expectedGeneration)return refuse('MUTATION_GENERATION_CONFLICT');
     if(row.state!=='PENDING')return refuse('MUTATION_ALREADY_TERMINAL');
     const k=JSON.parse(row.full_k),identity={
       tenant:k[0],account:k[1],channel:k[2],peer_id:k[3],binding_revision:k[4]};
     const scope=JSON.parse(row.scope_key)[0]==='G'?'GLOBAL':'CONTACT';
     if(hasLease(identity,scope))return {ok:false,status:'PENDING',
       reason:'ACTIVE_SEND_MUST_SETTLE_FIRST',requestId,generation:expectedGeneration};
     if(typeof verifyOwnerCancellation!=='function')return refuse('W24_CANCEL_VERIFIER_REQUIRED');
     const approval=verifyOwnerCancellation({requestId,actor,identity,kind:row.kind,
       provenNoMutation});
     if(approval&&typeof approval.then==='function')throw Error('ASYNC_W24_CANCEL_UNSUPPORTED');
     if(approval?.verified!==true)return refuse('CANCEL_UNPROVEN');
     const current=readBarrier.get(row.scope_key);
     if(!current||current.pending!==1||current.generation!==expectedGeneration)
       return refuse('BARRIER_GENERATION_CHANGED');
     const outcome={reason:'PROVEN_NOT_APPLIED',cancelProofRef:provenNoMutation.proofRef??null};
     db.prepare("UPDATE authority_mutation_requests SET state='REJECTED',result_json=?,committed_at=? WHERE request_id=? AND state='PENDING'")
       .run(json(outcome),now(),requestId);
     db.prepare('UPDATE mutation_barriers SET pending=0 WHERE scope_key=? AND generation=? AND pending=1')
       .run(row.scope_key,expectedGeneration);
     return {ok:true,status:'REJECTED',requestId,generation:expectedGeneration,result:outcome};
   });
 }
 function mutationResult({requestId,actor}={}){
   if(!str(requestId)||!str(actor))throw Error('MUTATION_ACTOR_REQUIRED');
   const row=readReq(requestId);
   return row&&row.actor===actor?status(row):refuse('MUTATION_NOT_FOUND_OR_UNAUTHORIZED');
 }
 return Object.freeze({readIdentityAuthority,readNativeCurrent,readMutationFence,
   requestMutationFence,finalizeMutationFence,cancelMutationFence,mutationResult});
}

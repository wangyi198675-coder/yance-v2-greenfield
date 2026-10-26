/**
 * W28 / Issue #61: thin adapter to REAL Baileys SDK. No provider protocol implementation.
 * Never starts a socket during import or until a W47/W24-verified user grant is injected.
 * Credentials/Signal key persistence belongs to the protected platform Vault Owner, not here.
 * Transport is inbound/read-only. ONLY W25 may own physical sending/ACK settlement.
 */
import makeWASocket, {
  DisconnectReason, jidNormalizedUser, normalizeMessageContent, getContentType,
} from 'baileys';
import pino from 'pino';

export const NATIVE_BAILEYS = Object.freeze({
  package: 'baileys', version: '7.0.0-rc14',
  upstreamCommit: '7e7b0757e3f9f3c7789fb1cfd2f241d5002a199a',
  permission: 'HOLD_UNTIL_AUTHORITATIVE_PROVIDER_AND_USER_APPROVAL',
});
const fail = c => { throw Object.assign(new Error(c), {code:c}) };
const required = x => typeof x === 'string' && x.length > 0 && x.length <= 512;
const object = x => !!x && typeof x === 'object' && !Array.isArray(x);
const safeError = e => String(e?.code ?? 'NATIVE_WORKER_ERROR').replace(/[^A-Z0-9_]/gi, '_').slice(0,60);
const noop = () => {};
const defaultDeps = Object.freeze({makeWASocket, logger:pino({level:'silent'})});
const eventsToSubscribe = ['connection.update','creds.update','messaging-history.set','contacts.upsert','contacts.update',
  'chats.upsert','chats.update','messages.upsert','messages.update','message-receipt.update'];

export function createNativeBaileysWorker({
  authorization, authStore, identity, inbound, observed, sdk = defaultDeps,
} = {}) {
  // These ports must be provided by their existing native Owners. No permissive fallback.
  if (typeof authorization?.authorizeStart !== 'function' || typeof authorization?.assertCurrent !== 'function' ||
      typeof authStore?.open !== 'function' || typeof authStore?.revoke !== 'function' ||
      typeof identity?.resolveAccount !== 'function' || typeof identity?.resolvePeer !== 'function' ||
      typeof inbound?.acceptInbound !== 'function' || typeof inbound?.recordReceipt !== 'function' ||
      typeof sdk?.makeWASocket !== 'function' || !sdk.logger) fail('NATIVE_OWNER_PORTS_REQUIRED');
  if (observed !== undefined && (typeof observed?.onState !== 'function' || typeof observed?.onQr !== 'function'))
    fail('NATIVE_UI_PORTS_REQUIRED');

  let sock = null, current = null, secureAuth = null, seq = 0, state = 'WAITING_USER_AUTH';
  let verifiedAccount = null, startPending = false, revoked = false, lastBinding = null;
  let self = null, lastError = null, messageCount = 0, qrGeneration = 0, qrExpiry = 0;
  const verifiedContacts = new Set();
  const safeObserve = async (name, data) => {
    try { if (name === 'state') await observed?.onState?.(data);
      else if (name === 'qr') await observed?.onQr?.(data); } catch { /* UI callback is not authority */ }
  };
  const getAccountIdentity = () => state==='ONLINE' && verifiedAccount && self ? Object.freeze({
    tenant:verifiedAccount.tenant,account:verifiedAccount.account,
    channel:verifiedAccount.channel,bindingRevision:verifiedAccount.binding_revision,
    platformJid:self.jid,platformLid:self.lid,
    accountRevocationEpoch:current?.accountRevocationEpoch,
    provenance:'BAILEYS_NATIVE_VERIFIED_WITH_W24',
  }) : null;
  const getStatus = () => Object.freeze({
    installed:true, sdk:'baileys', sdkVersion:NATIVE_BAILEYS.version, nativeSocketCreated:!!sock,
    state, connected:state==='ONLINE', qrAvailable:state==='WAITING_QR_SCAN' && Date.now()<qrExpiry,
    qrGeneration, contactCount:verifiedContacts.size, messageCount, canSend:false,
    accountBound:!!self, userAuthorization:current?'CHECKED_FOR_THIS_SESSION':'NOT_PRESENT',
    lastError,
  });
  const notify = () => void safeObserve('state',getStatus());
  const assertCurrent = async (phase, n) => {
    if (n!==seq || !current || !sock) fail('WORKER_EPOCH_STALE');
    const ok=await authorization.assertCurrent(Object.freeze({
      binding:current,phase,accountRevocationEpoch:current.accountRevocationEpoch,
      bindingRevision:current.bindingRevision,
    }));
    if (ok !== true || n!==seq) fail('AUTHORIZATION_REVOKED_OR_STALE');
  };
  const sanitizeSelf = user => {
    if (!required(user?.id)) fail('NO_NATIVE_SELF_JID');
    const id=jidNormalizedUser(user.id);
    return Object.freeze({jid:id,lid:required(user.lid)?jidNormalizedUser(user.lid):null});
  };
  const closeSocket = () => {
    const old=sock; sock=null;
    if(old) { try { old.ev?.removeAllListeners?.(); } catch {}
      try { old.end?.(new Error('W28_STOPPED')); } catch {}
      try { old.ws?.close?.(); } catch {} }
  };
  async function stop() {
    if(revoked)return getStatus();
    seq++;closeSocket();self=null;verifiedAccount=null;secureAuth=null;current=null;
    verifiedContacts.clear();qrExpiry=0;qrGeneration=0;state='WAITING_USER_AUTH';notify();
    return getStatus();
  }
  async function revoke() {
    const before=current??lastBinding;
    revoked=true;
    lastBinding=null;
    // Immediate in-memory fence blocks late SDK callbacks before any I/O.
    seq++;closeSocket();self=null;verifiedAccount=null;secureAuth=null;current=null;
    verifiedContacts.clear();qrExpiry=0;qrGeneration=0;state='REVOKED';notify();
    if(before) { await authStore.revoke({binding:before}); }
    return getStatus();
  }

  const observedEvent = async (n, type, payload) => {
    await assertCurrent('READ_EVENT',n);
    if(state!=='ONLINE' || !self) return;
    const account=await identity.resolveAccount({binding:current,selfJid:self.jid,selfLid:self.lid});
    if(!account || account.channel!=='WHATSAPP_PERSONAL' || !required(account.account) ||
       !Number.isSafeInteger(account.binding_revision) || account.binding_revision!==current.bindingRevision ||
       account.account!==current.accountId || account.tenant!==current.tenantId)
       fail('W24_ACCOUNT_NOT_VERIFIED');
    const trusted = {account, binding:current, self};
    if(type==='contacts.upsert' || type==='contacts.update' || type==='chats.upsert' ||
       type==='chats.update' || type==='messaging-history.set') {
      const peers=type==='messaging-history.set'?payload?.contacts:
        Array.isArray(payload)?payload:[];
      if(Array.isArray(peers)) {
        for(const p of peers) {
          if(n!==seq)return;
          const raw=p?.id; if(!required(raw))continue;
          // Never persist untrusted JID and never mark an unverified contact as owned.
          try { const verified=await identity.resolvePeer({...trusted,remoteJid:raw});
            if(verified?.bound===true && required(verified.peer_id))verifiedContacts.add(verified.peer_id); }catch{}
        }
      }
      notify();
      return;
    }
    if(type==='messages.upsert') {
      for(const m of payload?.messages ?? []) {
        if(n!==seq) return;
        if(m?.key?.fromMe || !required(m?.key?.remoteJid) || !required(m?.key?.id))continue;
        if(m.key.remoteJid.endsWith('@g.us') || m.key.remoteJid==='status@broadcast')continue;
        const peer=await identity.resolvePeer({...trusted,remoteJid:m.key.remoteJid});
        if(peer?.bound!==true || !required(peer.peer_id))continue;
        const K=Object.freeze({tenant:account.tenant,account:account.account,channel:'WHATSAPP_PERSONAL',
          peer_id:peer.peer_id,binding_revision:account.binding_revision});
        await assertCurrent('INBOUND',n);
        // Use the SDK's own normalizer. Non-text types remain typed events for W23/W45.
        const content=normalizeMessageContent(m.message||{});
        const kind=content?getContentType(content):null;
        const text=content?.conversation ?? content?.extendedTextMessage?.text ?? null;
        await inbound.acceptInbound(Object.freeze({
          k:K,provider:'BAILEYS_NATIVE',providerMid:m.key.id,
          providerRemoteJid:m.key.remoteJid,original:typeof text==='string'?text:null,
          nativeContentKind:kind,deliveryStatus:'INBOUND_NOT_SENT',w25Status:'NOT_REQUESTED',
          provenance:'BAILEYS_NATIVE_MESSAGES_UPSERT',
        }));
        messageCount++;
      }
      notify();return;
    }
    if(type==='messages.update' || type==='message-receipt.update') {
      for(const update of payload ?? []) {
        if(n!==seq) return;
        const key=update?.key;
        if(!required(key?.id) || !required(key?.remoteJid) || key.fromMe!==true)continue;
        const peer=await identity.resolvePeer({...trusted,remoteJid:key.remoteJid});
        if(peer?.bound!==true || !required(peer.peer_id))continue;
        await assertCurrent('RECEIPT',n);
        // Pass native raw status fields. W25 is SOLE authority to confirm ACK/UNKNOWN.
        await inbound.recordReceipt(Object.freeze({
          k:Object.freeze({tenant:account.tenant,account:account.account,channel:'WHATSAPP_PERSONAL',
            peer_id:peer.peer_id,binding_revision:account.binding_revision}),
          provider:'BAILEYS_NATIVE',providerMid:key.id,providerRemoteJid:key.remoteJid,
          eventType:type,nativeStatus:update?.update?.status??null,
          nativeReceiptTimestamps:Array.isArray(update?.receipt)?update.receipt.length:null,
          settlement:'W25_DECIDES_NOT_THIS_ADAPTER',
        }));
      }
    }
  };
  function attach(s,n) {
    const processEvent=(type,value) => {
      Promise.resolve().then(()=>observedEvent(n,type,value)).catch(e=>{
        if(n===seq) { lastError=safeError(e); notify(); }
      });
    };
    s.ev.on('connection.update', update => {
      if(n!==seq) return;
      if(update?.qr) {
        qrGeneration++;qrExpiry=Date.now()+60_000;state='WAITING_QR_SCAN';notify();
        // QR raw is a short-lived bearer secret; only protected W46/native UI callback sees it.
        void (async()=>{
          try { await assertCurrent('PAIRING_QR',n);
            if(n===seq && Date.now()<qrExpiry) await safeObserve('qr',Object.freeze({
              rawQr:update.qr,generation:qrGeneration,expiresAt:qrExpiry,
              instruction:'Scan only in your own WhatsApp Linked Devices screen',
            })); } catch {}
        })();
      }
      if(update?.connection==='open') {
        Promise.resolve().then(async()=>{
          await assertCurrent('CONNECTED',n);self=sanitizeSelf(s.user);
          const account=await identity.resolveAccount({binding:current,selfJid:self.jid,selfLid:self.lid});
          if(!account || account.channel!=='WHATSAPP_PERSONAL' ||
             account.account!==current.accountId || account.tenant!==current.tenantId ||
             account.binding_revision!==current.bindingRevision) fail('W24_ACCOUNT_NOT_VERIFIED');
          await assertCurrent('CONNECTED',n);
          if(n===seq){verifiedAccount=Object.freeze({...account});state='ONLINE';qrExpiry=0;notify();}
        }).catch(e=>{ if(n===seq){lastError=safeError(e);state='HOLD_IDENTITY';notify();closeSocket();} });
      } else if(update?.connection==='close'){
        const errorCode=update?.lastDisconnect?.error?.output?.statusCode;
        state=errorCode===DisconnectReason.loggedOut?'LOGGED_OUT':'DISCONNECTED';
        lastError=errorCode===DisconnectReason.loggedOut?'NATIVE_LOGGED_OUT':'NATIVE_DISCONNECTED';
        qrExpiry=0;notify();
        // No automatic recovery or auth resurrection: user/W47 must reauthorize.
        if(errorCode===DisconnectReason.loggedOut) { void revoke().catch(noop); }
        else { seq++;closeSocket();current=null;secureAuth=null;self=null;verifiedAccount=null;verifiedContacts.clear(); }
      }
    });
    s.ev.on('creds.update', async delta => {
      if(n!==seq) return;
      try {await assertCurrent('SAVE_CREDS',n);await secureAuth.saveCreds(delta);}
      catch(e){if(n===seq){lastError='SECURE_AUTH_PERSIST_FAILED';state='HOLD_VAULT';notify();seq++;closeSocket();}}
    });
    for(const name of eventsToSubscribe.slice(2)) s.ev.on(name,value=>processEvent(name,value));
  }
  async function start({userAction,accountLocator}={}) {
    if(revoked)fail('ACCOUNT_REVOKED');
    if(sock || current || startPending) fail('WORKER_ALREADY_STARTED');
    if(userAction!=='PAIR_OWN_ACCOUNT' && userAction!=='RESUME_EXPLICITLY_APPROVED') fail('EXPLICIT_USER_ACTION_REQUIRED');
    if(!required(accountLocator)) fail('ACCOUNT_LOCATOR_REQUIRED');
    // No user-supplied boolean authorizes real contact. This trusted W47/W24
    // server-side port must verify principal, platform terms, grant and revocation.
    const originalSeq=seq;
    startPending=true;
    let permit;
    try { permit=await authorization.authorizeStart({userAction,accountLocator}); }
    finally { startPending=false; }
    if(revoked)fail('ACCOUNT_REVOKED');
    if(seq!==originalSeq)fail('WORKER_EPOCH_STALE');
    if(!object(permit)||permit.authorized!==true||permit.userConsented!==true||
      permit.platformPermitted!==true||permit.principalVerified!==true||
      (permit.accountVerified!==true && permit.enrollmentApproved!==true)||
      !required(permit.accountId)||!required(permit.tenantId)||
      !Number.isSafeInteger(permit.bindingRevision)||
      !Number.isSafeInteger(permit.accountRevocationEpoch)||
      permit.revisionRevoked===true) fail('PLATFORM_OR_USER_AUTH_HOLD');
    if(userAction==='RESUME_EXPLICITLY_APPROVED' &&
       (permit.restoreApproved!==true||permit.accountVerified!==true))
      fail('RESTORE_NOT_AUTHORIZED');
    if(lastBinding && (lastBinding.accountId!==permit.accountId||lastBinding.tenantId!==permit.tenantId))
      fail('WORKER_ACCOUNT_SWITCH_FORBIDDEN');
    current=Object.freeze({...permit});const n=++seq;state='STARTING_NATIVE_SDK';notify();
    try {
      const startAllowed=await authorization.assertCurrent({binding:current,phase:'START',bindingRevision:current.bindingRevision,
        accountRevocationEpoch:current.accountRevocationEpoch});
      if(startAllowed!==true)fail('AUTHORIZATION_REVOKED_OR_STALE');
      // Existing secured custody Owner must provide persistent creds + Signal keys.
      // Deliberately DO NOT call useMultiFileAuthState or create any plaintext vault.
      const auth=await authStore.open({binding:current,userAction});
      if(!object(auth?.state?.creds) || typeof auth?.state?.keys?.get!=='function' ||
        typeof auth?.state?.keys?.set!=='function' || typeof auth?.saveCreds!=='function')
        fail('W55_PERSISTENT_SIGNAL_AUTH_REQUIRED');
      if(n!==seq) fail('WORKER_EPOCH_STALE');
      secureAuth=auth;
      lastBinding=current; // non-secret W24 binding reference, enables revoke after disconnect.
      const s=sdk.makeWASocket({
        auth:auth.state, logger:sdk.logger, markOnlineOnConnect:false,
        syncFullHistory:false,
      });
      if(!object(s?.ev)||typeof s.ev.on!=='function')fail('INVALID_BAILEYS_SOCKET');
      sock=s;attach(s,n);return getStatus();
    }catch(e){
      if(n===seq){seq++;closeSocket();current=null;secureAuth=null;state='WAITING_USER_AUTH';lastError=safeError(e);notify();}
      throw e;
    }
  }
  return Object.freeze({getStatus,getAccountIdentity,start,stop,revoke,upstream:NATIVE_BAILEYS});
}

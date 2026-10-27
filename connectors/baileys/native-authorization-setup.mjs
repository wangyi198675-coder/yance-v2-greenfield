/**
 * W28 Issue #77 — real Baileys authorization UI backend owner-port.
 * Mount behind the EXISTING W47/W54 native-first-party session / W24 consent;
 * no HTTP listener, API gateway, local login system, QR fabrication or sender.
 *
 * Expected W47 click mapping (implemented by W47, not W28):
 *   GET status / POST pair / GET qr / POST disconnect / POST revoke / POST reconnect
 * On every call W47 must inject its own signed nativeSession, NEVER trust request JSON.
 */
import {createBaileysPairingViewPort} from './native-pairing-port.mjs';

const fail=code=>{throw Object.assign(new Error(code),{code})};
const valid=s=>typeof s==='string'&&s.length>0&&s.length<=256;
const same=(a,b)=>!!a&&!!b&&a.principalRef===b.principalRef&&
  a.installationRef===b.installationRef&&a.revocationGeneration===b.revocationGeneration&&
  a.sessionRef===b.sessionRef;

export function createBaileysNativeSetupController({createWorker,verifyNativeSession}={}){
  if(typeof createWorker!=='function'||typeof verifyNativeSession!=='function')
    fail('W47_W28_TRUSTED_NATIVE_PORTS_REQUIRED');
  let owner=null, pending=false, image=null, state='WAITING_USER_AUTH';
  const clearQr=async()=>{image=null;};
  const check=async(nativeSession,operation)=>{
    // nativeSession comes from W47 authenticated local-session middleware, not client JSON.
    const verified=await verifyNativeSession({nativeSession,operation,channel:'WHATSAPP_PERSONAL'});
    if(verified?.verified!==true||verified.kind!=='NATIVE_FIRST_PARTY'||
      !valid(verified.principalRef)||!valid(verified.installationRef)||
      !valid(verified.sessionRef)||!Number.isSafeInteger(verified.revocationGeneration)||
      verified.revocationGeneration<0)fail('W54_SIGNED_NATIVE_SESSION_REQUIRED');
    return Object.freeze({principalRef:verified.principalRef,
      installationRef:verified.installationRef,sessionRef:verified.sessionRef,
      revocationGeneration:verified.revocationGeneration});
  };
  const owned=async(nativeSession,operation)=>{
    const v=await check(nativeSession,operation);
    if(owner && !same(v,owner))fail('CROSS_PRINCIPAL_OR_STALE_SESSION');
    return v;
  };
  const pairingView=createBaileysPairingViewPort({
    assertAuthorizedLocalViewer:async()=>{
      if(!owner)return false;
      try{const v=await check(owner.nativeSession,'SHOW_WHATSAPP_PAIRING_QR');
        return same(v,owner);}catch{return false}
    },
    showImage:async payload=>{
      // Suppress SDK QR events that finish after stop/disconnect/revoke.
      const status=worker?.getStatus?.();
      if(status?.state!=='WAITING_QR_SCAN'||status.qrAvailable!==true||!owner)return;
      // Never save a real QR, PNG or bearer as a file or log.
      image=Object.freeze({...payload,principalRef:owner.principalRef,sessionRef:owner.sessionRef});
    },
    clearImage:clearQr,
  });
  const worker=createWorker({
    onQr:async qr=>{
      // Received ONLY from original SDK's connection.update.qr.
      if(!owner||!['STARTING_NATIVE_SDK','WAITING_QR_SCAN'].includes(worker.getStatus().state))return;
      try{await pairingView.onQr(qr);}catch{await clearQr();}
    },
    onState:async status=>{
      state=status.state;
      if(!status.qrAvailable||!['WAITING_QR_SCAN'].includes(status.state))await clearQr();
    },
  });
  if(!worker||typeof worker.start!=='function'||typeof worker.stop!=='function'||
    typeof worker.revoke!=='function'||typeof worker.getStatus!=='function'||
    typeof worker.getAccountIdentity!=='function')fail('W28_REAL_NATIVE_WORKER_REQUIRED');

  async function readStatus({nativeSession}={}){
    const first=await owned(nativeSession,'READ_WHATSAPP_STATUS');
    const status=worker.getStatus();
    const account=status.connected?worker.getAccountIdentity():null;
    const second=await check(nativeSession,'READ_WHATSAPP_STATUS');
    if(!same(first,second))fail('NATIVE_SESSION_CHANGED_DURING_READ');
    // Principal identity and self JID are shown ONLY to the same signed local user.
    return Object.freeze({ok:true,channel:'WHATSAPP_PERSONAL',source:'BAILEYS_NATIVE_SDK',
      ...status, state:status.state,
      accountIdentityVerified:!!account,
      account:account?Object.freeze({...account}):null,
      userActionRequired:!status.connected,canSend:false,
      realQrFromSdkOnly:true});
  }
  async function readAvatar({nativeSession,remoteJid}={}){
    const first=await owned(nativeSession,'READ_WHATSAPP_AVATAR');
    if(typeof worker.readAvatar!=='function')fail('W28_NATIVE_AVATAR_PORT_REQUIRED');
    const result=await worker.readAvatar({remoteJid});
    const after=await check(nativeSession,'READ_WHATSAPP_AVATAR');
    if(!same(first,after)||!owner||!same(first,owner))
      fail('NATIVE_SESSION_CHANGED_DURING_AVATAR_READ');
    return Object.freeze({ok:true,channel:'WHATSAPP_PERSONAL',...result,canSend:false});
  }
  async function begin(nativeSession,accountLocator,userAction){
    if(pending)fail('SETUP_ACTION_IN_PROGRESS');
    if(!valid(accountLocator))fail('ACCOUNT_LOCATOR_REQUIRED');
    const current=await owned(nativeSession,userAction);
    if(owner&&!same(current,owner))fail('CROSS_PRINCIPAL_OR_STALE_SESSION');
    // A cold restart or deliberate disconnect may have no in-memory owner.
    // W47/W24 and the protected Vault must independently approve explicit restore;
    // the Worker requires restoreApproved:true and never auto-restores removed accounts.
    if(userAction==='PAIR_OWN_ACCOUNT' && owner && worker.getStatus().connected)
      fail('ACCOUNT_ALREADY_CONNECTED');
    if(pending)fail('SETUP_ACTION_IN_PROGRESS');
    pending=true;
    const previousOwner=owner;
    try{
      // Store only native server-side signed context, never a QR, key or cookie.
      owner=Object.freeze({...current,nativeSession});
      if(!worker.getStatus().nativeSocketCreated)await clearQr();
      const result=await worker.start({userAction,accountLocator});
      const recheck=await check(nativeSession,userAction);
      if(!same(recheck,owner)){
        await worker.stop();owner=null;fail('NATIVE_SESSION_CHANGED_DURING_PAIRING');
      }
      return Object.freeze({ok:true,channel:'WHATSAPP_PERSONAL',
        state:result.state,connected:result.connected,qrAvailable:result.qrAvailable,
        canSend:false,userActionRequired:!result.connected});
    }catch(e){
      // A second click must not orphan a legitimately pending SDK Socket/QR.
      if(!worker.getStatus().nativeSocketCreated)await clearQr();
      owner=previousOwner;
      throw e;
    }finally{pending=false}
  }
  async function beginPairing({nativeSession,accountLocator}={}){
    return begin(nativeSession,accountLocator,'PAIR_OWN_ACCOUNT');
  }
  async function reconnect({nativeSession,accountLocator}={}){
    return begin(nativeSession,accountLocator,'RESUME_EXPLICITLY_APPROVED');
  }
  async function readQr({nativeSession}={}){
    if(!owner)fail('PAIRING_NOT_STARTED');
    const first=await owned(nativeSession,'READ_WHATSAPP_QR');
    // The Baileys upstream emits QR before QRCode.toDataURL has finished.
    // An immediate first-party GET must await that real render briefly rather
    // than falsely claim that the SDK QR does not exist. Never fabricate one.
    if(worker.getStatus().state==='WAITING_QR_SCAN' && worker.getStatus().qrAvailable &&
       !image && same(first,owner)) {
      for(let tries=0;tries<20&&!image;tries++){
        await new Promise(resolve=>setTimeout(resolve,25));
        if(worker.getStatus().state!=='WAITING_QR_SCAN'||!worker.getStatus().qrAvailable||
           !owner||!same(first,owner))break;
      }
    }
    if(worker.getStatus().state!=='WAITING_QR_SCAN'||!worker.getStatus().qrAvailable||
      !image||!same(first,owner)||Date.now()>=image.expiresAt){
      await clearQr();fail('SDK_QR_NOT_AVAILABLE');
    }
    const result=Object.freeze({ok:true,source:'BAILEYS_NATIVE_CONNECTION_UPDATE',
      imageDataUrl:image.imageDataUrl,expiresAt:image.expiresAt,generation:image.generation});
    const after=await check(nativeSession,'READ_WHATSAPP_QR');
    if(!same(after,owner)||!same(after,first))fail('NATIVE_SESSION_CHANGED_DURING_QR_READ');
    return result;
  }
  async function disconnect({nativeSession}={}){
    if(pending)fail('SETUP_ACTION_IN_PROGRESS');
    await owned(nativeSession,'DISCONNECT_WHATSAPP');
    if(pending)fail('SETUP_ACTION_IN_PROGRESS');
    pending=true;
    try{
      await clearQr();const result=await worker.stop();
      // Preserve only this signed owner's non-secret binding for a later REVOKE.
      // Disconnect is not consent to erase protected credentials; cold restart
      // requires W47/W24/W55 to independently verify an explicit reconnect.
      return Object.freeze({ok:true,state:result.state,canSend:false,connected:false});
    }finally{pending=false}
  }
  async function revoke({nativeSession}={}){
    if(pending)fail('SETUP_ACTION_IN_PROGRESS');
    await owned(nativeSession,'REVOKE_WHATSAPP');
    if(pending)fail('SETUP_ACTION_IN_PROGRESS');
    pending=true;
    try{
      await clearQr();
      // Unlike disconnect, revoke MUST fence and erase the W55 Owner's protected session.
      const result=await worker.revoke();owner=null;
      return Object.freeze({ok:true,state:result.state,canSend:false,connected:false,
        credentialRevokeRequested:true});
    }finally{pending=false}
  }
  return Object.freeze({readStatus,readAvatar,beginPairing,readQr,reconnect,disconnect,revoke});
}

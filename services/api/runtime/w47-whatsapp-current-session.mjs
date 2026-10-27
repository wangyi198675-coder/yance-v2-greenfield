// Existing W47 HttpOnly local-session and W54 native boot -> original W28.
// No extra user pairing, login or principal/consent authority.
import {timingSafeEqual} from 'node:crypto';
const refuse=code=>{throw Object.assign(new Error(code),{code})};
const operations=new Set(['READ_WHATSAPP_STATUS','READ_WHATSAPP_AVATAR',
 'PAIR_OWN_ACCOUNT','READ_WHATSAPP_QR','DISCONNECT_WHATSAPP',
 'REVOKE_WHATSAPP','RESUME_EXPLICITLY_APPROVED',
 'SHOW_WHATSAPP_PAIRING_QR']);
export function createW47WhatsAppCurrentSessionPort({
 sessionAuthority,nativeBoot,nativeSession,webOrigin
}={}){
 if(typeof sessionAuthority?.sessionFor!=='function'||
    nativeBoot?.source!=='W54_NATIVE_CURRENT_USER'||nativeBoot.verified!==true||
    typeof nativeBoot.principalRef!=='string'||
    typeof nativeBoot.installationRef!=='string'||
    !Number.isSafeInteger(nativeBoot.nativeRevocationGeneration)||
    !/^[a-f0-9]{64}$/.test(nativeSession?.binding??'')||
    typeof webOrigin!=='string')return null;
 let liveWitness=null;
 function checked(req,operation){
  if(!req||!operations.has(operation))refuse('W54_WHATSAPP_ACTION_INVALID');
  const session=sessionAuthority.sessionFor(req);
  if(session?.record?.kind!=='NATIVE_FIRST_PARTY'||
     session.record.nativeHostBinding!==nativeSession.binding)
   refuse('W54_SIGNED_NATIVE_SESSION_REQUIRED');
  if(req.headers.origin&&req.headers.origin!==webOrigin)
   refuse('W54_WHATSAPP_ORIGIN_DENIED');
  if(req.headers['sec-fetch-site']&&
     !['same-origin','none'].includes(req.headers['sec-fetch-site']))
   refuse('W54_WHATSAPP_CROSS_SITE_DENIED');
  if(req.method==='POST'){
   const expected=session.record.csrf,actual=req.headers['x-yance-csrf'];
   if(typeof expected!=='string'||typeof actual!=='string'||
      !/^[a-f0-9]{64}$/.test(expected)||!/^[a-f0-9]{64}$/.test(actual)||
      !timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))
    refuse('W54_WHATSAPP_CSRF_DENIED');
  }
  return session;
 }
 const resolveSignedNativeSession=async({request,operation}={})=>{
  const session=checked(request,operation);
  liveWitness=Object.freeze({request,sessionId:session.id,record:session.record});
  return Object.freeze({nativeSession:Object.freeze({
   request,sessionRef:session.id,sessionRecord:session.record,
   owner:'W47_ORIGINAL_NATIVE_SESSION'}),
   originVerified:true,csrfVerified:true,rendererVerified:true});
 };
 const verifyNativeSession=async({nativeSession:issued,operation}={})=>{
  if(!issued||issued.owner!=='W47_ORIGINAL_NATIVE_SESSION'||
     !issued.request||!issued.sessionRecord)refuse('W54_SIGNED_NATIVE_SESSION_REQUIRED');
  const current=checked(issued.request,operation);
  if(current.id!==issued.sessionRef||current.record!==issued.sessionRecord)
   refuse('W54_SESSION_REVOKED_DURING_ACTION');
  return Object.freeze({verified:true,kind:'NATIVE_FIRST_PARTY',
   principalRef:nativeBoot.principalRef,
   installationRef:nativeBoot.installationRef,
   sessionRef:current.id,
   revocationGeneration:nativeBoot.nativeRevocationGeneration});
 };
 const assertCurrentNativeUser=async()=>{
  if(!liveWitness)return false;
  const {request,sessionId,record}=liveWitness;
  const now=sessionAuthority.sessionFor(request);
  return now?.id===sessionId&&now.record===record&&
   record.nativeHostBinding===nativeSession.binding;
 };
 return Object.freeze({resolveSignedNativeSession,verifyNativeSession,
  assertCurrentNativeUser});
}

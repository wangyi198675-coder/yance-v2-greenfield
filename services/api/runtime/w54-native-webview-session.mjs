// W47's single existing local Session authority bound to official W54 host.
// This module is a SERVER-PRIVATE composition seam, not a new HTTP endpoint,
// login system, token issuer, cookie API, or browser-callable Tauri command.
// Production MUST inject the independently reviewed W54 Windows OS-process
// attester and actual installed Tauri WebView2 native Cookie Store adapter.
import {randomBytes} from 'node:crypto';

export function createW54NativeWebViewSessionJoin({
  sessionAuthority,verifySignedHost,verifyStillCurrent,
  deliverNativeCookie,subscribeHostExit
}={}){
 if(typeof sessionAuthority?.issueNativeWebView!=='function'||
    typeof sessionAuthority?.revokeNativeHost!=='function')
   throw Error('W47_ORIGINAL_SESSION_AUTHORITY_REQUIRED');
 if([verifySignedHost,verifyStillCurrent,deliverNativeCookie,subscribeHostExit]
   .some(fn=>typeof fn!=='function'))
   throw Error('W54_NATIVE_PARENT_WEBVIEW_LIFECYCLE_PRODUCER_REQUIRED');
 const active=new Map();
 return Object.freeze({
  begin:async({verifiedChildPipe}={})=>{
   if(!verifiedChildPipe)throw Error('W54_PRIVATE_CHILD_PIPE_REQUIRED');
   // This callback must verify actual OS parent process, installed bundle
   // code signature/pin, native user/app installation, live revocation epoch
   // and approved Tauri renderer identity. NO localhost/JS header/token proof.
   const approved=await verifySignedHost({verifiedChildPipe});
   const valid=approved&&approved.authoritative===true&&
    typeof approved.nativeHostRef==='string'&&
    /^[a-f0-9]{64}$/.test(approved.nativeHostRef)&&
    typeof approved.rendererRef==='string'&&
    /^[A-Za-z0-9_-]{12,128}$/.test(approved.rendererRef)&&
    Number.isSafeInteger(approved.nativeRevocationGeneration)&&
    approved.nativeRevocationGeneration>=0;
   if(!valid)throw Error('W54_NATIVE_SIGNED_HOST_UNVERIFIED');
   if(active.has(approved.nativeHostRef))throw Error('W54_NATIVE_HOST_SESSION_ALREADY_ACTIVE');
   const binding=randomBytes(32).toString('hex'); // purely server owned
   let closed=false,unsubscribe=null;
   const close=()=>{
    if(closed)return;
    closed=true;
    sessionAuthority.revokeNativeHost(binding);
    active.delete(approved.nativeHostRef);
    try{unsubscribe?.()}catch{}
   };
   active.set(approved.nativeHostRef,{close,binding});
   try{
    // W54 MUST register OS-host close/revoke BEFORE any session cookie exists.
    unsubscribe=await subscribeHostExit({approvedHost:approved,verifiedChildPipe,onExit:close});
    if(typeof unsubscribe!=='function'||closed)
     throw Error('W54_HOST_LIFETIME_WATCH_UNAVAILABLE');
    if(await verifyStillCurrent({approvedHost:approved,verifiedChildPipe})!==true)
     throw Error('W54_HOST_REVOKED_BEFORE_COOKIE');
    const minted=sessionAuthority.issueNativeWebView(binding);
    // Private native W54 WebView2 cookie store ONLY. Never reply Set-Cookie on
    // a generic localhost HTTP route or return the cookie to the caller.
    const delivered=await deliverNativeCookie({
     approvedHost:approved,verifiedChildPipe,
     rendererRef:approved.rendererRef,httpOnlyCookie:minted.cookie
    });
    if(delivered!==true||closed)throw Error('W54_TAURI_WEBVIEW_COOKIE_NOT_BOUND');
    if(await verifyStillCurrent({approvedHost:approved,verifiedChildPipe})!==true)
     throw Error('W54_HOST_CHANGED_DURING_COOKIE_BIND');
    return Object.freeze({ok:true,sessionKind:'NATIVE_FIRST_PARTY',
     expiresAt:minted.expiresAt,canSend:false,providerAuthorized:false});
   }catch(e){
    close();
    throw e;
   }
  },
  onVerifiedNativeHostRevoked:hostRef=>{
   const entry=active.get(hostRef);
   if(!entry)return false;
   entry.close();
   return true;
  },
  closeAll:()=>{
   for(const entry of [...active.values()])entry.close();
  }
 });
}

// W54 ORIGINAL Tauri 2 main.rs exposes only session_status/logout_session.
// Renderer cannot issue native proof, user SID, child start, or W55 key lease.
// W47 NATIVE_FIRST_PARTY HTTP remains independent authority.
const deny=s=>{throw Error(s)};
export function createNativeSessionViewer({tauri=globalThis.__TAURI__,fetchImpl=globalThis.fetch}={}){
 if(typeof tauri?.core?.invoke!=='function')return Object.freeze({
  available:false,async inspect(){deny('TAURI_NATIVE_NOT_INSTALLED')},
  async logout(){deny('TAURI_NATIVE_NOT_INSTALLED')}
 });
 const invoke=tauri.core.invoke;
 const inspect=async()=>{
  const s=await invoke('session_status');
  if(!s||typeof s.nativeOsVerified!=='boolean'||
     typeof s.nativeSessionActive!=='boolean'||typeof s.serverTrusted!=='boolean'||
     s.canSend!==false||!Number.isSafeInteger(s.connectedAccountCount)||
     s.connectedAccountCount<0)
   deny('W54_SESSION_STATUS_NOT_SIGNED');
  let verifiedByW47=false;
  try{
   const r=await fetchImpl('/api/v2/runtime/health',{
    method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error'
   });
   if(r?.ok){
    const h=await r.json();
    verifiedByW47=h?.ok===true&&h.trustedSession===true&&h.canSend===false;
   }
  }catch{verifiedByW47=false}
  return Object.freeze({
   nativeActive:s.nativeOsVerified&&s.nativeSessionActive,
   trustedForBrain:s.nativeOsVerified&&s.nativeSessionActive&&verifiedByW47,
   canSend:false
  });
 };
 return Object.freeze({available:true,inspect,
  async logout(){await invoke('logout_session');return inspect()}});
}

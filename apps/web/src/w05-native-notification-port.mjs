// Reuse W05's official tauri-plugin-notification 2.6.0 in the ORIGINAL
// W54 trusted current-user window. Browser localhost is never a native host.
// No new event bus, no storage, no provider/user/recipient commands.
const deny=s=>{throw Error(s)};
const validSession=s=>s?.nativeOsVerified===true&&
 s.nativeSessionActive===true&&s.canSend===false;
const allowedPermission=p=>p===true||p===false||p===null;

export function createW05NativeNotificationPort({tauri=globalThis.__TAURI__}={}){
 const invoke=tauri?.core?.invoke;
 const available=typeof invoke==='function';
 async function verify(){
  if(!available)deny('W05_NATIVE_HOST_UNAVAILABLE');
  const s=await invoke('session_status');
  if(!validSession(s))deny('W05_CURRENT_WINDOWS_PRINCIPAL_NOT_VERIFIED');
 }
 async function permission(){
  await verify();
  const granted=await invoke('plugin:notification|is_permission_granted');
  if(!allowedPermission(granted))deny('W05_NOTIFICATION_PERMISSION_UNVERIFIED');
  return granted===true?'granted':granted===false?'denied':'default';
 }
 async function askPermission(){
  await verify();
  const now=await permission();
  if(now!=='default')return now;
  const result=await invoke('plugin:notification|request_permission');
  if(result!=='granted'&&result!=='denied')deny('W05_OS_PERMISSION_RESULT_UNKNOWN');
  return permission();
 }
 async function nativeTest(){
  if(await permission()!=='granted')deny('W05_OS_PERMISSION_NOT_GRANTED');
  // Static local proof only: never put any private message/person name in a Toast.
  // Only the real installed OS app can confirm rendering after this submission.
  await invoke('plugin:notification|notify',{options:{
   title:'言策 · Windows 通知测试',
   body:'这是本机测试，不会向任何联系人发送信息。',
   silent:true,
  }});
  return Object.freeze({submitted:true,delivered:false,
   status:'OS_TOAST_SUBMITTED_NOT_DELIVERY_ACK'});
 }
 async function agnoCompleted(){
  if((await permission())!=='granted')return false;
  // The caller MUST verify an original W43 Run and saved History first.
  await invoke('plugin:notification|notify',{options:{
   title:'言策 · 闺蜜大脑',
   body:'本机 AI 任务已经完成，打开言策查看结果。',
   silent:true
  }});
  return true;
 }
 return Object.freeze({available,permission,askPermission,nativeTest,agnoCompleted});
}

export async function notifyVerifiedAgnoInBackground({
 receipt,historyVerified=false,
 hidden=globalThis.document?.visibilityState==='hidden',
 browser=globalThis.Notification,
 native=createW05NativeNotificationPort()
}={}){
 // Auth and original Agno durable receipt are checked by caller BEFORE this.
 if(!hidden||!historyVerified||!receipt||
  receipt.status!=='COMPLETED'||receipt.replayed===true||
  receipt.canSend!==false||typeof receipt.runId!=='string'||
  !/^[A-Za-z0-9_-]{6,128}$/.test(receipt.runId))return 'NO_NOTICE';
 if(native.available){
  try{return await native.agnoCompleted()?'NATIVE_SUBMITTED':'NO_PERMISSION'}
  catch{return 'NATIVE_UNAVAILABLE'}
 }
 if(typeof browser==='function'&&browser.permission==='granted'){
  try{
   new browser('言策 · 闺蜜大脑',{body:'本机 AI 任务已完成，打开言策查看结果。',
    tag:'yance-private-agno-'+receipt.runId,silent:true});
   return 'BROWSER_SUBMITTED';
  }catch{return 'BROWSER_UNAVAILABLE'}
 }
 return 'NO_PERMISSION';
}

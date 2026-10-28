/**
 * W29 Issue #77: official TDLib-only, user-initiated setup/authorization port.
 * Framework-free owner interface for W47/W46 to mount on their existing
 * SAME-ORIGIN authenticated API. Not a listener, OAuth server or sender.
 * The native host and TDLib are the only sources of QR links and auth states.
 */
import {inspectInstalledTDJson} from './native-tdjson.mjs';

const authStepFor=Object.freeze({
  authorizationStateStarting:'WAIT_TDLIB_INITIAL_STATE',
  authorizationStateWaitTdlibParameters:'CONFIGURE',
  authorizationStateWaitPhoneNumber:'CHOOSE_PHONE_OR_QR',
  authorizationStateWaitEmailAddress:'ENTER_EMAIL',
  authorizationStateWaitEmailCode:'ENTER_EMAIL_CODE',
  authorizationStateWaitCode:'ENTER_LOGIN_CODE',
  authorizationStateWaitOtherDeviceConfirmation:'SCAN_OFFICIAL_QR',
  authorizationStateWaitPassword:'ENTER_2FA_PASSWORD',
  authorizationStateWaitRegistration:'REVIEW_REGISTRATION',
  authorizationStateReady:'VERIFY_GETME_WITH_W24',
  authorizationStateLoggingOut:'LOGOUT_PENDING',
  authorizationStateClosing:'CLOSING',
  authorizationStateClosed:'WAITING_USER_AUTH',
});
const required=(truth,code)=>{if(!truth)throw Object.assign(new Error(code),{code});};
const s=(v,min,max)=>typeof v==='string' && v.length>=min && v.length<=max;
const operations=Object.freeze({
  phone:{state:'authorizationStateWaitPhoneNumber',method:'setAuthenticationPhoneNumber',
    args:data=>{
      required(s(data?.phoneNumber,5,32) && /^\+[0-9]+$/.test(data.phoneNumber),'TELEGRAM_PHONE_INVALID');
      return {phone_number:data.phoneNumber,
        settings:{'@type':'phoneNumberAuthenticationSettings',
          allow_flash_call:false,allow_missed_call:false,
          is_current_phone_number:false,allow_sms_retriever_api:false}};
    }},
  qr:{state:'authorizationStateWaitPhoneNumber',method:'requestQrCodeAuthentication',
    args:()=>({other_user_ids:[]})},
  code:{state:'authorizationStateWaitCode',method:'checkAuthenticationCode',
    args:data=>{required(s(data?.code,1,20),'TDLIB_LOGIN_CODE_REQUIRED');return {code:data.code}}},
  password:{state:'authorizationStateWaitPassword',method:'checkAuthenticationPassword',
    args:data=>{required(s(data?.password,1,2048),'TDLIB_2FA_PASSWORD_REQUIRED');return {password:data.password}}},
  email:{state:'authorizationStateWaitEmailAddress',method:'setAuthenticationEmailAddress',
    args:data=>{required(s(data?.emailAddress,3,254) && data.emailAddress.includes('@'),
      'TDLIB_EMAIL_INVALID');return {email_address:data.emailAddress}}},
  emailCode:{state:'authorizationStateWaitEmailCode',method:'checkAuthenticationEmailCode',
    args:data=>{required(s(data?.code,1,64),'TDLIB_EMAIL_CODE_REQUIRED');
      return {code:{'@type':'emailAddressAuthenticationCode',code:data.code}}}},
  register:{state:'authorizationStateWaitRegistration',method:'registerUser',
    args:data=>{required(s(data?.firstName,1,64) && (data.lastName===undefined || s(data.lastName,0,64)),
      'TDLIB_REGISTRATION_NAME_REQUIRED');
      return {first_name:data.firstName,last_name:data.lastName??'',disable_notification:false}}},
});

export function createW29TelegramAuthorizationPort({
  runtimeDir,controller,loadApprovedNativeConfig,
}={}){
  required(typeof runtimeDir==='string' && runtimeDir.length>0,'W29_NATIVE_RUNTIME_REQUIRED');
  required(controller &&
    ['status','begin','authorizeStep','readPrivateAccountState','disconnect']
      .every(k=>typeof controller[k]==='function'),'W29_ORIGINAL_NATIVE_CONTROLLER_REQUIRED');
  required(typeof loadApprovedNativeConfig==='function','W55_ORIGINAL_CUSTODY_PORT_REQUIRED');

  // This is safe for W47 GET /setup. It cannot create a TDLib client or login.
  async function setup(){
    const sdk=await inspectInstalledTDJson(runtimeDir);
    return Object.freeze({ok:true,provider:'TELEGRAM_PERSONAL',
      source:'OFFICIAL_TDLIB_JSON',version:'1.8.69',nativeDllSha256:sdk.dllSha256,
      nativeSdkInstalled:true,nextAction:'USER_CLICK_CONNECT',
      userDecisionRequired:true,actualQrReady:false,
      connected:null,accountStatus:'READ_TRUSTED_OWNER_STATUS',canSend:false,
      steps:['CONNECT','CONFIGURE','PHONE_OR_QR','CODE_OR_2FA','VERIFY_IDENTITY'],
    });
  }
  // Only the original W47 authenticated same-origin POST initiated by a
  // concrete user gesture may call this, not GET /setup or a page refresh.
  async function connect({sessionHandle,gestureId}={}){
    await inspectInstalledTDJson(runtimeDir);
    return controller.begin({sessionHandle,gestureId});
  }

  async function state({sessionHandle,gestureId}={}){
    const basic=controller.status();
    if(!basic.nativeRunning)return Object.freeze({ok:true,source:'OFFICIAL_TDLIB_JSON',
      status:'WAITING_USER_AUTH',nextAction:'USER_CLICK_CONNECT',
      accountIdentityVerified:false,platformUserIdExact:null,
      removalConfirmed:basic.removalConfirmed===true,canSend:false});
    const p=await controller.readPrivateAccountState({sessionHandle,gestureId});
    const nextAction=authStepFor[p.nativeAuthorizationState]??'TDLIB_NATIVE_STATE_UNSUPPORTED';
    return Object.freeze({ok:true,source:'OFFICIAL_TDLIB_JSON',
      status:p.accountIdentityVerified?'ONLINE_VERIFIED':
        p.logoutPending?'LOGOUT_PENDING':'WAITING_USER_AUTH',
      nativeAuthorizationState:p.nativeAuthorizationState,nextAction,
      qrLoginLink:p.qrLoginLink??null,  // ONLY real TDLib link via private W47 session
      codeInfo:p.codeInfo??null,emailCodeInfo:p.emailCodeInfo??null,
      passwordHint:p.passwordHint??null,
      platformUserIdExact:p.accountIdentityVerified?p.platformUserIdExact:null,
      accountIdentityVerified:p.accountIdentityVerified===true,
      removalConfirmed:p.removalConfirmed===true,
      canSend:false, // W25 sole Outbox is separate
    });
  }

  async function act({sessionHandle,gestureId,action,data={}}={}){
    const p=await controller.readPrivateAccountState({sessionHandle,gestureId});
    const selected=operations[action];
    if(action==='configure'){
      required(p.nativeAuthorizationState==='authorizationStateWaitTdlibParameters',
        'TDLIB_AUTH_STATE_MISMATCH');
      // W55 existing OS secret storage / caller user-entered credentials ONLY.
      // No scanning default TDLib profile, V1 credential or removed account.
      const cfg=await loadApprovedNativeConfig({sessionHandle});
      required(cfg?.freshUserApproved===true,'USER_APPROVED_TDLIB_CONFIGURATION_REQUIRED');
      required(Number.isInteger(cfg.apiId)&&cfg.apiId>0&&cfg.apiId<=2147483647&&
        s(cfg.apiHash,16,128)&&s(cfg.databaseDirectory,2,400)&&
        s(cfg.filesDirectory,2,400)&&typeof cfg.databaseEncryptionKey==='string',
        'W55_NATIVE_CONFIGURATION_INCOMPLETE');
      return controller.authorizeStep({sessionHandle,gestureId,request:{
        '@type':'setTdlibParameters',use_test_dc:false,
        database_directory:cfg.databaseDirectory,files_directory:cfg.filesDirectory,
        database_encryption_key:cfg.databaseEncryptionKey,
        use_file_database:true,use_chat_info_database:true,
        use_message_database:true,use_secret_chats:false,
        api_id:cfg.apiId,api_hash:cfg.apiHash,
        system_language_code:cfg.languageCode??'en',
        device_model:cfg.deviceModel??'Yance V2 Desktop',
        system_version:cfg.systemVersion??'Windows',
        application_version:cfg.applicationVersion??'2.0',
      }});
    }
    required(Boolean(selected),'TDLIB_ACTION_NOT_ALLOWED');
    required(p.nativeAuthorizationState===selected.state,'TDLIB_AUTH_STATE_MISMATCH');
    const args=selected.args(data);
    return controller.authorizeStep({sessionHandle,gestureId,request:{
      '@type':selected.method,...args}});
  }

  // Normal disconnect stops the private worker without impersonating a
  // provider-side logout. Explicit "Remove account" invokes REAL TDLib logOut.
  async function disconnect({sessionHandle,gestureId,removeAccount=false}={}){
    await controller.readPrivateAccountState({sessionHandle,gestureId});
    const result=await controller.disconnect({sessionHandle,gestureId,
      logout:removeAccount===true});
    return Object.freeze({ok:true,operation:removeAccount?'TDLIB_LOGOUT_REQUESTED':
      'TDLIB_LOCAL_DISCONNECT_REQUESTED',nativeState:result.nativeAuthorizationState,
      removalConfirmed:result.removalConfirmed===true,canSend:false});
  }

  return Object.freeze({setup,connect,state,act,disconnect});
}

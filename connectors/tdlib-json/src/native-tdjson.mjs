/** W29 official TDLib JSON native-host glue. No Telegram protocol or second sender. */
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {readFile, stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createInterface} from 'node:readline';

export const TD_SOURCE = Object.freeze({
  upstream: 'https://github.com/tdlib/td.git',
  commit: 'ea3f69ce11aef458bfbb09869b809ede4447486f',
  version: '1.8.69',
  license: 'BSL-1.0',
  licenseSha256: 'beb8e42e9d6b4284e03304d05a81a0755200a965fc8d0a5e0aea1e84cf805d6e',
});
export class TDHold extends Error {
  constructor(code) { super(code); this.name='TDHold'; this.code=code; }
}
const ensure=(yes,code)=>{if(!yes)throw new TDHold(code);};
const sha=x=>createHash('sha256').update(x).digest('hex');
const isSha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);

/** Hashes are regenerated only from a reproducible real native binary build. */
export async function inspectInstalledTDJson(runtimeDir) {
  ensure(process.platform==='win32','NATIVE_WINDOWS_ONLY');
  const root=resolve(runtimeDir);
  let manifest;
  try { manifest=JSON.parse(await readFile(join(root,'tdjson-native-manifest.json'),'utf8')); }
  catch {throw new TDHold('NATIVE_MANIFEST_NOT_INSTALLED');}
  ensure(manifest?.sourceCommit===TD_SOURCE.commit
    && manifest?.sourceVersion===TD_SOURCE.version
    && manifest?.license===TD_SOURCE.license
    && manifest?.licenseSha256===TD_SOURCE.licenseSha256
    && manifest?.architecture==='x64','NATIVE_UPSTREAM_PIN_MISMATCH');
  const expected={ 'tdjson.dll':manifest.dllSha256,'TDJsonHost.exe':manifest.hostSha256 };
  for(const dep of manifest.dependencies ?? []){
    ensure(['libcrypto-3-x64.dll','libssl-3-x64.dll','z.dll','zlib1.dll'].includes(dep.name)
      && isSha(dep.sha256),'NATIVE_DEPENDENCY_MANIFEST_INVALID');
    expected[dep.name]=dep.sha256;
  }
  for(const [filename,digest] of Object.entries(expected)){
    ensure(isSha(digest),'NATIVE_MANIFEST_INVALID');
    const file=join(root,filename),s=await stat(file).catch(()=>null);
    ensure(s?.isFile()&&s.size>0,'NATIVE_BINARY_MISSING');
    ensure(sha(await readFile(file))===digest,'NATIVE_SHA256_MISMATCH');
  }
  return Object.freeze({installed:true,sourceCommit:TD_SOURCE.commit,
    dllSha256:manifest.dllSha256,hostSha256:manifest.hostSha256,
    hostExecutable:join(root,'TDJsonHost.exe'),license:TD_SOURCE.license});
}
const runHost=(exe,mode)=>spawn(exe,[mode],{cwd:resolve(exe,'..'),shell:false,
  windowsHide:true,stdio:['pipe','pipe','pipe']});

/** Real offline native td_execute call. Does NOT initialize an account/session. */
export async function probeTDJson(runtimeDir){
  const files=await inspectInstalledTDJson(runtimeDir);
  return new Promise((ok,no)=>{
    const child=runHost(files.hostExecutable,'--probe');
    let latest='';
    createInterface({input:child.stdout}).on('line',line=>{latest=line;});
    child.once('error',()=>no(new TDHold('TDJSON_PROCESS_START_FAILED')));
    child.once('close',code=>{
      let x;try{x=JSON.parse(latest);}catch{}
      if(code!==0||x?.kind!=='native_tdjson_probe'||x.loaded!==true)
        return no(new TDHold('TDJSON_REAL_ABI_PROBE_FAILED'));
      ok(Object.freeze({nativeLoaded:true,officialAbi:x.officialAbi,
        dllSha256:files.dllSha256,sourceCommit:files.sourceCommit,
        nativeHostPid:child.pid,nativeHostExitCode:code,
        authorized:false,connectedAccounts:0,canSend:false}));
    });
  });
}

/** Actual native TDLib authorization-state readiness with NO credentials/login. */
export async function probeTDJsonAuthorizationState(runtimeDir){
  const files=await inspectInstalledTDJson(runtimeDir);
  return new Promise((ok,no)=>{
    const child=runHost(files.hostExecutable,'--probe-state');
    let observed=null;
    createInterface({input:child.stdout}).on('line',line=>{
      try { const v=JSON.parse(line); if(v.kind==='native_tdjson_auth_probe') observed=v; }catch{}
    });
    child.once('error',()=>no(new TDHold('TDJSON_AUTH_PROBE_SPAWN_FAILED')));
    child.once('close',code=>{
      if(code!==0 || observed?.loaded!==true ||
        observed?.state!=='authorizationStateWaitTdlibParameters' ||
        observed?.authorized!==false || observed?.credentialsSupplied!==false ||
        observed?.accountConnected!==false)
        return no(new TDHold('TDJSON_AUTH_STATE_NOT_VERIFIED'));
      ok(Object.freeze({officialNativeState:observed.state,
        clientId:observed.client_id,processPid:child.pid,
        realLibrarySha256:files.dllSha256,sourceCommit:files.sourceCommit,
        waitingUserAuth:true,connected:false,canSend:false}));
    });
  });
}

/**
 * Every trust function is injected from original W54/W47/W24 native owners,
 * never derived from a browser-supplied principal or claimed identity.
 * No public provider sendMessage path exists; W25 retains the sole sender.
 */
export function nativeTDJsonController({
  runtimeDir, attestUserGesture, attestReadSession, findAuthorizedAccount,
  verifyCurrentPeerK, onAuthorizedInbound,
  verifyW25Receipt, onW25Receipt, onNativeAccountIdentity, onTrustedChatIndex,
  onNativeAccountRevoked=null,
}={}){
  for(const fn of [attestUserGesture,attestReadSession,findAuthorizedAccount,verifyCurrentPeerK,onAuthorizedInbound,
                   verifyW25Receipt,onW25Receipt,onNativeAccountIdentity,onTrustedChatIndex])
    ensure(typeof fn==='function','ORIGINAL_OWNER_AUTH_PORT_MISSING');
  let proc=null,account=null,authorized=false,identityVerified=false,clientId=null;
  let authState='authorizationStateClosed', authDetails=null, exactSelfUserId=null;
  let logoutPending=false,removalConfirmed=false;
  const nativeMeRequests=new Set();
  const readRequests=new Map();
  const failPendingReads=code=>{
    for(const item of readRequests.values()){
      clearTimeout(item.timer);
      item.reject(new TDHold(code));
    }
    readRequests.clear();
  };
  const errors=[],pending=new Set();
  const status=()=>Object.freeze({
    nativeRunning:proc!==null,telegramAuthorized:authorized,
    channelAccountBound:identityVerified,clientId,canSend:false,
    stage:!proc?'WAITING_USER_AUTH':logoutPending?'LOGOUT_PENDING':
      !authorized?'AUTH_IN_PROGRESS':
      identityVerified?'READ_ONLY_READY':'GETME_OWNER_PROOF_PENDING',
    nativeAuthorizationState:proc?authState:'authorizationStateClosed',
    logoutPending,removalConfirmed,accountIdentityVerified:identityVerified,
  });
  const verifyGesture=async input=>{
    const proof=await attestUserGesture(input);
    ensure(proof?.approved===true&&proof?.userInitiated===true
      &&proof?.provider==='TELEGRAM_PERSONAL'
      &&Number.isSafeInteger(proof.expiresAt)&&proof.expiresAt>Date.now(),
      'WAITING_USER_AUTH');
    return proof;
  };

  async function begin({sessionHandle,gestureId}={}){
    ensure(proc===null,'WORKER_ALREADY_RUNNING');
    const proof=await verifyGesture({sessionHandle,gestureId});
    const owner=await findAuthorizedAccount(proof);
    ensure(owner?.channel==='TELEGRAM_PERSONAL'&&
      owner?.authorizedForLogin===true&&owner?.channelAccountId&&owner?.credentialRef,
      'CHANNEL_ACCOUNT_PROOF_MISSING');
    const files=await inspectInstalledTDJson(runtimeDir);
    const worker=runHost(files.hostExecutable,'--worker');
    proc=worker; account=Object.freeze(owner); authorized=false; identityVerified=false;
    exactSelfUserId=null; authDetails=null;authState='authorizationStateStarting';
    logoutPending=false;removalConfirmed=false;
    worker.once('error',()=>{failPendingReads('NATIVE_WORKER_EXIT');errors.push('WORKER_SPAWN_FAILED');proc=null;account=null;identityVerified=false;authDetails=null;exactSelfUserId=null;});
    worker.once('close',()=>{failPendingReads('NATIVE_WORKER_EXIT');proc=null;account=null;authorized=false;identityVerified=false;clientId=null;
      authState='authorizationStateClosed';authDetails=null;exactSelfUserId=null;logoutPending=false;});
    worker.stderr.on('data',()=>errors.push('NATIVE_STDERR_REDACTED'));
    createInterface({input:worker.stdout,crlfDelay:Infinity}).on('line',line=>{
      let packet;try{packet=JSON.parse(line);}catch{errors.push('INVALID_NATIVE_RESPONSE');return;}
      if(packet.kind==='native_tdjson_worker_started'){clientId=packet.client_id;return;}
      if(packet.kind==='tdlib_auth_state'){
        authState=packet.state;
        // This state is directly from the real TDLib updateAuthorizationState,
        // NOT a synthetic URL, QR payload, or renderer-supplied account flag.
        authDetails=packet.details && packet.details['@type']===authState?
          packet.details:null;
        authorized=authState==='authorizationStateReady';
        if(!authorized){
          failPendingReads('TDLIB_AUTH_REVOKED');
          identityVerified=false;exactSelfUserId=null;
        }
        if(authState==='authorizationStateClosed'){
          const confirmedByNative=logoutPending;
          logoutPending=false;
          if(confirmedByNative && typeof onNativeAccountRevoked==='function'){
            // Only existing W24/W55 Owner can attest persisted revocation.
            Promise.resolve(onNativeAccountRevoked({
              channel:'TELEGRAM_PERSONAL',channelAccountId:account?.channelAccountId,
              platformUserIdExact:identityVerified?exactSelfUserId:null,
            })).then(v=>{removalConfirmed=v?.revoked===true;})
              .catch(()=>errors.push('PERSISTED_ACCOUNT_REVOKE_NOT_CONFIRMED'));
          }
        }
        if(authorized){
          const extra='w29-me-'+randomUUID();
          nativeMeRequests.add(extra);
          // Official getMe is read-only, does not send a Telegram message.
          worker.stdin.write(JSON.stringify({action:'tdlib',
            query:{'@type':'getMe','@extra':extra}})+'\n');
        }
        return;
      }
      if(packet.kind!=='tdlib_update'||!authorized||!account)return;
      const kind=packet.data?.['@type'];
      const requestExtra=packet.data?.['@extra'];
      // A TDLib @extra belongs to one native read; other unsolicited updates
      // continue through original W24/W25 handlers below.
      const reading=typeof requestExtra==='string'?readRequests.get(requestExtra):null;
      if(reading){
        readRequests.delete(requestExtra);
        clearTimeout(reading.timer);
        if(kind==='error')reading.reject(new TDHold('OFFICIAL_TDLIB_READ_ERROR'));
        else reading.resolve(packet.data);
        return;
      }
      if(kind==='user' && nativeMeRequests.has(requestExtra)){
        nativeMeRequests.delete(requestExtra);
        const task=(async()=>{
          const id=packet.data.id;
          ensure((typeof id==='number'&&Number.isSafeInteger(id)) ||
            (typeof id==='string'&&/^[0-9]+$/.test(id)),
            'NATIVE_PROVIDER_USER_ID_NOT_EXACT');
          const attested=await onNativeAccountIdentity({account,clientId,
            platformUserIdExact:String(id),source:'OFFICIAL_TDLIB_GET_ME'});
          ensure(attested?.verified === true,'NATIVE_GETME_OWNER_ATTESTATION_HOLD');
          exactSelfUserId=String(id);
          identityVerified=true;
        })();pending.add(task);
        task.catch(()=>errors.push('TRUSTED_GETME_BINDING_FAILED'))
          .finally(()=>pending.delete(task));
        return;
      }
      // Provider chat/contact enumeration is handed to W24 owner only, not
      // shown as verified peers before the account/Peer membership proof.
      const indexKinds=new Set(['chats','chat','users','updateNewChat','updateChatLastMessage']);
      if(indexKinds.has(kind)){
        if(!identityVerified)return;
        const task=onTrustedChatIndex({account,clientId,
          rawNativeEvent:packet.data,source:'OFFICIAL_TDLIB_JSON'});
        pending.add(task);
        Promise.resolve(task).catch(()=>errors.push('TRUSTED_CHAT_INDEX_REJECTED'))
          .finally(()=>pending.delete(task));
        return;
      }
      const receipts=new Set(['updateMessageSendAcknowledged',
        'updateMessageSendSucceeded','updateMessageSendFailed']);
      if(receipts.has(kind) || ((kind==='message'||kind==='error') && requestExtra)){
        if(!identityVerified)return;
        const task=(async()=>{
          const binding=await verifyW25Receipt({account,clientId,
            nativeUpdate:packet.data});
          ensure(binding?.verified===true && binding?.k?.channel==='TELEGRAM_PERSONAL' &&
            binding?.k?.account===account.channelAccountId,
            'UNMATCHED_OR_STALE_NATIVE_RECEIPT');
          await onW25Receipt({k:binding.k,attemptId:binding.attemptId,
            nativeUpdate:packet.data,source:'OFFICIAL_TDLIB_JSON'});
        })();pending.add(task);
        task.catch(e=>errors.push(e instanceof TDHold?e.code:'W25_RECEIPT_REJECTED'))
          .finally(()=>pending.delete(task));
        return;
      }
      if(kind!=='updateNewMessage'||!identityVerified)return;
      const m=packet.data.message;
      if(!m||m.is_outgoing!==false)return;
      const task=(async()=>{
        // W24 must verify stable account->peer mapping and epochs per update.
        const binding=await verifyCurrentPeerK({account,clientId,
          chatId:m.chat_id,providerMessageId:m.id});
        ensure(binding?.current===true&&binding?.k?.channel==='TELEGRAM_PERSONAL'
          &&binding?.k?.account===account.channelAccountId,
          'TRUSTED_PEER_BINDING_REQUIRED');
        await onAuthorizedInbound({k:binding.k,provider:'TDLIB_JSON',
          realProvider:true,originalTdUpdate:packet.data});
      })();
      pending.add(task);
      task.catch(e=>errors.push(e instanceof TDHold?e.code:'PRIVATE_INBOUND_REJECTED'))
        .finally(()=>pending.delete(task));
    });
    ensure(worker.pid!=null,'WORKER_START_FAILED');
    return status();
  }

  async function authorizeStep({sessionHandle,gestureId,request}={}){
    ensure(proc!==null&&account,'NO_RUNNING_TRUSTED_TDLIB_SESSION');
    const proof=await verifyGesture({sessionHandle,gestureId});
    ensure(request&&typeof request==='object'&&!Array.isArray(request),'INVALID_TDLIB_QUERY');
    const allowed=new Set(['getOption','setTdlibParameters','checkDatabaseEncryptionKey',
      'setAuthenticationPhoneNumber','setAuthenticationEmailAddress',
      'checkAuthenticationEmailCode','checkAuthenticationCode','checkAuthenticationPassword',
      'requestQrCodeAuthentication','registerUser','logOut','close','getMe',
      'getContacts','getChats','loadChats','getChat','getChatHistory','getUser','getUserFullInfo']);
    ensure(allowed.has(request['@type']),'NATIVE_METHOD_NOT_APPROVED');
    if(request['@type']==='setTdlibParameters'){
      ensure(proof.canConfigureNativeDb===true &&
        request.database_directory===account.databaseDirectory &&
        request.files_directory===account.filesDirectory &&
        Number.isSafeInteger(request.api_id)&&
        typeof request.api_hash==='string'&&request.api_hash.length>=16,
        'PROTECTED_TDLIB_SESSION_PARAMETERS_REQUIRED');
    }
    if(['getMe','getContacts','getChats','loadChats','getChat','getChatHistory','getUser','getUserFullInfo']
       .includes(request['@type'])) ensure(authorized,'WAITING_USER_AUTH');
    const nativeQuery={...request};
    if(request['@type']==='getMe'){
      nativeQuery['@extra']='w29-me-'+randomUUID();
      nativeMeRequests.add(nativeQuery['@extra']);
    }
    const writable=proc.stdin.write(JSON.stringify({action:'tdlib',query:nativeQuery})+'\n');
    return {nativeCommandAccepted:true,backpressure:!writable,
      providerAck:false,canSend:false}; // td_send is async; never claim delivery
  }

  async function requestRead({sessionHandle,query,timeoutMs=15000}={}){
    ensure(proc!==null && account && authorized && identityVerified &&
      !logoutPending, 'WAITING_USER_AUTH');
    const owner=account, selfId=exactSelfUserId;
    const session=await attestReadSession({sessionHandle});
    ensure(session?.verified===true && session?.channel==='TELEGRAM_PERSONAL' &&
      session?.channelAccountId===owner.channelAccountId,
      'TRUSTED_PROVIDER_READ_SESSION_REQUIRED');
    ensure(query && typeof query==='object' && !Array.isArray(query),
      'TDLIB_READ_QUERY_REQUIRED');
    const allowed=new Set(['getChats','loadChats','getContacts','getChat',
      'getUser','getUserFullInfo','getChatHistory','getMessage',
      'getUserProfilePhotos','getFile','downloadFile']);
    ensure(allowed.has(query['@type']), 'TDLIB_READ_ONLY_METHOD_REQUIRED');
    ensure(Number.isInteger(timeoutMs) && timeoutMs>=1000 && timeoutMs<=30000,
      'TDLIB_READ_TIMEOUT_INVALID');
    const extra='w29-read-'+randomUUID();
    const request={...query,'@extra':extra};
    const reading=new Promise((resolveRead,rejectRead)=>{
      const timer=setTimeout(()=>{
        readRequests.delete(extra);
        rejectRead(new TDHold('TDLIB_READ_TIMEOUT'));
      },timeoutMs);
      readRequests.set(extra,{resolve:resolveRead,reject:rejectRead,timer});
    });
    try {
      proc.stdin.write(JSON.stringify({action:'tdlib',query:request})+'\n');
    } catch {
      const item=readRequests.get(extra);
      if(item){
        readRequests.delete(extra);clearTimeout(item.timer);
        item.reject(new TDHold('TDLIB_NATIVE_IPC_WRITE_FAILED'));
      }
    }
    const result=await reading;
    // A read can finish after logout/identity or session revision changed.
    const stillCurrent=await attestReadSession({sessionHandle});
    ensure(proc!==null && account===owner && authorized && identityVerified &&
      !logoutPending && exactSelfUserId===selfId &&
      stillCurrent?.verified===true &&
      stillCurrent?.channelAccountId===owner.channelAccountId &&
      stillCurrent?.channel==='TELEGRAM_PERSONAL',
      'TDLIB_READ_AUTH_REVOKED_AFTER_RESPONSE');
    return result;
  }

  async function disconnect({sessionHandle,gestureId,logout=false}={}){
    if(!proc)return status();
    if(logout){
      logoutPending=true;
      try{await authorizeStep({sessionHandle,gestureId,request:{'@type':'logOut'}});}
      catch(e){logoutPending=false;throw e;}
    } else proc.stdin.write(JSON.stringify({action:'stop'})+'\n');
    return status(); // Native closed state, not merely queued logout, confirms revoke.
  }
  // W47 may expose this only through its already-authenticated same-user
  // session endpoint. Never leak fresh TDLib QR link on public GET /setup.
  async function readPrivateAccountState({sessionHandle,gestureId}={}){
    ensure(proc!==null && account,'NO_RUNNING_TRUSTED_TDLIB_SESSION');
    const current=await attestReadSession({sessionHandle});
    ensure(current?.verified===true &&
      current?.channelAccountId===account.channelAccountId &&
      current?.channel==='TELEGRAM_PERSONAL','TRUSTED_PROVIDER_READ_SESSION_REQUIRED');
    const result=status();
    return Object.freeze({...result,
      platformUserIdExact:identityVerified?exactSelfUserId:null,
      channelAccountId:account.channelAccountId,
      // This login link is obtained exclusively from official TDLib update.
      qrLoginLink:authState==='authorizationStateWaitOtherDeviceConfirmation'?
        (authDetails?.link??null):null,
      codeInfo:authState==='authorizationStateWaitCode'?
        (authDetails?.code_info??null):null,
      emailCodeInfo:authState==='authorizationStateWaitEmailCode'?
        (authDetails?.code_info??null):null,
      passwordHint:authState==='authorizationStateWaitPassword'?
        (authDetails?.password_hint??null):null,
      // Read this on W47's private, non-cached response, never log/copy to disk.
      requiresUserAction:!authorized || !identityVerified,
      canSend:false,
    });
  }
  return Object.freeze({status,begin,authorizeStep,disconnect,requestRead,
    readPrivateAccountState,errors:()=>[...errors]});
}

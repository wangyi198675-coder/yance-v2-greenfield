// W47/W54 minimal local-first OS-user handoff, carried only through the
// original W54-owned Node child stdin. A localhost HTTP caller cannot mint
// this source or read the one-time HttpOnly cookie from child stdout.
// This is not a login service, new user profile store or sender authorization.
import {readFileSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {randomBytes} from 'node:crypto';

const opaque=s=>typeof s==='string'&&s.length>=8&&s.length<=256&&/^[a-zA-Z0-9_-]+$/.test(s);
export function parseW54LocalBoot(raw,{installed=false}={}){
 if(!installed||!raw||raw.length>3200)throw Error('W54_LOCAL_NATIVE_BOOT_MISSING');
 let x;
 try{x=JSON.parse(raw)}catch{throw Error('W54_LOCAL_NATIVE_BOOT_JSON_INVALID')}
 const expected=['appLocalDataRoot','installationRef','nativeRevocationGeneration',
    'principalRef','sessionRevision','source','version'];
 if(!x||typeof x!=='object'||Array.isArray(x)||
   ![expected.join('|'),[...expected,'localModel'].sort().join('|')]
      .includes(Object.keys(x).sort().join('|'))||
   x.version!==1||x.source!=='W54_NATIVE_CURRENT_USER'||
   !opaque(x.principalRef)||!opaque(x.installationRef)||
   !Number.isSafeInteger(x.sessionRevision)||x.sessionRevision<1||
   !Number.isSafeInteger(x.nativeRevocationGeneration)||x.nativeRevocationGeneration<1||
   typeof x.appLocalDataRoot!=='string'||x.appLocalDataRoot.length>1024||
   !/^[A-Za-z]:\\/.test(x.appLocalDataRoot)||!isAbsolute(x.appLocalDataRoot)||
   x.appLocalDataRoot.includes('..')||/[\x00-\x1f]/.test(x.appLocalDataRoot))
   throw Error('W54_LOCAL_NATIVE_BOOT_INVALID');
 const local=x.localModel;
 if(local!==undefined&&(!local||typeof local!=='object'||Array.isArray(local)||
    Object.keys(local).sort().join('|')!=='backend|modelId|selectionEpoch'||
    local.backend!=='llamacpp'||local.modelId!=='qwen3:8b'||
    !Number.isSafeInteger(local.selectionEpoch)||local.selectionEpoch<1))
  throw Error('W54_NATIVE_LOCAL_MODEL_SELECTION_INVALID');
 return Object.freeze({
   source:'W54_NATIVE_CURRENT_USER',verified:true,
   principalRef:x.principalRef,installationRef:x.installationRef,
   appLocalDataRoot:x.appLocalDataRoot,
   modelBackend:local?'llamacpp':'unconfigured',
   modelId:local?'qwen3:8b':'',
   modelSelectionEpoch:local?local.selectionEpoch:0,
   modelUserSelected:!!local,extraChargeApproved:false,
   protectedCredentialAttested:false,
   nativeRevocationGeneration:x.nativeRevocationGeneration
 });
}
export function readW54LocalBoot(env=process.env){
 if(env.YANCE_W47_W54_LOCAL_BOOT!=='1')return null;
 if(env.YANCE_W47_RUNTIME_MODE!=='installed')
  throw Error('W54_NATIVE_BOOT_INSTALLED_ONLY');
 const bytes=readFileSync(0);
 if(bytes.length>3200)throw Error('W54_BOOT_FRAME_TOO_LARGE');
 return parseW54LocalBoot(bytes.toString('utf8'),{installed:true});
}
export function createNativeStartupSession({authority,boot}={}){
 if(!boot)return null;
 if(!authority?.issueNativeWebView)throw Error('W47_NATIVE_SESSION_PORT_MISSING');
 const binding=randomBytes(32).toString('hex');
 const minted=authority.issueNativeWebView(binding);
 if(typeof minted.cookie!=='string'||!minted.cookie.startsWith('yance_local_session='))
  throw Error('W47_NATIVE_SESSION_COOKIE_INVALID');
 return Object.freeze({
  privateCookie:minted.cookie,
  // Do not send the cookie in any HTTP response or normal structured API.
  binding,
  principal:boot
 });
}

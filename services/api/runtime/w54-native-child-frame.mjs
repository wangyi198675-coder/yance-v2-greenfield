// W47 read/validate W54's original private inherited pipe BOOTSTRAP only.
// Must NOT issue an HTTP Session, model quota or platform consent. W54's
// nonce/challenge ACK is NOT OS parent attestation. No auto-login until an
// independently signed native process attester and WebView cookie binding.
const PROTOCOL='W54_W47_NATIVE_CHILD_V1';
const keys=['appLocalDataRoot','challenge','installationRef','nativeRevocationGeneration',
 'nativeSessionRef','nativeSessionRevision','principalRef','protocol'].sort();
const opaque=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{12,130}$/.test(v);
export function decodeW54NativeChildFrame(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<6||bytes.length>4100)throw Error('NATIVE_CHILD_FRAME_LENGTH_INVALID');
 const declared=bytes.readUInt32BE(0);
 if(declared<2||declared>4096||declared!==bytes.length-4)
  throw Error('NATIVE_CHILD_FRAME_LENGTH_INVALID');
 const body=bytes.subarray(4);
 if(!Buffer.from(body.toString('utf8'),'utf8').equals(body))throw Error('NATIVE_CHILD_UTF8_INVALID');
 let f;try{f=JSON.parse(body.toString('utf8'))}catch{throw Error('NATIVE_CHILD_JSON_INVALID')}
 if(!f||Array.isArray(f)||typeof f!=='object'||Object.keys(f).sort().join('|')!==keys.join('|'))
  throw Error('NATIVE_CHILD_FIELDS_INVALID');
 if(f.protocol!==PROTOCOL||typeof f.challenge!=='string'||!/^[a-f0-9]{64}$/.test(f.challenge)||
   !opaque(f.principalRef)||!opaque(f.installationRef)||!opaque(f.nativeSessionRef)||
   !Number.isSafeInteger(f.nativeSessionRevision)||f.nativeSessionRevision<0||
   !Number.isSafeInteger(f.nativeRevocationGeneration)||f.nativeRevocationGeneration<=0||
   typeof f.appLocalDataRoot!=='string'||f.appLocalDataRoot.length>1024||
   !/^[A-Za-z]:\\/.test(f.appLocalDataRoot)||f.appLocalDataRoot.includes('..')||
   /[\x00-\x1f]/.test(f.appLocalDataRoot))
  throw Error('NATIVE_CHILD_VALUE_INVALID');
 // Strings here are inputs for an ORIGINAL W54 OS-bound verifier, not trust.
 return Object.freeze({...f});
}
export function encodeW54NativeChildAck(frame){
 if(!frame||frame.protocol!==PROTOCOL||!/^[a-f0-9]{64}$/.test(frame.challenge||''))
  throw Error('NATIVE_CHILD_ACK_NOT_VERIFIED');
 const json=Buffer.from(JSON.stringify({protocol:PROTOCOL,status:'CHILD_READY',
  challenge:frame.challenge}),'utf8');
 if(json.length>512)throw Error('NATIVE_CHILD_ACK_TOO_LARGE');
 const length=Buffer.allocUnsafe(4);length.writeUInt32BE(json.length,0);
 return Buffer.concat([length,json]);
}
export function createVerifiedW54NativeChildBootstrap({verifyActualParent}={}){
 if(typeof verifyActualParent!=='function')
  throw Error('W54_OS_AUTHENTICATED_PARENT_VERIFIER_NOT_CONNECTED');
 return Object.freeze({
  // The callback MUST be the reviewed current-OS/native-host process/codesign
  // validator bound to inherited pipe and live W54 generation. A JS-supplied
  // parent PID, copied AppData JSON or echoed nonce is NEVER valid proof.
  accept:async({frameBytes,privatePipeBinding})=>{
   const frame=decodeW54NativeChildFrame(frameBytes);
   const verified=await verifyActualParent({frame,privatePipeBinding});
   if(verified!==true)throw Error('W54_NATIVE_PARENT_ATTESTATION_FAILED');
   // This ACK only confirms child receives the native frame. It creates
   // NO local Session and cannot authorize the generic localhost browser.
   return encodeW54NativeChildAck(frame);
  }
 });
}

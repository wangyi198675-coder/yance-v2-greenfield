import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createVerifiedW54NativeChildBootstrap,decodeW54NativeChildFrame,
 encodeW54NativeChildAck} from './w54-native-child-frame.mjs';
function fakeNative(){
 return {protocol:'W54_W47_NATIVE_CHILD_V1',challenge:randomBytes(32).toString('hex'),
  principalRef:'w54u_'+randomBytes(32).toString('hex'),
  installationRef:'w54i_'+randomBytes(32).toString('hex'),
  nativeSessionRef:'native_session_reference_1234',
  nativeSessionRevision:1,nativeRevocationGeneration:2,
  appLocalDataRoot:'C:\\Users\\TEST_ONLY_USER\\AppData\\Local\\YanceV2\\data'};
}
function pack(f){
 const raw=Buffer.from(JSON.stringify(f),'utf8');
 const hdr=Buffer.alloc(4);hdr.writeUInt32BE(raw.length);
 return Buffer.concat([hdr,raw]);
}
test('W54 private frame is parseable but NEVER an authentication proof without original signed OS-parent verifier',()=>{
 const frame=fakeNative();
 assert.deepEqual(decodeW54NativeChildFrame(pack(frame)),frame);
 assert.throws(()=>createVerifiedW54NativeChildBootstrap(),/W54_OS_AUTHENTICATED_PARENT_VERIFIER_NOT_CONNECTED/);
});
test('TEST-ONLY native verifier can acknowledge exact private binary frame without minting any local cookie or grant',async()=>{
 const frame=fakeNative(),payload=pack(frame);
 const gate=createVerifiedW54NativeChildBootstrap({verifyActualParent:async({frame:f})=>
  f.challenge===frame.challenge&&f.nativeRevocationGeneration===2});
 const ack=await gate.accept({frameBytes:payload,privatePipeBinding:{testOnly:true}});
 const n=ack.readUInt32BE(0);
 const response=JSON.parse(ack.subarray(4,4+n).toString('utf8'));
 assert.equal(ack.length,n+4);
 assert.deepEqual(response,{protocol:frame.protocol,status:'CHILD_READY',challenge:frame.challenge});
 assert.equal('cookie' in response,false);
 assert.equal('canSend' in response,false);
 assert.equal('apiKey' in response,false);
 assert.ok(encodeW54NativeChildAck(frame).equals(ack));
});
test('copied profile and correctly echoed challenge from arbitrary parent are DENIED',async()=>{
 const f=fakeNative(),bytes=pack(f);
 const gate=createVerifiedW54NativeChildBootstrap({verifyActualParent:async()=>false});
 await assert.rejects(()=>gate.accept({frameBytes:bytes,privatePipeBinding:null}),
  /W54_NATIVE_PARENT_ATTESTATION_FAILED/);
});
test('reject W54 framing and browser/secret payload injection before any native parent callback',async()=>{
 let checked=0;
 const gate=createVerifiedW54NativeChildBootstrap({verifyActualParent:async()=>{checked++;return true}});
 const original=fakeNative(),frame=pack(original);
 for(const malformed of [
  frame.subarray(0,frame.length-1),
  Buffer.concat([frame,Buffer.from('A')]),
  pack({...original,protocol:'FAKE_BROWSER_AUTH'}),
  pack({...original,challenge:'forged'}),
  pack({...original,apiKey:'sk-FORBIDDEN-TEST'}),
  pack({...original,nativeSessionRevision:-1}),
  pack({...original,appLocalDataRoot:'../../FAKE_DB'}),
  pack({...original,nativeRevocationGeneration:'2'}),
  pack({...original,principalRef:''}),
  pack({...original,appLocalDataRoot:'C:\\TEST\\..\\FORGED'})
 ]){
  await assert.rejects(()=>gate.accept({frameBytes:malformed,privatePipeBinding:null}));
 }
 assert.equal(checked,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalSessionAuthority} from './local-session.mjs';
import {createW47WhatsAppCurrentSessionPort} from './w47-whatsapp-current-session.mjs';
const origin='http://127.0.0.1:44751';
const nativeBoot={source:'W54_NATIVE_CURRENT_USER',verified:true,
 principalRef:'W54_Current_User',installationRef:'W54_Current_Installation',
 nativeRevocationGeneration:1};
function setup(){
 const authority=createLocalSessionAuthority();
 const binding='a'.repeat(64);
 const minted=authority.issueNativeWebView(binding);
 const nativeSession={binding};
 const port=createW47WhatsAppCurrentSessionPort({
  sessionAuthority:authority,nativeBoot,nativeSession,webOrigin:origin});
 const request=({method='GET',cookie=minted.cookie.split(';')[0],csrf,
  remoteOrigin=origin,site='same-origin'}={})=>({method,headers:{
  cookie,origin:remoteOrigin,'sec-fetch-site':site,
  ...(csrf?{'x-yance-csrf':csrf}:{})
 }});
 return {authority,minted,port,request};
}
test('W47 uses original current signed W54 session without a second login or fake platform account',async()=>{
 const {port,request}=setup();
 const issued=await port.resolveSignedNativeSession({request:request(),
  operation:'READ_WHATSAPP_STATUS'});
 const approved=await port.verifyNativeSession({nativeSession:issued.nativeSession,
  operation:'READ_WHATSAPP_STATUS'});
 assert.equal(approved.kind,'NATIVE_FIRST_PARTY');
 assert.equal(approved.principalRef,nativeBoot.principalRef);
 assert.equal(approved.revocationGeneration,1);
 assert.equal(issued.csrfVerified,true);
});
test('W47 requires actual session cookie, correct Origin, same-site and POST CSRF',async()=>{
 const {port,minted,request}=setup();
 for(const opts of [
   {cookie:''},{remoteOrigin:'https://evil.invalid'},
   {site:'cross-site'},{method:'POST'},
   {method:'POST',csrf:'b'.repeat(64)}
 ]){
  await assert.rejects(port.resolveSignedNativeSession({request:request(opts),
    operation:'PAIR_OWN_ACCOUNT'}),/W54_/);
 }
 const req=request({method:'POST',csrf:minted.csrf});
 const x=await port.resolveSignedNativeSession({request:req,operation:'PAIR_OWN_ACCOUNT'});
 const y=await port.verifyNativeSession({nativeSession:x.nativeSession,
  operation:'PAIR_OWN_ACCOUNT'});
 assert.equal(y.verified,true);
});
test('W47 existing revoked session cannot read status or QR, even after issued',async()=>{
 const {authority,port,request}=setup();
 const req=request();
 const issued=await port.resolveSignedNativeSession({request:req,
  operation:'READ_WHATSAPP_QR'});
 authority.revokeAll();
 await assert.rejects(port.verifyNativeSession({nativeSession:issued.nativeSession,
  operation:'READ_WHATSAPP_QR'}),/W54_/);
 await assert.rejects(port.resolveSignedNativeSession({request:req,
  operation:'READ_WHATSAPP_STATUS'}),/W54_/);
});
test('uninstalled W54 native boot cannot activate social provider from browser local cookie',()=>{
 const a=createLocalSessionAuthority();
 assert.equal(createW47WhatsAppCurrentSessionPort({sessionAuthority:a,
  nativeBoot:null,nativeSession:null,webOrigin:origin}),null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkedStatus,validPairingCode,safeSessionError} from '../src/local-session-ui-contract.mjs';
const csrf='a'.repeat(64),pair='b'.repeat(64),now=1_800_000_000_000;
const ok={ok:true,paired:true,csrfToken:csrf,expiresAt:now+300000,
 canSend:false,providerAuthorized:false};
test('real W47 paired response shape yields local session, never provider or send entitlement',()=>{
 const x=checkedStatus(ok,{now});
 assert.deepEqual(x,{available:true,paired:true,expiresAt:now+300000,csrfToken:csrf});
 assert.ok(Object.isFrozen(x));
});
test('real W47 logged-out/unpaired response gives no token',()=>{
 assert.deepEqual(checkedStatus({ok:true,paired:false,canSend:false,providerAuthorized:false},{now}),
  {available:true,paired:false,expiresAt:null,csrfToken:''});
});
test('forged success missing CSRF cannot display verified',()=>{
 assert.throws(()=>checkedStatus({...ok,csrfToken:undefined},{now}),/LOCAL_SESSION_INCOMPLETE/);
});
test('forged success with malformed CSRF cannot display verified',()=>{
 for(const token of ['0'.repeat(63),'G'.repeat(64),'../token',''])
  assert.throws(()=>checkedStatus({...ok,csrfToken:token},{now}),/LOCAL_SESSION_INCOMPLETE/);
});
test('forged success without expiry or with elapsed expiry fails closed',()=>{
 for(const expiry of [undefined,null,0,now-1,now,NaN,Infinity,now+900001,String(now+1000)])
  assert.throws(()=>checkedStatus({...ok,expiresAt:expiry},{now}),/LOCAL_SESSION_INCOMPLETE/);
});
test('forged success with send/provider claims fails closed',()=>{
 for(const shape of [{canSend:true},{canSend:undefined},{providerAuthorized:true},{providerAuthorized:undefined}])
  assert.throws(()=>checkedStatus({...ok,...shape},{now}),/LOCAL_SESSION_UNTRUSTED/);
});
test('forged status ok:false or paired types fails closed',()=>{
 for(const shape of [{ok:false},{paired:'true'},{paired:1},{paired:null}])
  assert.throws(()=>checkedStatus({...ok,...shape},{now}),/LOCAL_SESSION_UNTRUSTED/);
});
test('pair code is exactly W47 terminal lowercase 32-byte random hex',()=>{
 assert.ok(validPairingCode(pair));
 for(const s of ['b'.repeat(63),'b'.repeat(65),'B'.repeat(64),'b'.repeat(64)+'?','pair',''])
  assert.equal(validPairingCode(s),false);
});
test('untrusted HTTP error must never echo secret pairingCode to UI',()=>{
 const malicious={error:'PAIRING_CODE='+pair};
 assert.equal(safeSessionError(malicious,401),'服务端拒绝请求（HTTP 401）');
 assert.ok(!safeSessionError(malicious,401).includes(pair));
 assert.equal(safeSessionError({error:'PAIRING_NOT_APPROVED'},401),'配对码无效、已使用或已过期');
});
test('W46 Vue uses authoritative GET; pairing code cleared before network',()=>{
 const vue=readFileSync(new URL('../src/BCLocalSessionConnector.vue',import.meta.url),'utf8');
 assert.match(vue,/code\.value=''; \/\/ never persist code/);
 assert.match(vue,/await refresh\(\);/);
 assert.match(vue,/const verified=checkedStatus\(data\)/);
 assert.match(vue,/session\.value=\{available:verified\.available,paired:verified\.paired/);
 assert.match(vue,/referrerPolicy:'no-referrer'/);
 assert.match(vue,/redirect:'error'/);
 assert.doesNotMatch(vue,/localStorage\.setItem|sessionStorage\.setItem|console\.log\(|console\.error\(|URLSearchParams\(|location\.href\s*=/);
});
test('W46 local UI disables stale verification during GET and expiry',()=>{
 const vue=readFileSync(new URL('../src/BCLocalSessionConnector.vue',import.meta.url),'utf8');
 assert.match(vue,/reset\(\); \/\/ never display a stale verified state during a pending GET/);
 assert.match(vue,/expiryTimer=setTimeout\(\(\)=>\{/);
 assert.match(vue,/reset\(\);\s*void refresh\(\);/);
 assert.match(vue,/onBeforeUnmount\(\(\)=>\{mounted=false;revision\+\+;reset\(\)/);
});
test('W46 single BRAIN and CHAT Composer not duplicated by session connector',()=>{
 const parent=readFileSync(new URL('../src/BCProductWorkspaceCandidate.vue',import.meta.url),'utf8');
 assert.equal((parent.match(/<BCLocalSessionConnector/g)||[]).length,1);
 assert.match(parent,/v-else-if="activeWorkspace==='BRAIN'"/);
 assert.ok(!parent.includes('<BCNativeComposer'));
 assert.ok(!parent.includes('<MessageDelivery'));
});

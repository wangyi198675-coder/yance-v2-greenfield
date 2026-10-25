import test from 'node:test';
import assert from 'node:assert/strict';
import {makeReport} from './pr-head-evidence.mjs';
const sha='a'.repeat(40), other='b'.repeat(40), needs=Object.fromEntries(
  ['contracts-security','native-node','agno-python','synthetic-m0','frontend-browser'].map(k=>[k,{result:'success'}])
);
const pr={event:'pull_request',prHead:sha,checkoutSha:sha,baseSha:other,prNumber:'26',needs};
test('exact PR HEAD reports attached scope and all five real job conclusions',()=>{
 const r=makeReport(pr);
 assert.equal(r.checkAttribution,'PR_HEAD_CHECKS');
 assert.equal(r.testedCheckoutSha,sha);
 assert.equal(r.gate,'SCOPED_CI_GREEN');
 assert.equal(r.realM1NativeEndToEnd,'NOT_ATTESTED');
});
test('merge-ref SHA must not be misrepresented as exact PR HEAD',()=>{
 assert.throws(()=>makeReport({...pr,checkoutSha:other}),/CHECKOUT_SHA_MISMATCH/);
});
test('failed check always stays RED',()=>{
 const r=makeReport({...pr,needs:{...needs,'agno-python':{result:'failure'}}});
 assert.equal(r.gate,'SCOPED_CI_RED');
});
test('missing or skipped check cannot silently become PASS',()=>{
 const r=makeReport({...pr,needs:{...needs,'native-node':{result:'skipped'}}});
 assert.equal(r.gate,'SCOPED_CI_RED');
 assert.equal(makeReport({...pr,needs:{}}).gate,'SCOPED_CI_RED');
});
test('manual dispatch is never attributed to PR HEAD',()=>{
 const r=makeReport({...pr,event:'workflow_dispatch',targetSha:sha});
 assert.equal(r.checkAttribution,'DISPATCH_RUN_ONLY_NOT_PR_HEAD_CHECKS');
});
test('dispatch with PR label but no target SHA fails closed',()=>{
 assert.throws(()=>makeReport({...pr,event:'workflow_dispatch'}),/Dispatch PR label without target SHA/);
});
test('reject invalid or ambiguous source commit',()=>{
 assert.throws(()=>makeReport({...pr,prHead:'main'}),/40-hex/);
 assert.throws(()=>makeReport({...pr,baseSha:'main'}),/Invalid base SHA/);
});

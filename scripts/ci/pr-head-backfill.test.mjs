import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePlan,classify,alreadyAttestedAtExactHead} from './pr-head-backfill.mjs';

const sha='a'.repeat(40), base='b'.repeat(40), item={number:26,sha,base,ref:'owner/agentos/native'};
const all=()=>Object.fromEntries(['source','contract','security','native','agno','m0','frontend','browserInstall','browser'].map(x=>[x,'success']));
test('correct immutable HEAD + actually completed tests may be scoped green',()=>{
 const r=classify(item,sha,all(),{agno:true,m0:true,browser:true});
 assert.equal(r.conclusion,'success');
 assert.equal(r.testedCheckoutSha,sha);
 assert.ok(r.notAttested.includes('M1_OR_M2_NATIVE_END_TO_END'));
});
test('wrong merge SHA can never be attributed to PR head',()=>assert.throws(()=>classify(item,base,all()),/CHECKOUT_SHA_MISMATCH/));
test('failed real Agno no-key contract remains red',()=>{
 const a=all();a.agno='failure';
 assert.equal(classify(item,sha,a,{agno:true,browser:true,m0:true}).conclusion,'failure');
});
test('missing mandatory contract and security fail closed',()=>{
 const a=all();a.contract='missing';a.security='skipped';
 assert.deepEqual(classify(item,sha,a,{agno:true,browser:true}).failures,['contract','security']);
});
test('no Agno repo may omit Agno only when explicitly not applicable',()=>{
 const a=all();a.agno='skipped';a.browser='skipped';a.browserInstall='skipped';
 assert.equal(classify(item,sha,a,{agno:false,browser:false}).conclusion,'success');
 assert.equal(classify(item,sha,a,{agno:true,browser:false}).conclusion,'failure');
});
test('browser source requires browser installs and actual smoke',()=>{
 const a=all();a.browserInstall='skipped';a.browser='skipped';
 assert.equal(classify(item,sha,a,{agno:false,browser:true}).conclusion,'failure');
});
test('PR plan refuses aliases, empty input and duplicate PR IDs',()=>{
 assert.deepEqual(validatePlan([item]),[item]);
 assert.throws(()=>validatePlan([]),/1-100/);
 assert.throws(()=>validatePlan([item,item]),/duplicate/);
 assert.throws(()=>validatePlan([{...item,sha:'main'}]),/full source/);
});
test('canceled or unknown job state is never green',()=>{
 let a=all();a.native='cancelled';
 assert.equal(classify(item,sha,a).conclusion,'failure');
 a=all();a.native='success-because-I-said-so';
 assert.throws(()=>classify(item,sha,a),/invalid step/);
});

test('reuses only genuine successful W30 checks on the SAME immutable SHA',()=>{
 const good={name:'w30/exact-head-backfill',head_sha:sha,status:'completed',conclusion:'success',app:{slug:'github-actions'},details_url:'https://github.com/owner/repo/actions/runs/123'};
 assert.equal(alreadyAttestedAtExactHead(item,[good]),true);
 assert.equal(alreadyAttestedAtExactHead({...item,sha:base},[good]),false);
 assert.equal(alreadyAttestedAtExactHead(item,[{...good,conclusion:'failure'}]),false);
 assert.equal(alreadyAttestedAtExactHead(item,[{...good,name:'nonproduction-merge-gate'}]),false);
 assert.equal(alreadyAttestedAtExactHead(item,[{...good,app:{slug:'other-app'}}]),false);
 assert.equal(alreadyAttestedAtExactHead(item,[{...good,details_url:'https://evil.invalid/forged'}]),false);
 assert.equal(alreadyAttestedAtExactHead(item,[]),false);
});

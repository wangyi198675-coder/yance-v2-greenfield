import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseRef,nativeSiblings,attachActualNativeSiblings} from './native-sibling-refs.mjs';
const sha='a'.repeat(40),ref='refs/heads/w46/bc-native-composer-20261025';
test('git ls-remote parser requires exact branch and immutable full SHA',()=>{
 assert.equal(parseRef(sha+'\t'+ref+'\n',ref),sha);
 for(const bad of ['','aabb\t'+ref,sha+'\tother/branch',sha+'\t'+ref+'\n'+sha+'\t'+ref]){
  assert.throws(()=>parseRef(bad,ref),/SIBLING_REF/);
 }
});
test('W30 sibling refs are exact Owner branches and strictly synthetic',()=>{
 assert.deepEqual(nativeSiblings.map(x=>x.id),['PR32','W46']);
 assert.equal(nativeSiblings[0].required,'services/api/src/domains/grant-custody-budget/native-bridges.mjs');
 assert.equal(nativeSiblings[1].required,'apps/web/src/native-takeover-port.mjs');
});
test('no W24 takeover test means no sibling fetch, no environment alteration',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'w30-no-w24-'));
 const env={};
 try{
   const x=attachActualNativeSiblings(dir,env);
   assert.deepEqual(x.sources,[]);
   x.dispose();
   assert.deepEqual(env,{});
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('fake supplied sibling root fails closed; source test cannot silently skip',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'w30-native-contract-'));
  const relative='services/api/src/domains/identity-consent/takeover-http.test.mjs';
  const testPath=path.join(temp,relative);
  fs.mkdirSync(path.dirname(testPath),{recursive:true});
  fs.writeFileSync(testPath,'// synthetic test sentinel\\n');
  const env={YANCE_PR32_ROOT:path.join(temp,'does-not-exist')};
  try {
    assert.throws(()=>attachActualNativeSiblings(temp,env),/GIT_SIBLING_REF_COMMAND_FAILED/);
    assert.equal(env.YANCE_PR32_ROOT,path.join(temp,'does-not-exist'));
  }finally{fs.rmSync(temp,{recursive:true,force:true})}
});

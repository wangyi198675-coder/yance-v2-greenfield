import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createWebPrivateSiwcChoice} from './web-private-siwc-choice.mjs';

test('existing W47 selection file holds SIWC without any credential bytes',async()=>{
 const root=mkdtempSync(join(tmpdir(),'yance-siwc-choice-'));
 let authorized=true,profileRef='profile-123456789';
 const sdk={
  list:async()=>authorized?[{modelId:'gpt-one',name:'One'}]:[],
  profile:async()=>authorized?profileRef:'',
  invoke:async()=> 'never used'
 };
 try{
  const port=createWebPrivateSiwcChoice({appLocalDataRoot:root,officialPort:sdk});
  assert.equal((await port.status()).models.length,1);
  await port.select({provider:'CHATGPT_PLAN_SIWC',modelId:'gpt-one'});
  assert.equal((await port.principalModel()).modelBackend,'siwc');
  assert.equal((await port.current()).modelId,'gpt-one');
  const disk=readFileSync(join(root,'web-private-cloud-selection.json'),'utf8');
  assert.doesNotMatch(disk,/accessToken|refreshToken|secret|apiKey/);
  authorized=false;
  assert.equal(await port.current(),null);
  assert.equal((await port.principalModel()).modelBackend,'unconfigured');
  authorized=true;
  profileRef='another-profile-456789';
  assert.equal(await port.current(),null); // Same model on another account is NOT permission.
  assert.equal((await port.principalModel()).modelBackend,'unconfigured');
  profileRef='profile-123456789';
  assert.equal((await port.current()).modelId,'gpt-one');
  port.clearSelection();
  assert.equal(port.hasSelection(),false);
 }finally{rmSync(root,{recursive:true,force:true})}
});

test('nonlisted official model cannot be silently selected',async()=>{
 const root=mkdtempSync(join(tmpdir(),'yance-siwc-bad-'));
 try{
  const port=createWebPrivateSiwcChoice({appLocalDataRoot:root,
   officialPort:{list:async()=>[],profile:async()=>'profile-123456789',invoke:async()=>''}});
  await assert.rejects(()=>port.select({provider:'CHATGPT_PLAN_SIWC',modelId:'fake'}),
    e=>e.status===409);
  assert.equal(port.hasSelection(),false);
 }finally{rmSync(root,{recursive:true,force:true})}
});

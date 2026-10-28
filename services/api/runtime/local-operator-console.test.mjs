import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {createOperatorConsoleIssuer} from './local-operator-console.mjs';
function harness({now=()=>Date.now(),ttl=1500}={}){
 const input=new PassThrough(),output=new PassThrough();
 let collected='',revocations=0;
 output.setEncoding('utf8');output.on('data',x=>collected+=x);
 const issuer=createOperatorConsoleIssuer({input,outputStream:output,clock:now,grantTtlMs:ttl,
   revokeSessions:()=>revocations++});
 const command=x=>input.write(x+'\n');
 const code=()=>collected.match(/PAIRING_CODE=([a-f0-9]{64})/g)?.at(-1)?.split('=')[1];
 return {issuer,command,code,revoked:()=>revocations,close:()=>{issuer.close();input.destroy();output.destroy()}};
}
const tick=()=>new Promise(done=>setImmediate(done));
test('only a local operator stdin action creates an unpredictable one-use pairing grant',async()=>{
 const t=harness();try{
  assert.equal(await t.issuer.approvePairing('a'.repeat(64)),false);
  t.command('pair');await tick();
  const value=t.code();assert.match(value,/^[a-f0-9]{64}$/);
  assert.equal(await t.issuer.approvePairing('f'.repeat(64)),false);
  assert.equal(await t.issuer.approvePairing(value),true);
  assert.equal(await t.issuer.approvePairing(value),false);
  t.command('pair');await tick();
  const second=t.code();assert.notEqual(second,value);
  t.command('cancel');await tick();
  assert.equal(await t.issuer.approvePairing(second),false);
 }finally{t.close()}
});
test('operator revoke, short expiry, and console exit discard pending approvals',async()=>{
 let now=100;
 const t=harness({now:()=>now,ttl:1000});try{
  t.command('pair');await tick();const one=t.code();
  now+=1000;assert.equal(await t.issuer.approvePairing(one),false);
  t.command('pair');await tick();const two=t.code();
  t.command('revoke');await tick();
  assert.equal(t.revoked(),1);
  assert.equal(await t.issuer.approvePairing(two),false);
  t.close();assert.equal(t.revoked(),2);assert.equal(t.issuer.active,false);
 }finally{t.close()}
});
test('operator rejects invalid TTL and malformed code',async()=>{
 assert.throws(()=>createOperatorConsoleIssuer({grantTtlMs:300000}),/TTL_INVALID/);
 const t=harness();try{
  t.command('pair');await tick();
  assert.equal(await t.issuer.approvePairing({actor:'admin'}),false);
  assert.equal(await t.issuer.approvePairing('bad'),false);
 }finally{t.close()}
});

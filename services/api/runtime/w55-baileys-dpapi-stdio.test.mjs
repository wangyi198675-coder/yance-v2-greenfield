import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createW55BaileysDpapiAuthStore} from './w55-baileys-dpapi-stdio.mjs';
const exe=process.env.W55_SIGNAL_EXE;
const fixture=()=> {
 const root=mkdtempSync(join(tmpdir(),'w55-wa-qa-'));
 const binding=Object.freeze({tenantId:'personal',accountId:'wa-authorized-1',
  bindingRevision:1,accountRevocationEpoch:0});
 let revoked=false;
 const make=(override={})=>createW55BaileysDpapiAuthStore({
  executable:exe,qaEnv:{YANCE_W55_SIGNAL_QA_DIR:root},
  resolveTrustedScope:async()=>({
   installationRef:override.installationRef??'w54-install-existing',
   principalRef:'w54-user-current',...binding,
  }),
  assertCurrent:async()=>!revoked,
 });
 return {root,binding,make,revokeCurrent:()=>{revoked=true},cleanup:()=>rmSync(root,{recursive:true,force:true})};
};
test('W55 actual Windows DPAPI encrypted Baileys Signal creds/keys persist across independent Rust subprocesses', {skip:!exe},async()=>{
 const f=fixture();
 try{
  const store=f.make();
  const first=await store.open({binding:f.binding,userAction:'PAIR_OWN_ACCOUNT'});
  assert.ok(first.state.creds.registrationId);
  first.state.creds.registered=true;
  await first.state.keys.set({'session':{'abc@s.whatsapp.net':{
   registrationId:42,rootKey:Buffer.from('private-key-that-must-never-appear-on-disk')}}});
  await first.saveCreds();
  const encrypted=readdirSync(f.root);
  assert.equal(encrypted.length,1);
  const file=readFileSync(join(f.root,encrypted[0]));
  assert.equal(file.includes(Buffer.from('private-key-that-must-never-appear-on-disk')),false);
  assert.equal(file.includes(Buffer.from('registered')),false);
  const otherProcessStore=f.make();
  const restored=await otherProcessStore.open({binding:f.binding,userAction:'RESUME_EXPLICITLY_APPROVED'});
  assert.equal(restored.state.creds.registered,true);
  const result=await restored.state.keys.get('session',['abc@s.whatsapp.net']);
  assert.equal(result['abc@s.whatsapp.net'].registrationId,42);
  assert.deepEqual(result['abc@s.whatsapp.net'].rootKey,Buffer.from('private-key-that-must-never-appear-on-disk'));
  await assert.rejects(store.open({binding:f.binding,userAction:'PAIR_OWN_ACCOUNT'}),/W55_SIGNAL_EXPLICIT_RECONNECT_REQUIRED/);
 }finally{f.cleanup()}
});
test('W55 revoke permanently tombstones current key and refuses old-credentials resurrection', {skip:!exe},async()=>{
 const f=fixture();
 try{
  const store=f.make(),state=await store.open({binding:f.binding,userAction:'PAIR_OWN_ACCOUNT'});
  await state.state.keys.set({'pre-key':{'a':Buffer.from('invented-secret')}});
  const x=await store.revoke({binding:f.binding});
  assert.equal(x.revoked,true);
  await assert.rejects(store.open({binding:f.binding,userAction:'RESUME_EXPLICITLY_APPROVED'}),
   /W55_SIGNAL_ACCOUNT_REVOKED/);
  await assert.rejects(store.open({binding:f.binding,userAction:'PAIR_OWN_ACCOUNT'}),
   /W55_SIGNAL_ACCOUNT_REVOKED/);
  const newer=f.make({installationRef:'w54-another-installation'});
  await assert.rejects(newer.open({binding:f.binding,userAction:'RESUME_EXPLICITLY_APPROVED'}),
    /W55_SIGNAL_EXISTING_CREDENTIALS_REQUIRED/);
 }finally{f.cleanup()}
});
test('W55 rejects absent W24/W54 original owner ports and never reads previously saved secrets',async()=>{
 assert.throws(()=>createW55BaileysDpapiAuthStore({executable:'x'}),/W55_BAILEYS_NATIVE_OWNER_PORTS_REQUIRED/);
});
test('W55 refuses read/write after W24 revocation even if original worker object survives', {skip:!exe},async()=>{
 const f=fixture();
 try{
  const port=f.make();
  const v=await port.open({binding:f.binding,userAction:'PAIR_OWN_ACCOUNT'});
  f.revokeCurrent();
  await assert.rejects(v.saveCreds(),/W55_SIGNAL_ACCOUNT_REVOKED_OR_STALE/);
  await assert.rejects(v.state.keys.set({'session':{'a':{secret:'x'}}}),
   /W55_SIGNAL_ACCOUNT_REVOKED_OR_STALE/);
  await assert.rejects(v.state.keys.get('session',['a']),/W55_SIGNAL_ACCOUNT_REVOKED_OR_STALE/);
  assert.equal((await port.revoke({binding:f.binding})).revoked,true);
 }finally{f.cleanup()}
});

test('W55 concurrent independent native Signal key writes keep both categories after cold reload', {skip:!exe},async()=>{
 const f=fixture();
 try{
  const auth=await f.make().open({binding:f.binding,userAction:'PAIR_OWN_ACCOUNT'});
  const another=await f.make().open({binding:f.binding,userAction:'RESUME_EXPLICITLY_APPROVED'});
  await Promise.all([
   auth.state.keys.set({'session':{'first@s.whatsapp.net':{value:'ONE'}}}),
   another.state.keys.set({'sender-key':{'second@s.whatsapp.net':{value:'TWO'}}}),
  ]);
  const fresh=await f.make().open({binding:f.binding,userAction:'RESUME_EXPLICITLY_APPROVED'});
  const a=await fresh.state.keys.get('session',['first@s.whatsapp.net']);
  const b=await fresh.state.keys.get('sender-key',['second@s.whatsapp.net']);
  assert.equal(a['first@s.whatsapp.net'].value,'ONE');
  assert.equal(b['second@s.whatsapp.net'].value,'TWO');
 }finally{f.cleanup()}
});
test('W55 revoked account tombstone resists concurrent late Signal write and repeated W55 revoke', {skip:!exe},async()=>{
 const f=fixture();
 try{
  const store=f.make(),live=await store.open({binding:f.binding,userAction:'PAIR_OWN_ACCOUNT'});
  await store.revoke({binding:f.binding});
  await assert.rejects(live.state.keys.set({'session':{'late':{secret:'must-not-resurrect'}}}),
    /W55_SIGNAL_ACCOUNT_REVOKED/);
  const second=await store.revoke({binding:f.binding});
  assert.equal(second.revoked,true);
  await assert.rejects(store.open({binding:f.binding,userAction:'RESUME_EXPLICITLY_APPROVED'}),
    /W55_SIGNAL_ACCOUNT_REVOKED/);
 }finally{f.cleanup()}
});

test('W55 incomplete first WhatsApp QR may be retried only after a NEW explicit user click', {skip:!exe},async()=>{
 const f=fixture();
 try{
  const port=f.make();
  const first=await port.open({binding:f.binding,userAction:'PAIR_OWN_ACCOUNT'});
  assert.equal(first.state.creds.registered,false);
  const retry=await port.open({binding:f.binding,userAction:'PAIR_OWN_ACCOUNT'});
  assert.equal(retry.state.creds.registrationId,first.state.creds.registrationId);
  await port.revoke({binding:f.binding});
  await assert.rejects(port.open({binding:f.binding,userAction:'PAIR_OWN_ACCOUNT'}),
   /W55_SIGNAL_ACCOUNT_REVOKED/);
 }finally{f.cleanup()}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createW55WebNativeStdioPort} from './w55-web-native-stdio.mjs';

const cleanup=(exe,provider)=>new Promise(done=>{
 const child=spawn(exe,[],{windowsHide:true,shell:false,stdio:['pipe','pipe','ignore']});
 child.stdout.resume();
 child.stdin.end(JSON.stringify({op:'qa_cleanup',provider})+'\n');
 child.on('error',()=>done());
 child.on('exit',()=>done());
});
test('ACTUAL W55 Rust WinCred/DPAPI current-Windows-user host: fake Key encrypt/rotate/revoke and native-only lease',async t=>{
 const exe=process.env.W55_WEB_QA_NATIVE_EXE;
 if(!exe){t.skip('original W55 debug QA native executable not provided');return}
 const namespace='W55_WEB_QA_'+randomBytes(16).toString('hex');
 const original=process.env.W55_WEB_QA_SCOPE;
 process.env.W55_WEB_QA_SCOPE=namespace;
 const port=createW55WebNativeStdioPort({executable:exe,timeoutMs:16000});
 const provider='OPENROUTER';
 const first=['sk-','or-v1-','W47-W55-QA-NOT-REAL-ABC'].join('');
 const second=['sk-','or-v1-','W47-W55-QA-NOT-REAL-DEF'].join('');
 try{
  const unset=await port.status({provider});
  assert.equal(unset.configured,false);
  assert.equal(unset.revision,0);
  const a=await port.store({provider,secret:first,expectedRevision:null});
  assert.equal(a.configured,true);assert.equal(a.revision,1);
  const restartPort=createW55WebNativeStdioPort({executable:exe});
  assert.equal((await restartPort.status({provider})).revision,1);
  let value;
  await restartPort.withSecret({provider,expectedRevision:1,modelId:'openai/gpt-4o-mini',selectionEpoch:1},
   k=>{value=k});
  assert.equal(value,first);value=null;
  const b=await port.store({provider,secret:second,expectedRevision:1});
  assert.equal(b.revision,2);
  await assert.rejects(()=>port.withSecret({provider,expectedRevision:1},()=>{}),
   e=>e?.code==='UNAVAILABLE');
  const c=await port.revoke({provider,expectedRevision:2});
  assert.equal(c.revoked,true);assert.equal(c.configured,false);assert.equal(c.revision,3);
  await assert.rejects(()=>port.withSecret({provider,expectedRevision:2},()=>{}),
   e=>e?.code==='UNAVAILABLE');
  const masked=await port.status({provider});
  assert.equal(JSON.stringify(masked).includes(first),false);
  assert.equal(JSON.stringify(masked).includes(second),false);
  console.log('W47_W55_ACTUAL_WIN_CRED_WEB_QA '+JSON.stringify({
   originalW55Rust:true,currentWindowsUser:true,
   actualNativeProcess:true,actualWinCredDPAPI:true,
   fakeKeySaved:true,fakeKeyRotated:true,restartedHostStatus:true,
   revoked:true,noPaidCalls:true,noSocialSends:true,noBrowserSecrets:true
  }));
 }finally{
  await cleanup(exe,provider);
  if(original===undefined)delete process.env.W55_WEB_QA_SCOPE;
  else process.env.W55_WEB_QA_SCOPE=original;
 }
});

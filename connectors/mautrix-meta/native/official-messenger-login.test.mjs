import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfficialMessengerLogin} from './official-messenger-login.mjs';
import {createBridgeStatusServer} from './bridge-http.mjs';
const principal='@w56_internal_fb_bridge:yance-w26.invalid';
const PREFIX='/api/v2/providers/fb-personal';
function upstream(){
 const calls=[];
 const fetchImpl=async (url,init={})=>{
  const u=new URL(url);
  calls.push({path:u.pathname,method:init.method||'GET',url:u.toString()});
  if(u.pathname.endsWith('/account/whoami'))
   return Response.json({user_id:principal});
  if(u.pathname.endsWith('/login/flows'))
   return Response.json({flows:[
    {id:'messenger-lite',name:'Messenger iOS'},
    {id:'messenger-lite-android',name:'Messenger Android'},
    {id:'facebook',name:'Cookie method'}]});
  if(u.pathname.endsWith('/login/start/messenger-lite-android'))
   return Response.json({login_id:'process-pin',step_id:'storage-pin',txn_id:'tx-pin',
    type:'user_input',
    instructions:'Enter your Messenger secure storage PIN to restore encrypted chat history. Leave it empty to continue without restoring history.',
    user_input:{fields:[{id:'recovery_pin',type:'password',name:'Secure Storage PIN'}]}});
  if(u.pathname.endsWith('/login/step/process-pin/storage-pin/user_input')){
   assert.equal(JSON.parse(init.body).recovery_pin,'');
   return Response.json({type:'complete',login_id:'process-pin'});
  }
  if(u.pathname.endsWith('/login/start/messenger-lite'))
   return Response.json({login_id:'process-1',step_id:'credentials',txn_id:'tx1',
    type:'user_input',instructions:'Enter your Messenger credentials',
    user_input:{fields:[{id:'username',type:'username',name:'Username'},
      {id:'password',type:'password',name:'Password'}]}});
  if(u.pathname.endsWith('/login/step/process-1/credentials/user_input')){
   assert.equal(u.searchParams.get('user_id'),principal);
   assert.equal(u.searchParams.get('txn_id'),'tx1');
   assert.equal(JSON.parse(init.body).username,'qa');
   return Response.json({type:'complete',login_id:'process-1'});
  }
  return Response.json({errcode:'M_NOT_FOUND'},{status:404});
 };
 const controller=createOfficialMessengerLogin({getSession:async()=>({principal,token:'transient-private-qa'}),fetchImpl});
 return {controller,calls};
}
test('real BridgeV2 endpoints are used without exposing Matrix bearer',async()=>{
 const {controller,calls}=upstream();
 const flows=await controller.flows();
 assert.deepEqual(flows.flows.map(f=>f.id),['messenger-lite','messenger-lite-android']);
 assert.equal(flows.canSend,false);
 await assert.rejects(()=>controller.start('facebook'),/UNAPPROVED_MESSENGER_LOGIN_FLOW/);
 const first=await controller.start();
 assert.equal(first.step.type,'user_input');
 assert.equal(first.step.fields[1].type,'password');
 assert.equal('token' in first,false);
 const done=await controller.advance(first.handle,{username:'qa',password:'never-log'});
 assert.equal(done.step.type,'complete');
 assert.equal(done.canSend,false);
 assert.equal(done.state,'UPSTREAM_LOGIN_COMPLETED_W24_BINDING_PENDING');
 await assert.rejects(()=>controller.advance(first.handle,{username:'qa'}),/LOGIN_PROCESS_EXPIRED_OR_MISSING/);
 assert.ok(calls.some(x=>x.path.endsWith('/login/start/messenger-lite')));
 assert.ok(calls.some(x=>x.path.endsWith('/user_input')));
});
test('upstream optional encrypted-history recovery PIN accepts blank submission',async()=>{
 const {controller}=upstream();
 const response=await controller.start('messenger-lite-android');
 assert.equal(response.step.type,'user_input');
 assert.equal(response.step.fields[0].optional,true);
 assert.equal(response.step.fields[0].id,'recovery_pin');
 const done=await controller.advance(response.handle,{recovery_pin:''});
 assert.equal(done.step.type,'complete');
 assert.equal(done.canSend,false);
});
test('missing internal technical Matrix session fails closed',async()=>{
 const controller=createOfficialMessengerLogin({getSession:async()=>null});
 await assert.rejects(()=>controller.flows(),/MATRIX_TECH_SESSION_NOT_READY/);
});
test('local native click flow has same-origin and one-time ticket boundary',async()=>{
 const {controller}=upstream();
 const s=createBridgeStatusServer({port:29479,officialLogin:controller});
 await new Promise(resolve=>s.listen(29479,'127.0.0.1',resolve));
 const root='http://127.0.0.1:29479'+PREFIX;
 try{
  const page=await (await fetch(root+'/connect')).text();
  assert.match(page,/连接 Facebook Messenger/);
  assert.doesNotMatch(page,/Homeserver|Matrix用户名|配对码/);
  const ticket=page.match(/name="ticket" value="([a-f0-9]{48})"/)?.[1];
  assert.ok(ticket);
  const endpoint=root+'/native-login/flows';
  const body=JSON.stringify({});
  const good={Origin:'http://127.0.0.1:29479','Sec-Fetch-Site':'same-origin',
    'Content-Type':'application/json','X-Yance-Native-Login-Ticket':ticket};
  assert.equal((await fetch(endpoint,{method:'POST',headers:{...good,Origin:'https://evil.example'},body})).status,403);
  assert.equal((await fetch(endpoint,{method:'POST',headers:{...good,'X-Yance-Native-Login-Ticket':'0'.repeat(48)},body})).status,403);
  const valid=await fetch(endpoint,{method:'POST',headers:good,body});
  assert.equal(valid.status,200);
  assert.equal((await valid.json()).flows[0].id,'messenger-lite');
  const script=await fetch(root+'/native-login-ui.mjs');
  assert.equal(script.status,200);
  assert.match(await script.text(),/native-login\/start/);
 }finally{await new Promise(resolve=>s.close(resolve))}
});

test('real upstream rejected 2FA is classified without disclosing code or allowing replay',async()=>{
 const mockFetch=async(url,opts={})=>{
  const path=new URL(url).pathname;
  if(path.endsWith('/account/whoami'))return Response.json({user_id:principal});
  if(path.endsWith('/login/flows'))return Response.json({flows:[{id:'messenger-lite'}]});
  if(path.endsWith('/login/start/messenger-lite'))
   return Response.json({login_id:'step-2fa',step_id:'authenticator',txn_id:'attempt-1',
     type:'user_input',instructions:'Enter a six-digit code from your authenticator app',
     user_input:{fields:[{id:'code',type:'2fa_code',name:'Six-digit code'}]}});
  if(path.endsWith('/login/step/step-2fa/authenticator/user_input')){
   assert.equal(JSON.parse(opts.body).code,'000001');
   return Response.json({errcode:'M_BAD_STATE',error:'rejected code 000001'}, {status:400});
  }
  return Response.json({errcode:'M_NOT_FOUND'},{status:404});
 };
 const login=createOfficialMessengerLogin({
   getSession:async()=>({principal,token:'safe-fixture'}),fetchImpl:mockFetch});
 const start=await login.start();
 assert.equal(start.step.fields[0].type,'2fa_code');
 await assert.rejects(()=>login.advance(start.handle,{code:'000001'}),e=>
   e.code==='LOGIN_STEP_REJECTED_RESTART_REQUIRED'&&
   e.status===409&&!String(e.message).includes('000001'));
 await assert.rejects(()=>login.advance(start.handle,{code:'000001'}),e=>
   e.code==='LOGIN_PROCESS_EXPIRED_OR_MISSING');
});

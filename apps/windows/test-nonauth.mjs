import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const api='http://127.0.0.1:47182';
const get = (url,headers={}) => new Promise((resolve,reject)=>{
 const agent=new http.Agent({keepAlive:false,maxSockets:1});
 http.get(url,{headers,agent,timeout:4000},resp=>{
 let body='';resp.setEncoding('utf8');resp.on('data',s=>body+=s);
 resp.on('end',()=>{agent.destroy();resolve({status:resp.statusCode,body})});
 }).on('error',reject);
});
test('W47 actual health remains no-auth and no-send',async()=>{
 const {status,body}=await get(api+'/api/v2/runtime/health');
 assert.equal(status,200);const payload=JSON.parse(body);
 assert.equal(payload.trustedSession,false);assert.equal(payload.canSend,false);
 assert.equal(payload.realContacts,0);assert.equal(payload.externalEffects,false);
});
test('no-auth browser GET remains 401',async()=>{
 const {status}=await get(api+'/api/v2/identity-consent/takeover-state');
 assert.equal(status,401);
});
test('malicious Origin and self asserted actor cannot mint TAKEOVER Principal',async()=>{
 const {status}=await get(api+'/api/v2/identity-consent/takeover-state',
 {'Origin':'http://attacker.invalid','X-Yance-Actor':'admin','X-Yance-Trusted':'true'});
 assert.equal(status,403); // W47 rejects the hostile Origin before native no-auth 401.
});
test('two distinct untrusted HTTP clients both fail managed STOP identity',async()=>{
 const a=await get(api+'/api/v2/managed-stop',{Origin:'http://localhost:4399'});
 const b=await get(api+'/api/v2/managed-stop',{Origin:'http://attacker.invalid'});
 assert.ok([401,403].includes(a.status));assert.ok([401,403].includes(b.status));
});
test('two separate browser-like JS contexts cannot create a session without native host',()=>{
 const code=fs.readFileSync(path.join(dir,'ui','main.js'),'utf8');
 const markup=fs.readFileSync(path.join(dir,'ui','index.html'),'utf8');
 assert.match(markup,/canSend=false/);
 for(let i=0;i<2;i++){
   const nodes=new Map();
   const make=id=>({textContent:'',disabled:false,
     addEventListener(type,fn){this.handler=fn}});
   const window={};
   const document={getElementById(id){if(!nodes.has(id))nodes.set(id,make(id));return nodes.get(id)}};
   vm.runInNewContext(code,{window,document,console,Promise},{timeout:2000});
   assert.equal(nodes.get('os').textContent,'无可信原生宿主');
   assert.equal(nodes.get('session').textContent,'不可用');
   assert.equal(nodes.get('logout').disabled,true);
   assert.equal(typeof window.__TAURI__,'undefined');
 }
});

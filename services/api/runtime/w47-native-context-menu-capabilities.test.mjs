import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createW47NativeContextMenuCapabilitiesHttp} from './w47-native-context-menu-capabilities.mjs';
const origin='http://127.0.0.1:44751';
async function server(kind='NATIVE_FIRST_PARTY'){
 let current=true,rev=1, reads=0;
 const sessionAuthority={sessionFor(){reads++;return current?{id:'original-native-id',record:{kind,rev}}:null}};
 const handle=createW47NativeContextMenuCapabilitiesHttp({sessionAuthority,webOrigin:origin});
 const app=createServer((req,res)=>Promise.resolve(handle(req,res,new URL(req.url,origin)))
 .then(handled=>{if(!handled){res.writeHead(404);res.end()}})
 .catch(e=>{res.writeHead(500);res.end(e.message)}));
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.address().port;
 return {base,close:()=>new Promise(resolve=>app.close(resolve)),
 revoke:()=>{current=false},reads:()=>reads,rev:()=>++rev};
}
async function get(s,path='/api/v2/context-menu/capabilities',opts={}){
 const r=await fetch(s.base+path,{method:opts.method||'GET',
  headers:{Origin:opts.origin||origin,'Sec-Fetch-Site':opts.site||'same-origin'}});
 return {status:r.status,body:await r.json()};
}
test('original native session receives only signed real Owner HOLD, never false COMMITTED',async()=>{
 const s=await server();
 try{
 const r=await get(s);
 assert.equal(r.status,200);
 assert.equal(r.body.source,'W47_RUNTIME_REAL_OWNER_CONNECTION_STATUS');
 assert.equal(r.body.counts.nativeVerified,0);
 assert.equal(r.body.counts.providerUnsupported,0);
 assert.ok(r.body.counts.uiDisabledHold>=25);
 assert.equal(r.body.canSend,false);
 for(const [action,item] of Object.entries(r.body.actions)){
  assert.equal(item.state,'UI_DISABLED_HOLD',action);
  assert.equal(item.canExecute,false,action);
  assert.notEqual(item.state,'NATIVE_VERIFIED');
 }
 assert.equal(r.body.actions.SOFT_DELETE.reason,'W24_CONVERSATION_DB_OWNER_UNASSIGNED');
 assert.equal(r.body.actions.TAKEOVER_HUMAN.reason,'W24_ASSIST_TAKEOVER_OWNER_FIX_AND_CURRENT_K_REQUIRED');
 assert.ok(s.reads()>=2);
 }finally{await s.close()}
});
test('guest and PRIVATE-only context never yield CONTACT scope or actor',async()=>{
 for(const kind of ['WEB_LOCAL_PRIVATE','PAIRING']){
 const s=await server(kind);try{const r=await get(s);assert.equal(r.status,401);
 assert.equal(r.body.error,'W54_NATIVE_OWNER_SESSION_REQUIRED')}finally{await s.close()}
 }
 const s=await server();try{s.revoke();const r=await get(s);assert.equal(r.status,401)}finally{await s.close()}
});
test('wrong origin, cross-site, mutation method and synthetic selector are denied',async()=>{
 const s=await server();
 try{
 assert.equal((await get(s,undefined,{origin:'https://outside.invalid'})).status,403);
 assert.equal((await get(s,undefined,{site:'cross-site'})).status,403);
 assert.equal((await get(s,undefined,{method:'POST'})).status,405);
 assert.equal((await get(s,'/api/v2/context-menu/capabilities?identityKey=fixture')).status,422);
 assert.equal((await get(s,'/api/v2/context-menu/actions')).status,404);
 assert.equal((await get(s,'/api/v2/context-menu/capabilities',{method:'DELETE'})).status,405);
 }finally{await s.close()}
});
test('requires original session authority: no default allow',()=>{
 assert.throws(()=>createW47NativeContextMenuCapabilitiesHttp({webOrigin:origin}),
 /W47_ORIGINAL_LOCAL_SESSION_REQUIRED/);
});

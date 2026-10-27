import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createBaileysNativeSetupHttpHandler} from './native-authorization-http.mjs';

const controller=()=>({
  readStatus:async()=>({ok:true,state:'WAITING_USER_AUTH',account:null,canSend:false}),
  readAvatar:async({remoteJid})=>({ok:true,available:true,imageUrl:'https://pps.whatsapp.net/avatar',
    peerId:remoteJid,canSend:false}),
  beginPairing:async({accountLocator})=>({ok:true,state:'STARTING_NATIVE_SDK',accountLocator,canSend:false}),
  readQr:async()=>{throw Object.assign(new Error('SDK_QR_NOT_AVAILABLE'),{code:'SDK_QR_NOT_AVAILABLE'})},
  disconnect:async()=>({ok:true,state:'WAITING_USER_AUTH',canSend:false}),
  revoke:async()=>({ok:true,state:'REVOKED',canSend:false}),
  reconnect:async()=>{throw Object.assign(new Error('RESTORE_NOT_AUTHORIZED'),{code:'RESTORE_NOT_AUTHORIZED'})},
});
async function hosted(fn){
  const actions=[];
  const handler=createBaileysNativeSetupHttpHandler({
    controller:controller(),
    resolveSignedNativeSession:async ({request,operation})=>{
      actions.push(operation);
      return {originVerified:request.headers['x-offline-auth']==='approved',
        csrfVerified:request.headers['x-offline-auth']==='approved',
        rendererVerified:request.headers['x-offline-auth']==='approved',
        nativeSession:{source:'native-test-session'}};
    },
  });
  const server=createServer((req,res)=>{
    Promise.resolve(handler(req,res,new URL(req.url,'http://127.0.0.1'))).then(found=>{
      if(!found){res.writeHead(404);res.end();}
    }).catch(()=>{res.writeHead(500);res.end();});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const call=async(path,{auth=true,method='GET',body}={})=>{
    const response=await fetch(base+path,{method,headers:{
      ...(auth?{'x-offline-auth':'approved'}:{}),
      ...(body!==undefined?{'content-type':'application/json'}:{})},
      ...(body!==undefined?{body:JSON.stringify(body)}:{})});
    return {status:response.status,headers:response.headers,body:await response.json()};
  };
  try{return await fn({call,actions});}
  finally{await new Promise(resolve=>server.close(resolve));}
}
test('actual loopback HTTP route GET returns no-login state only for verified native client',async()=>{
  await hosted(async({call,actions})=>{
    const denied=await call('/api/v2/providers/whatsapp-personal/native/status',{auth:false});
    assert.equal(denied.status,401);
    assert.equal(denied.body.canSend,false);
    const allowed=await call('/api/v2/providers/whatsapp-personal/native/status');
    assert.equal(allowed.status,200);
    assert.equal(allowed.body.state,'WAITING_USER_AUTH');
    assert.equal(allowed.body.account,null);
    assert.equal(allowed.headers.get('cache-control'),'no-store');
    assert.deepEqual(actions,['READ_WHATSAPP_STATUS','READ_WHATSAPP_STATUS']);
  });
});
test('W46 user click can POST authorized Baileys pairing, but never mints QR/online',async()=>{
  await hosted(async({call})=>{
    const url='/api/v2/providers/whatsapp-personal/native/authorize';
    const nonAuth=await call(url,{method:'POST',auth:false,body:{accountLocator:'a'}});
    assert.equal(nonAuth.status,401);
    const spoofed=await call(url,{method:'POST',body:{accountLocator:'a',authorized:true}});
    assert.equal(spoofed.status,422);
    const clicked=await call(url,{method:'POST',body:{accountLocator:'w24-account-ref'}});
    assert.equal(clicked.status,200);
    assert.equal(clicked.body.state,'STARTING_NATIVE_SDK');
    assert.equal(clicked.body.canSend,false);
    const qr=await call('/api/v2/providers/whatsapp-personal/native/qr');
    assert.equal(qr.status,409);
    assert.equal(qr.body.error,'SDK_QR_NOT_AVAILABLE');
    assert.equal((await call(url,{method:'GET'})).status,405);
    assert.equal((await call(url+'?ignored=1',{method:'POST',body:{accountLocator:'a'}})).status,405);
  });
});
test('disconnect/revoke are valid POST only; reconnect never bypasses W24/Vault restore permission',async()=>{
  await hosted(async({call})=>{
    const base='/api/v2/providers/whatsapp-personal/native/';
    const stopped=await call(base+'disconnect',{method:'POST'});
    assert.equal(stopped.status,200);assert.equal(stopped.body.state,'WAITING_USER_AUTH');
    const revoked=await call(base+'revoke',{method:'POST'});
    assert.equal(revoked.status,200);assert.equal(revoked.body.state,'REVOKED');
    const deniedRestore=await call(base+'reconnect',{method:'POST',body:{accountLocator:'old-account-ref'}});
    assert.equal(deniedRestore.status,503);
    assert.equal(deniedRestore.body.canSend,false);
    const method=await call(base+'revoke');
    assert.equal(method.status,405);
  });
});
test('no signed localhost session -> no authorized read or mutation',async()=>{
  await hosted(async({call})=>{
    const unauthorizedQr=await call('/api/v2/providers/whatsapp-personal/native/qr',{auth:false});
    assert.equal(unauthorizedQr.status,401);
    const unauthorizedRev=await call('/api/v2/providers/whatsapp-personal/native/revoke',{method:'POST',auth:false});
    assert.equal(unauthorizedRev.status,401);
  });
});

test('verified original W47 HTTP avatar read is real Owner-routed and cannot be unauthorized',async()=>{
  await hosted(async({call,actions})=>{
    const uri='/api/v2/providers/whatsapp-personal/native/avatar?remoteJid=555200%40s.whatsapp.net';
    const a=await call(uri);
    assert.equal(a.status,200);
    assert.equal(a.body.available,true);
    assert.equal(a.body.imageUrl,'https://pps.whatsapp.net/avatar');
    assert.equal(a.body.canSend,false);
    assert.equal(actions.at(-1),'READ_WHATSAPP_AVATAR');
    const blocked=await call(uri,{auth:false});
    assert.equal(blocked.status,401);
    assert.equal((await call('/api/v2/providers/whatsapp-personal/native/avatar')).status,422);
    assert.equal((await call(uri+'&principalRef=spoofed')).status,422);
    assert.equal((await call(uri+'&remoteJid=another')).status,422);
  });
});

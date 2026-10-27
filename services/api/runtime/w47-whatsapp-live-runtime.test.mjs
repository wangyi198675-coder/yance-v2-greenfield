import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLocalSessionAuthority} from './local-session.mjs';
import {createW47WhatsAppLiveRuntime} from './w47-whatsapp-live-runtime.mjs';
import {createNativeOwnerReadHttp} from './native-authoritative-reads.mjs';
const origin='http://127.0.0.1:44751';
test('actual W47+W44 SQLite+W25 SQLite+original W28 Controller mount read-only and require real W54 cookie; no fake QR',async()=>{
 const root=mkdtempSync(join(tmpdir(),'w47-native-owner-'));
 const authority=createLocalSessionAuthority();
 const binding='b'.repeat(64);
 const issued=authority.issueNativeWebView(binding);
 const nativeBoot={source:'W54_NATIVE_CURRENT_USER',verified:true,
  appLocalDataRoot:root,principalRef:'w54-local-current-user',
  installationRef:'w54-local-native-install',nativeRevocationGeneration:1};
 let runtime=null,server=null;
 try{
  runtime=await createW47WhatsAppLiveRuntime({
   nativeBoot,nativeSession:{binding},sessionAuthority:authority,
   webOrigin:origin,w55Executable:process.env.W55_SIGNAL_EXE||
    'C:\\local-only\\uninstalled-w55-do-not-open.exe'
  });
  assert.equal(typeof runtime.handler,'function');
  const contactGateway=createNativeOwnerReadHttp({sessionAuthority:authority,
   webOrigin:origin,resolveW54CurrentUser:runtime.resolveW54CurrentUser,
   readW24AuthorizedAccounts:runtime.readW24AuthorizedAccounts,
   readW24VerifiedContacts:runtime.readW24VerifiedContacts});
  server=createServer(async(req,res)=>{
   const url=new URL(req.url,'http://127.0.0.1');
   if(await contactGateway(req,res,url))return;
   if(await runtime.handler(req,res,url))return;
   res.writeHead(404);res.end();
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  const request=async(path,auth=true)=>{
   const response=await fetch(base+path,{headers:{
    origin, ...(auth?{cookie:issued.cookie.split(';')[0]}:{})
   }});
   return {status:response.status,body:await response.json()};
  };
  const denied=await request('/api/v2/providers/whatsapp-personal/native/status',false);
  assert.equal(denied.status,401);
  const status=await request('/api/v2/providers/whatsapp-personal/native/status');
  assert.equal(status.status,200);
  assert.equal(status.body.state,'WAITING_USER_AUTH');
  assert.equal(status.body.nativeSocketCreated,false);
  assert.equal(status.body.canSend,false);
  const qr=await request('/api/v2/providers/whatsapp-personal/native/qr');
  assert.equal(qr.status,409);
  const accounts=await request('/api/v2/contacts');
  assert.equal(accounts.status,200);
  assert.equal(accounts.body.authoritative,true);
  assert.equal(accounts.body.contacts.length,0);
  assert.equal(accounts.body.connectedAccountCount,0);
  authority.revokeAll();
  assert.equal((await request('/api/v2/providers/whatsapp-personal/native/status')).status,401);
 }finally{
  if(server)await new Promise(r=>server.close(r));
  runtime?.close();
  rmSync(root,{recursive:true,force:true,maxRetries:12,retryDelay:100});
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createLocalSessionAuthority} from './local-session.mjs';
import {createWebPrivateCloudByok} from './web-private-cloud-byok.mjs';
import {createWebPrivateCloudHttp} from './web-private-cloud-http.mjs';
import {createPrivateModelHttp} from './private-model-http.mjs';

test('WEB_LOCAL_PRIVATE first party Key store/rotate/revoke, same-origin CSRF, masked only, no spend or social authority',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'w47-web-private-byok-'));
 mkdirSync(join(dir,'profile'));
 const root=join(dir,'profile'),origin='http://127.0.0.1:44767';
 const authority=createLocalSessionAuthority();
 const s=authority.issueWebPrivate();
 const cookie='yance_web_private_session='+s.id,csrf=s.csrf;
 let stores=0,leases=0;
 const vault=new Map();
 const nativeKeyPort={
  status:async({provider})=>vault.get(provider)?{
   configured:!vault.get(provider).revoked,
   revoked:vault.get(provider).revoked,revision:vault.get(provider).revision
  }:{configured:false,revoked:false,revision:0},
  store:async({provider,secret,expectedRevision})=>{
   stores++;
   const old=vault.get(provider);
   if(old&&old.revision!==expectedRevision)throw {code:'STALE'};
   if(!old&&expectedRevision!==null)throw {code:'STALE'};
   const next={secret,revoked:false,revision:(old?.revision??0)+1};
   vault.set(provider,next);
   return {configured:true,revoked:false,revision:next.revision};
  },
  revoke:async({provider,expectedRevision})=>{
   const old=vault.get(provider);
   if(!old||old.revision!==expectedRevision)throw {code:'STALE'};
   const next={secret:null,revoked:true,revision:old.revision+1};
   vault.set(provider,next);
   return {configured:false,revoked:true,revision:next.revision};
  },
  withSecret:async({provider,expectedRevision},use)=>{
   leases++;
   const old=vault.get(provider);
   if(!old||old.revoked||old.revision!==expectedRevision)throw {code:'STALE'};
   return use(old.secret);
  }
 };
 const cloud=createWebPrivateCloudByok({appLocalDataRoot:root,nativeKeyPort});
 const keys=createWebPrivateCloudHttp({
  sessionAuthority:authority,webOrigin:origin,webCloudPort:cloud
 });
 const models=createPrivateModelHttp({
  sessionAuthority:authority,webOrigin:origin,localWebModelPort:null,
  webCloudModelPort:cloud
 });
 const srv=createServer((req,res)=>{
  const route=new URL(req.url,'http://127.0.0.1');
  void (route.pathname.endsWith('/cloud-keys')?keys:models)(req,res,route)
   .catch(()=>{res.writeHead(503);res.end('{}')});
 });
 await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+srv.address().port;
 const send=async(path,{method='GET',body,cookieValue=cookie,token=csrf,
  currentOrigin=origin}={})=>{
  const r=await fetch(base+path,{method,
   headers:{Cookie:cookieValue,Origin:currentOrigin,
    ...(method==='GET'?{}:{'content-type':'application/json',
     'x-yance-csrf':token})},
   ...(body!==undefined?{body:JSON.stringify(body)}:{})
  });
  return {status:r.status,text:await r.text()};
 };
 const parse=x=>JSON.parse(x.text);
 const fakeA=['sk-','or-v1-','FICTIONAL-W47-W55-WEB-TEST-ABC'].join('');
 const fakeB=['sk-','or-v1-','FICTIONAL-W47-W55-WEB-TEST-DEF'].join('');
 try{
  assert.equal((await send('/api/v2/private-brain/cloud-keys',{cookieValue:'invalid'})).status,401);
  assert.equal((await send('/api/v2/private-brain/cloud-keys',{currentOrigin:'https://malicious.test'})).status,403);
  let out=await send('/api/v2/private-brain/cloud-keys');
  assert.equal(out.status,200);
  assert.equal(parse(out).providers.length,2);
  assert.equal(parse(out).providers[0].configured,false);
  assert.equal((await send('/api/v2/private-brain/cloud-keys',{method:'POST',
   body:{provider:'OPENROUTER_USER_API',apiKey:fakeA},token:'0'.repeat(64)})).status,403);
  assert.equal(stores,0);
  out=await send('/api/v2/private-brain/cloud-keys',{method:'POST',
   body:{provider:'OPENROUTER_USER_API',apiKey:fakeA}});
  assert.equal(out.status,200);
  assert.equal(parse(out).revision,1);
  assert.ok(!out.text.includes(fakeA));
  assert.equal((await send('/api/v2/private-brain/model-selection',{method:'POST',
   body:{provider:'OPENROUTER_USER_API',modelId:'openai/gpt-4o-mini'}})).status,422);
  out=await send('/api/v2/private-brain/model-selection',{method:'POST',
   body:{provider:'OPENROUTER_USER_API',modelId:'openai/gpt-4o-mini',confirmPaidCost:true}});
  assert.equal(out.status,200);
  assert.equal((await cloud.current()).modelId,'openai/gpt-4o-mini');
  assert.equal((await cloud.principalModel()).cloudCredentialSource,'W55_NATIVE_WIN_CRED');
  const local=await send('/api/v2/private-brain/model-config');
  assert.equal(local.status,200);
  assert.equal(parse(local).selectedProvider,'OPENROUTER_USER_API');
  assert.equal(parse(local).cloudSources[0].status,'KEY_CONFIGURED');
  assert.ok(!local.text.includes(fakeA));
  let value;
  await cloud.withSecret({provider:'OPENROUTER',modelId:'openai/gpt-4o-mini',
   selectionEpoch:1,profile:{modelSelectionEpoch:1}},key=>{value=key});
  assert.equal(value,fakeA);value=null;
  assert.equal(leases,1);
  assert.equal((await send('/api/v2/private-brain/cloud-keys',{method:'POST',
   body:{provider:'OPENROUTER_USER_API',apiKey:fakeB,expectedRevision:200}})).status,409);
  out=await send('/api/v2/private-brain/cloud-keys',{method:'POST',
   body:{provider:'OPENROUTER_USER_API',apiKey:fakeB,expectedRevision:1}});
  assert.equal(parse(out).revision,2);
  assert.equal(await cloud.current(),null,'rotate invalidates old paid model consent');
  out=await send('/api/v2/private-brain/cloud-keys',{method:'DELETE',
   body:{provider:'OPENROUTER_USER_API',expectedRevision:2}});
  assert.equal(out.status,200);assert.equal(parse(out).revision,3);
  assert.equal(parse(out).revoked,true);
  assert.equal((await send('/api/v2/private-brain/model-config')).status,200);
  assert.equal(parse(await send('/api/v2/private-brain/model-config')).selectedProvider,'');
  assert.equal(stores,2,'stale revision rejected before W55 native write');
  authority.revokeAll();
  assert.equal((await send('/api/v2/private-brain/cloud-keys')).status,401);
  console.log('W47_WEB_BYOK_LOCAL_SESSION_NATIVE_W55_CONTRACT_QA '+JSON.stringify({
   realHttp:true,masked:true,modelSelection:true,explicitCostConsent:true,
   revisionCas:true,revoke:true,originalWinCredHost:false,
   fakeNativeTestPort:true,paidProviderCalls:0,socialSends:0
  }));
 }finally{
  await new Promise(ok=>srv.close(ok));
  rmSync(dir,{recursive:true,force:true,maxRetries:7,retryDelay:100});
 }
});

// W46 browser UAT ONLY. Uses W24 HTTP, W44 SQLite, W45 existing native service.
// Never expose this injected synthetic principal resolver beyond 127.0.0.1.
// No provider sender, no model, no real accounts, no production server.
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createW45DraftPort} from '../src/native-owner-bindings.mjs';
import {setupNativeStopLab} from './w46-w44-stop-lab.mjs';
const self=resolve(fileURLToPath(new URL('.',import.meta.url)),'../../..');
const native=process.env.YANCE_W24_NATIVE_DIR, budget=process.env.YANCE_W44_NATIVE_DIR;
const w45=process.env.YANCE_W45_MODULE;
if(!native||!budget||!w45)throw Error('EXACT_OWNER_SOURCE_PATHS_REQUIRED');
const load=async f=>import(pathToFileURL(f).href);
const {IdentityConsentService}=await load(join(native,'identity-consent.mjs'));
const {TAKEOVER_GET,TAKEOVER_POST,parseIdentityKey,createNativeTakeoverService}=await load(join(native,'takeover.mjs'));
const {createNativeTakeoverHttpHandler}=await load(join(native,'takeover-http.mjs'));
const {openEligibilityStore}=await load(join(budget,'index.mjs'));
const {createW24IdentityPorts}=await load(join(budget,'native-bridges.mjs'));
const {createPeopleTranslationReplyService}=await load(w45);
const contacts=JSON.parse(readFileSync(join(self,'design/nonproduction/approved-clickable-abc-bc/src/data/fixture.json'),'utf8')).contacts;
const ctx={tenant:'SYNTHETIC_TEST_ONLY',principal_id:'fake-owner-1',input_domain:'CONTACT'};
const identity=new IdentityConsentService();
const unique=new Set();
for(const c of contacts){
 if(c.tenant!==ctx.tenant||!c.account.startsWith('fixture-')||!c.peer_id.startsWith('fake-'))
   throw Error('SOURCE_IS_NOT_SYNTHETIC');
 const key=[c.tenant,c.account,c.channel].join('|');
 if(!unique.has(key)){
   identity.registerAccount(ctx,{tenant:c.tenant,account:c.account,
      channel:c.channel,binding_revision:c.binding_revision,principal_id:ctx.principal_id});
   unique.add(key);
 }
 identity.bindPeer(ctx,c);
}
const ports=createW24IdentityPorts({identityService:identity,trustedContext:ctx,
  readConsentEpoch:({k})=>identity.readConsentEpoch(ctx,k),
  authorizeOperator:({actor})=>actor===ctx.principal_id});
const temp=mkdtempSync(join(tmpdir(),'w46-original-bc-http-'));
const store=openEligibilityStore({path:join(temp,'w44.sqlite'),...ports});
// Test-only source composition: same W44 SQLite fixture file, NOT a new DB/system.
const stopLab=process.env.W46_STOP_TEST_LAB==='SYNTHETIC_ONLY'
 ?setupNativeStopLab({openEligibilityStore,path:join(temp,'w44.sqlite'),contacts})
 :null;
for(const c of contacts.slice(1,4)){
 store.grant({identity:c,scope:'CONTACT',actor:ctx.principal_id,
    expiresAt:Date.now()+300000,budgetUnits:3});
}
const service=createNativeTakeoverService({identityConsent:identity,custodyStore:store,
  authorizeTakeover:({trustedContext})=>trustedContext?.principal_id===ctx.principal_id});
const authHandler=createNativeTakeoverHttpHandler({
  service,resolveTrustedContext:()=>ctx}); // TEST-ONLY local resolver
const people=createPeopleTranslationReplyService(); // original W45, NO fake translation/Run
for(const c of contacts)await people.ingestInbound({identity:c,mid:c.last_message.provider_mid,
 original:c.last_message.original,targetLanguage:'zh-CN',
 source:{kind:'SYNTHETIC_FIXTURE',fixture_id:'B_C_W37_FROZEN_FIXTURE_ONLY'}});
const draftPort=createW45DraftPort({identityConsent:identity,
  trustedContext:ctx,peopleService:people});
const respond=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json',
 'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(body))};
const failureOnce=new Map();
const server=createServer(async(req,res)=>{
  try{
    // Synthetic failure injection MUST use existing W24 HTTP handler for real 409/422.
    // A PAUSED-shaped 202 response is a gateway-negative fixture only, not a real W43 Run.
    if(req.url===TAKEOVER_POST&&req.method==='POST'&&failureOnce.size){
      let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)throw Error('INVALID_TEST_BODY')}
      const parsed=JSON.parse(body),key=JSON.stringify([
        parsed?.identity?.tenant,parsed?.identity?.account,parsed?.identity?.channel,
        parsed?.identity?.peer_id,String(parsed?.identity?.binding_revision)]);
      const scenario=failureOnce.get(key);if(scenario)failureOnce.delete(key);
      if(scenario==='PENDING')return respond(res,202,{accepted:false,
        status:'AGNO_RUN_PAUSED_REQUIRES_APPROVAL',canSend:false});
      if(scenario==='HTTP_409')parsed.expectedEpoch+=1;
      if(scenario==='HTTP_422')delete parsed.expectedConsentEpoch;
      // Replay original real request headers into the original W24 HTTP contract.
      const request=Readable.from([Buffer.from(JSON.stringify(parsed))]);
      request.method=req.method;request.url=req.url;request.headers=req.headers;
      request.socket={remoteAddress:req.socket.remoteAddress};
      return authHandler(request,res);
    }
    if(req.url?.startsWith('/api/v2/identity-consent/'))return authHandler(req,res);
    if(req.socket.remoteAddress!=='127.0.0.1'&&req.socket.remoteAddress!=='::1')return respond(res,403,{error:'LOOPBACK_ONLY'});
    if(req.headers['x-yance-environment']!=='synthetic-only')return respond(res,403,{error:'TEST_ENV_REQUIRED'});
    const url=new URL(req.url||'/', 'http://127.0.0.1');
    if(url.pathname==='/w46-native-test/managed-stop'){
      if(!stopLab)return respond(res,503,{error:'TRUSTED_STOP_SERVICE_NOT_CONNECTED'});
      if(req.method==='GET'){
        if(url.searchParams.size!==2||!url.searchParams.has('k')||!url.searchParams.has('scope'))
          return respond(res,422,{error:'STOP_FULL_K_AND_SCOPE_REQUIRED'});
        const k=parseIdentityKey(url.searchParams.get('k'));
        return respond(res,200,stopLab.read(k,url.searchParams.get('scope')));
      }
      if(req.method==='POST'){
        let data='';for await(const chunk of req){data+=chunk;if(data.length>2048)throw Error('STOP_BODY_TOO_LARGE')}
        const parsed=JSON.parse(data);
        if(!parsed||Object.keys(parsed).sort().join(',')!=='identity,scope')
          return respond(res,422,{error:'SERVER_DERIVES_ACTOR_AND_AUTHORITY_CAS'});
        const out=stopLab.stop(parsed.identity,parsed.scope);
        return respond(res,200,out); // PENDING is data, never success.
      }
      return respond(res,405,{error:'METHOD_NOT_ALLOWED'});
    }
    if(url.pathname==='/w46-native-test/managed-stop-arm'&&req.method==='POST'){
      if(!stopLab)return respond(res,503,{error:'STOP_LAB_DISABLED'});
      let data='';for await(const chunk of req){data+=chunk;if(data.length>2048)throw Error('INVALID_ARM_BODY')}
      const {identity:k,intentId}=JSON.parse(data);
      if(typeof intentId!=='string'||!intentId.startsWith('fake-'))return respond(res,422,{error:'ONLY_FAKE_TEST_INTENT'});
      stopLab.armPending(k,intentId);
      return respond(res,200,{armed:true,syntheticOnly:true,delivery:'DISABLED'});
    }
    if(url.pathname==='/w46-native-test/negative-once'&&req.method==='POST'){
      let data='';for await(const chunk of req){data+=chunk;if(data.length>2048)throw Error('NEGATIVE_SCENARIO_TOO_LARGE')}
      const {identity:k,scenario}=JSON.parse(data);
      if(!['HTTP_409','HTTP_422','PENDING'].includes(scenario))throw Error('UNKNOWN_NEGATIVE_SCENARIO');
      const current=identity.assertCurrent(ctx,k);
      if(!current?.identity_key)throw Error('NOT_A_CURRENT_SYNTHETIC_CONTACT');
      const key=JSON.stringify([k.tenant,k.account,k.channel,k.peer_id,String(k.binding_revision)]);
      failureOnce.set(key,scenario);
      return respond(res,200,{armed:true,scenario,delivery:'NOT_REQUESTED'});
    }
    if(url.pathname==='/w46-native-test/message'&&req.method==='GET'){
      const k=parseIdentityKey(url.searchParams.get('k')),mid=url.searchParams.get('mid');
      return respond(res,200,draftPort.get(k,mid));
    }
    if(url.pathname==='/w46-native-test/draft'&&req.method==='POST'){
      let data='';for await(const chunk of req){data+=chunk;if(data.length>5000)throw Error('PAYLOAD_TOO_LARGE')}
      const {identity:who,mid,candidateId}=JSON.parse(data);
      return respond(res,200,draftPort.draftCandidate(who,mid,candidateId));
    }
    return respond(res,404,{error:'NOT_FOUND'});
  }catch(e){return respond(res,409,{error:String(e.code||e.message||'INVALID_REQUEST')})}
});
const close=()=>{server.close(()=>{try{stopLab?.close()}finally{store.close();rmSync(temp,{recursive:true,force:true})}})};
process.on('SIGINT',close);process.on('SIGTERM',close);
server.listen(47181,'127.0.0.1',()=>{
  console.log('W46_TEST_ONLY_HTTP_READY 127.0.0.1:47181 contacts='+contacts.length);
});

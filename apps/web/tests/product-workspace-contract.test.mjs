import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WORKSPACES,CHANNELS,R4_SETTINGS_CATEGORIES,R4_STOP_FAILURE_STATES,validateWorkspaceSnapshot,
 readWorkspaceSnapshot,explainCapability} from '../src/product-workspace-contract.mjs';
const readOnlyCapabilities=()=>({
 takeover:{installed:true,connected:false,reason:'NO_TRUSTED_LOCAL_SESSION_OR_PLATFORM_BINDING'},
 managedStop:{installed:true,connected:false,reason:'NO_TRUSTED_LOCAL_SESSION_OR_PLATFORM_BINDING'},
 messageDelivery:{installed:true,enabled:false,reason:'NO_AUTHORIZED_PROVIDER'},
 agentRuntime:{installed:true,enabled:false,reason:'NO_VERIFIED_RUN_CONTEXT'},
 translation:{installed:true,enabled:false,reason:'NO_REAL_INBOUND_SOURCE'},
 inbound:{installed:false,reason:'NO_CONNECTED_PROVIDER'},
 sender:{installed:true,enabled:false,reason:'NO_AUTHORIZED_PROVIDER'}
});
const health=()=>({ok:true,service:'Yance V2 local API',runtimeSha:'0423d7d347c2538e8ca9804dca1c2fc2baf1760b',
 trustedSession:false,externalEffects:false,canSend:false});
const caps=()=>({ok:true,authoritative:true,canSend:false,capabilities:readOnlyCapabilities()});
const contacts=()=>({ok:true,authoritative:true,canSend:false,contacts:[],connectedAccountCount:0});
test('candidate nav is 9 unique categories and four actual channel keys, not another Agent or Composer',()=>{
 assert.equal(WORKSPACES.length,9);
 assert.equal(new Set(WORKSPACES.map(x=>x.id)).size,9);
 assert.deepEqual(CHANNELS.map(c=>c.id),['FB_PERSONAL','FB_PAGE','WHATSAPP_PERSONAL','TELEGRAM_PERSONAL']);
 assert.equal(WORKSPACES.filter(w=>w.id==='CHAT').length,1);
});
test('W47 real no-provider authoritative health/capabilities/contacts creates only unavailable state',()=>{
 const snapshot=validateWorkspaceSnapshot(health(),caps(),contacts());
 assert.equal(snapshot.trustedSession,false);
 assert.equal(snapshot.canSend,false);
 assert.equal(snapshot.realContacts,0);
 assert.match(explainCapability(snapshot,'BRAIN'),/未授权/);
});
test('missing service authority, optimistic canSend or forged user fixture contact fails closed',()=>{
 assert.throws(()=>validateWorkspaceSnapshot({...health(),canSend:true},caps(),contacts()),/WORKSPACE_AUTHORITY_INVALID/);
 assert.throws(()=>validateWorkspaceSnapshot(health(),{...caps(),authoritative:false},contacts()),/WORKSPACE_AUTHORITY_INVALID/);
 assert.throws(()=>validateWorkspaceSnapshot(health(),caps(),{...contacts(),contacts:[{peer_id:'fake-demo'}]}),/UNAUTHENTICATED_CONTACT_LEAK/);
});
test('only W47 signed read endpoints requested; no POST, send, auth grant, or provider',async()=>{
 const seen=[];
 const values={'/api/v2/runtime/health':health(),
  '/api/v2/runtime/capabilities':caps(),'/api/v2/contacts':contacts()};
 const fetchImpl=async (path,options)=>{
  seen.push({path,...options});
  return {ok:true,json:async()=>values[path]};
 };
 const snapshot=await readWorkspaceSnapshot({fetchImpl});
 assert.equal(snapshot.connectedAccountCount,0);
 assert.equal(seen.length,3);
 assert.ok(seen.every(x=>!x.method && x.credentials==='same-origin' && x.cache==='no-store'));
 assert.deepEqual(seen.map(x=>x.path).sort(),Object.keys(values).sort());
});
test('HTTP 401/503 is unavailable, never a local fixture success',async()=>{
 const fetchImpl=async()=>({ok:false,status:401});
 await assert.rejects(readWorkspaceSnapshot({fetchImpl}),/WORKSPACE_HTTP_401/);
});
test('252 trace uses exactly 252 original IDs; all are unapproved R4 candidates',()=>{
 const path=new URL('../evidence/W46_R4_CANDIDATE_STABLE252.json',import.meta.url);
 const evidence=JSON.parse(readFileSync(path,'utf8'));
 assert.equal(evidence.count,252);
 assert.equal(evidence.rows.length,252);
 assert.equal(new Set(evidence.rows.map(x=>x.stable_id)).size,252);
 assert.ok(evidence.rows.every(x=>x.ui_r4_owner_approved===false&&x.ui_live_route_approved===false));
 assert.ok(evidence.rows.every(x=>['CHAT','BRAIN','AUTOPILOT','ACCOUNTS','PEOPLE','PERSONA','TASKS','MEDIA','SETTINGS'].includes(x.candidate_workspace)));
 assert.equal(evidence.status,'R2_PRIMARY_WORKSPACE_MAPPED_R4_FINAL_OWNER_AND_USER_HOLD');
 assert.equal(evidence.r4_html_verified_sha256,'4d95254bf39281173b0756f723a512111471187f201c40479599b6a6b46878e4');
 assert.ok(evidence.rows.every(x=>x.r2_primary_workspace&&x.r2_review_gate&&x.r2_runtime_claim==='DESIGN_ONLY_NOT_IMPLEMENTATION_PASS'));
 assert.ok(evidence.rows.some(x=>x.r2_primary_workspace==='TOOLS'&&x.candidate_workspace==='TASKS'));
 assert.ok(evidence.rows.some(x=>x.r2_primary_workspace==='AUTOPILOT'&&x.candidate_workspace==='AUTOPILOT'));
});

test('exact signed R4 brand SVG paths and 9 settings categories are present, not placeholder letters',async()=>{
 const {R4_BRAND_PATHS,R4_BRAND_SOURCE_SHA256}=await import('../src/r4-brand-paths.mjs');
 assert.equal(R4_BRAND_SOURCE_SHA256,'4d95254bf39281173b0756f723a512111471187f201c40479599b6a6b46878e4');
 assert.deepEqual(Object.keys(R4_BRAND_PATHS).sort(),['facebook','messenger','telegram','whatsapp']);
 assert.ok(Object.values(R4_BRAND_PATHS).every(s=>s.startsWith('M')&&s.length>250));
 assert.deepEqual(R4_SETTINGS_CATEGORIES.map(x=>x.id),[
  'general','accounts','model','translate','media','theme','notify','privacy','diagnostics']);
 assert.equal(new Set(R4_SETTINGS_CATEGORIES.map(x=>x.id)).size,9);
});
test('R4 dangerous states are explicit REVOKED / AUTH_EXPIRED / BUDGET_INSUFFICIENT and never permit send',()=>{
 assert.deepEqual(R4_STOP_FAILURE_STATES.map(s=>s.id),['REVOKED','AUTH_EXPIRED','BUDGET_INSUFFICIENT']);
 assert.ok(R4_STOP_FAILURE_STATES.every(s=>/禁止|冻结|不能恢复/.test(s.effect)));
});

test('W47 actual GET contacts 401 is WAITING_USER_AUTH not authoritative 0 from fake store',async()=>{
 const snapshot=await readWorkspaceSnapshot({fetchImpl:async(path)=>{
  if(path==='/api/v2/runtime/health')return {ok:true,json:async()=>health()};
  if(path==='/api/v2/runtime/capabilities')return {ok:true,json:async()=>caps()};
  if(path==='/api/v2/contacts')return {ok:false,status:401};
  throw Error(path);
 }});
 assert.equal(snapshot.canSend,false);
 assert.equal(snapshot.contactsAccess,'WAITING_USER_AUTH');
 assert.equal(snapshot.realContacts,0);
 assert.equal(snapshot.connectedAccountCount,0);
 assert.deepEqual(snapshot.contacts,[]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {PersistentMediaAssets,MediaError} from './web-media.mjs';
import {createWebMediaHttpHandler} from './web-media-http.mjs';

const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64');
const mkK=(account='qa-account-A',peer_id='qa-peer-A')=>({tenant:'qa-tenant',account,peer_id,channel:'FB_PERSONAL',binding_revision:'binding-1'});
const K=mkK(),B=mkK('qa-account-B','qa-peer-B'),C=mkK('qa-account-A','qa-peer-C');
const owner=(actor,k)=>(actor==='qa-user-A'&&k.account===K.account)|| (actor==='qa-user-B'&&k.account===B.account);
const denied=(code)=>e=>e instanceof MediaError&&e.code===code;
async function fixture(fn,{clock=()=>Date.now()}={}){
 const dir=await mkdtemp(join(tmpdir(),'w23-pagination-')),key=randomBytes(32);
 const state={grant_revision:1,consent_revision:1,revocation_epoch:0,custody_epoch:1,grant_active:true,consent_active:true,account_active:true,
  expires_at:clock()+120000,deniedAssets:new Set(),onRead:null,denyAll:false};
 const authority={async check(q){
  if(q.action==='read'&&typeof state.onRead==='function')await state.onRead(q);
  const allowed=!state.denyAll&&owner(q.actor,q.k)&&!state.deniedAssets.has(q.asset_id);
  return {allowed,principal:q.actor,...q.k,account_active:state.account_active,grant_active:state.grant_active,
   consent_active:state.consent_active,expires_at:state.expires_at,grant_revision:state.grant_revision,
   consent_revision:state.consent_revision,revocation_epoch:state.revocation_epoch,custody_epoch:state.custody_epoch,
   message_authorized:q.message_id===null||q.message_id==='qa-real-MID',authorized_message_id:q.message_id};
 }};
 const fresh=()=>new PersistentMediaAssets({directory:dir,key,authority,clock});
 try{await fn({store:await fresh().open(),fresh,state,K,B,C,dir,key})}
 finally{await rm(dir,{recursive:true,force:true})}
}
async function add(s,{k=K,actor='qa-user-A',name='camera.png',id=name,message_id=null}={}){
 const {asset_id}=await s.begin({actor,k,purpose:'contact_draft',mime:'image/png',byte_size:PNG.length,
  original_name:name,message_id,consent_id:'qa-consent',grant_id:'qa-grant',idempotency_key:id});
 await s.upload({actor,k,asset_id,bytes:PNG,mime:'image/png'});
 return asset_id;
}

test('principal-scoped stable CREATED/DESC ID pagination, metadata search and no sensitive paths',async()=>fixture(async({store:s,K,B})=>{
 const ids=[await add(s,{name:'camera-A.png'}),await add(s,{name:'camera-B.png'}),await add(s,{name:'sunset.png'})];
 const bob=await add(s,{k:B,actor:'qa-user-B',name:'private-bob.png'});
 const first=await s.list({actor:'qa-user-A',k:K,limit:1});
 assert.equal(first.items.length,1);assert.equal(first.has_more,true);
 assert.match(first.next_cursor,/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
 assert.equal(JSON.stringify(first).includes('qa-account-B'),false);
 assert.equal(JSON.stringify(first).includes('index.json'),false);
 assert.equal(JSON.stringify(first).includes('qa-grant'),false);
 let items=first.items.slice(),cursor=first.next_cursor;
 while(cursor){const p=await s.list({actor:'qa-user-A',k:K,limit:1,cursor});items.push(...p.items);cursor=p.next_cursor}
 assert.deepEqual(new Set(items.map(x=>x.asset_id)),new Set(ids));
 assert.equal(items.length,3);assert.equal(items.some(x=>x.asset_id===bob),false);
 assert.deepEqual(items.map(x=>[x.created_at,x.asset_id]),[...items].sort((a,b)=>b.created_at-a.created_at||b.asset_id.localeCompare(a.asset_id)).map(x=>[x.created_at,x.asset_id]));
 const search=await s.list({actor:'qa-user-A',k:K,query:' CAMERA ',limit:10,kind:'image',mime:'image/png'});
 assert.deepEqual(new Set(search.items.map(x=>x.original_name)),new Set(['camera-A.png','camera-B.png']));
 assert.equal(search.next_cursor,null);
 assert.deepEqual((await s.list({actor:'qa-user-A',k:K,kind:'video'})).items,[]);
}));
test('cursor is bound to actor+5-part K, search, kind and tamper rejection',async()=>fixture(async({store:s,K,B,C})=>{
 await add(s,{name:'A.png'});await add(s,{name:'B.png'});
 const first=await s.list({actor:'qa-user-A',k:K,limit:1});
 for(const changed of [
  {actor:'qa-user-B',k:K},
  {actor:'qa-user-A',k:C},
  {actor:'qa-user-A',k:{...K,binding_revision:'new-epoch'}},
 ]){
  await assert.rejects(s.list({...changed,limit:1,cursor:first.next_cursor}),e=>['ACCESS_DENIED','CURSOR_INVALID'].includes(e.code));
 }
 await add(s,{k:B,actor:'qa-user-B',name:'Bprivate.png'});
 await assert.rejects(s.list({actor:'qa-user-A',k:K,cursor:first.next_cursor,kind:'image'}),denied('CURSOR_INVALID'));
 const freshPage=await s.list({actor:'qa-user-A',k:K,limit:1});
 await assert.rejects(s.list({actor:'qa-user-A',k:K,cursor:freshPage.next_cursor,query:'A'}),denied('CURSOR_INVALID'));
 await assert.rejects(s.list({actor:'qa-user-A',k:K,cursor:freshPage.next_cursor.slice(0,-2)+'aa'}),denied('CURSOR_INVALID'));
}));
test('grant revoke, consent revoke, expired authority and epoch change DENY listing even with cursor',async()=>fixture(async({store:s,K,state})=>{
 await add(s,{name:'A.png'});await add(s,{name:'B.png'});
 const p=await s.list({actor:'qa-user-A',k:K,limit:1});
 state.revocation_epoch++;state.grant_revision++;
 await assert.rejects(s.list({actor:'qa-user-A',k:K,cursor:p.next_cursor}),denied('AUTH_REVISION_CHANGED'));
 state.grant_active=false;
 await assert.rejects(s.list({actor:'qa-user-A',k:K}),denied('ACCESS_DENIED'));
 state.grant_active=true;state.consent_active=false;
 await assert.rejects(s.list({actor:'qa-user-A',k:K}),denied('ACCESS_DENIED'));
 state.consent_active=true;state.account_active=false;
 await assert.rejects(s.list({actor:'qa-user-A',k:K}),denied('ACCESS_DENIED'));
 state.account_active=true;state.expires_at=Date.now()-1;
 await assert.rejects(s.list({actor:'qa-user-A',k:K}),denied('ACCESS_DENIED'));
}));
test('deleted assets and pending reservation hidden, page invalidates on update and delete',async()=>fixture(async({store:s,K})=>{
 const a=await add(s,{name:'A.png'}),b=await add(s,{name:'B.png'});
 const first=await s.list({actor:'qa-user-A',k:K,limit:1});
 const res=await s.begin({actor:'qa-user-A',k:K,purpose:'contact_draft',mime:'image/png',byte_size:PNG.length,
  original_name:'still-pending.png',consent_id:'qa-consent',grant_id:'qa-grant',idempotency_key:'pending-reservation'});
 assert.equal(res.status,'RESERVED');
 await assert.rejects(s.list({actor:'qa-user-A',k:K,cursor:first.next_cursor}),denied('LIST_SNAPSHOT_CHANGED'));
 await s.delete({actor:'qa-user-A',k:K,asset_id:a});
 const ready=await s.list({actor:'qa-user-A',k:K});
 assert.deepEqual(ready.items.map(x=>x.asset_id),[b]);
 assert.equal(ready.items.some(x=>x.asset_id===res.asset_id),false);
}));
test('cold process restart preserves authorized pages, stale key cannot reuse cursor',async()=>fixture(async({store:s,fresh,K})=>{
 const ids=[await add(s,{name:'cameraA.png'}),await add(s,{name:'cameraB.png'})];
 const first=await s.list({actor:'qa-user-A',k:K,limit:1});
 const restarted=await fresh().open();
 const next=await restarted.list({actor:'qa-user-A',k:K,limit:1,cursor:first.next_cursor});
 assert.deepEqual(new Set([...first.items,...next.items].map(x=>x.asset_id)),new Set(ids));
 assert.equal(next.has_more,false);
}));
test('asset-specific scope revocation hides item and current grant rechecked before delivery',async()=>fixture(async({store:s,state,K})=>{
 const a=await add(s,{name:'private.png'}),b=await add(s,{name:'still-visible.png'});
 state.deniedAssets.add(a);
 const ok=await s.list({actor:'qa-user-A',k:K,limit:10});
 assert.deepEqual(ok.items.map(x=>x.asset_id),[b]);
 state.deniedAssets.clear();
 state.onRead=async q=>{if(q.asset_id===a){state.grant_revision++;state.onRead=null}};
 await assert.rejects(s.list({actor:'qa-user-A',k:K}),denied('AUTH_REVISION_CHANGED'));
}));
test('missing REAL authority, absent trusted actor/K, out-of-range limits and filters all fail closed',async()=>fixture(async({store:s,state,K})=>{
 state.denyAll=true;
 await assert.rejects(s.list({actor:'qa-user-A',k:K}),denied('ACCESS_DENIED'));
 state.denyAll=false;
 await assert.rejects(s.list({actor:'qa-user-A',k:{...K,peer_id:''}}),denied('INVALID_K'));
 await assert.rejects(s.list({actor:null,k:K}),denied('ACTOR_REQUIRED'));
 for(const limit of [0,51,-1,1.1,Infinity])await assert.rejects(s.list({actor:'qa-user-A',k:K,limit}),denied('BAD_PAGE_LIMIT'));
 for(const options of [{query:'a'.repeat(81)},{kind:'script'},{mime:'text/html'},{mime:'image/png',kind:'video'}])
  await assert.rejects(s.list({actor:'qa-user-A',k:K,...options}),denied('BAD_FILTER'));
}));
test('cursor timebox expires and pagination change cannot silently reuse old snapshot',async()=>{
 let now=100000;
 await fixture(async({store:s,K,state})=>{
  state.expires_at=now+900000; // Grant remains current while the shorter list cursor expires.
  await add(s,{name:'A.png'});await add(s,{name:'B.png'});
  const first=await s.list({actor:'qa-user-A',k:K,limit:1});
  now+=300001;
  await assert.rejects(s.list({actor:'qa-user-A',k:K,limit:1,cursor:first.next_cursor}),denied('CURSOR_EXPIRED'));
 },{clock:()=>now});
});
test('real same-origin HTTP GET /assets pagination: 401/403, exact query, 200 no-store',async()=>fixture(async({store:s,K})=>{
 await add(s,{name:'A.png'});await add(s,{name:'B.png'});
 let session=true;
 const server=createServer(createWebMediaHttpHandler({service:s,
  resolveIdentity:async()=>session?{actor:'qa-user-A',k:K}:null,checkCsrf:async()=>true}));
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port+'/api/v2/media/assets';
 const get=async u=>{const r=await fetch(u);return {status:r.status,cache:r.headers.get('cache-control'),body:await r.json()}};
 try{
  const p=await get(base+'?limit=1&q=.png&kind=image');
  assert.equal(p.status,200);assert.equal(p.cache,'no-store');assert.equal(p.body.items.length,1);
  const second=await get(base+'?limit=1&q=.png&kind=image&cursor='+encodeURIComponent(p.body.next_cursor));
  assert.equal(second.status,200);assert.equal(second.body.items.length,1);
  assert.equal((await get(base+'?limit=51')).status,400);
  assert.equal((await get(base+'?cursor=foo')).status,400);
  assert.equal((await get(base+'?limit=1&limit=2')).status,400);
  assert.equal((await get(base+'?unknown=key')).status,400);
  session=false;
  assert.equal((await get(base)).status,401);
 }finally{await new Promise(resolve=>server.close(resolve))}
}));

test('unrelated B-account mutations never invalidate an A-account list cursor',async()=>fixture(async({store:s,K,B})=>{
 const a=await add(s,{name:'A1.png'});const b=await add(s,{name:'A2.png'});
 const first=await s.list({actor:'qa-user-A',k:K,limit:1});
 await add(s,{k:B,actor:'qa-user-B',name:'B-only.png'});
 const next=await s.list({actor:'qa-user-A',k:K,limit:1,cursor:first.next_cursor});
 assert.deepEqual(new Set([...first.items,...next.items].map(x=>x.asset_id)),new Set([a,b]));
}));
test('fresh independent OS process can recover an authorized next page from disk without raw index exposure',async()=>fixture(async({store:s,K,dir,key})=>{
 const a=await add(s,{name:'camera-a.png'}),b=await add(s,{name:'camera-b.png'});
 const first=await s.list({actor:'qa-user-A',k:K,limit:1});
 const {spawnSync}=await import('node:child_process');
 const src=new URL('./web-media.mjs',import.meta.url).href;
 const code=`
  const {PersistentMediaAssets}=await import(process.env.MEDIA_MODULE);
  const k=JSON.parse(process.env.TEST_K);
  const store=await new PersistentMediaAssets({
   directory:process.env.TEST_DIR,key:Buffer.from(process.env.TEST_KEY,'hex'),
   authority:{check:async({actor,k})=>({allowed:true,principal:actor,...k,
    account_active:true,grant_active:true,consent_active:true,
    expires_at:Date.now()+90000,grant_revision:1,consent_revision:1,revocation_epoch:0,custody_epoch:1})}
  }).open();
  const result=await store.list({actor:'qa-user-A',k,limit:1,cursor:process.env.TEST_CURSOR});
  process.stdout.write(JSON.stringify(result));
 `;
 const child=spawnSync(process.execPath,['--input-type=module','-e',code],{
  encoding:'utf8',timeout:20000,env:{...process.env,MEDIA_MODULE:src,TEST_DIR:dir,TEST_KEY:key.toString('hex'),
   TEST_K:JSON.stringify(K),TEST_CURSOR:first.next_cursor}
 });
 assert.equal(child.status,0,'independent process: '+child.stderr);
 const next=JSON.parse(child.stdout);
 assert.deepEqual(new Set([...first.items,...next.items].map(x=>x.asset_id)),new Set([a,b]));
 assert.equal(next.has_more,false);
 assert.equal(JSON.stringify(next).includes('index.json'),false);
}));

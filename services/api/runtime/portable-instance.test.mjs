import test,{after} from 'node:test';
import {request as httpRequest} from 'node:http';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=fileURLToPath(new URL('.',import.meta.url));
const root=resolve(here,'../../..');
const sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const folder=mkdtempSync(join(tmpdir(),'yance-w47-portability-'));
const procset=new Set();
after(()=>{for(const child of procset)if(!child.killed)child.kill();rmSync(folder,{recursive:true,force:true})});
const rawHost=(port,host)=>new Promise((ok,bad)=>{const req=httpRequest({hostname:'127.0.0.1',port,path:'/api/v2/runtime/health',headers:{Host:host}},res=>{res.resume();res.once('end',()=>ok(res.statusCode))});req.on('error',bad);req.end()});
function pkg(name,{manifest=true}={}){
 const path=join(folder,name);mkdirSync(path);
 const runtimeDir=join(path,'runtime');
 const nativeMediaDir=join(path,'src','domains','file-attachment');
 mkdirSync(runtimeDir,{recursive:true});mkdirSync(nativeMediaDir,{recursive:true});
 for(const file of ['server.mjs','runtime-config.mjs','runtime-provenance.mjs','local-session.mjs','local-operator-console.mjs','private-brain-http.mjs','private-python-port.mjs','private-native-ledger-port.mjs','private-model-http.mjs','native-authoritative-reads.mjs','native-provider-gateway.mjs','native-message-reads.mjs','native-pinned-web-assets.mjs','native-private-startup.mjs','web-private-local-qwen.mjs','web-private-cloud-byok.mjs','web-private-cloud-http.mjs','w55-web-native-stdio.mjs','w54-native-child-frame.mjs','w54-native-webview-session.mjs','w47-w43-private-child.py',
 'w47-w23-media-bridge.mjs','w47-native-settings-capabilities.mjs']){
  copyFileSync(join(here,file),join(runtimeDir,file));
 }
 // Original W23 native relative modules are packaged unchanged, not mocked.
 for(const file of ['web-media.mjs','web-media-http.mjs'])
  copyFileSync(resolve(here,'../src/domains/file-attachment',file),join(nativeMediaDir,file));
 if(manifest)writeFileSync(join(runtimeDir,'runtime-build.json'),JSON.stringify({
  format:1,product:'YanceV2',source_sha:sourceSha
 }));
 return join(runtimeDir,'server.mjs');
}
const exe=process.execPath;
async function boot(server,{webOrigin,port='0',mode='installed'}={}){
 const child=spawn(exe,[server],{windowsHide:true,env:{...process.env,
  YANCE_W47_RUNTIME_MODE:mode,YANCE_W47_API_PORT:port,YANCE_W47_WEB_ORIGIN:webOrigin
 }});
 procset.add(child);
 let all='';
 const exitPromise=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
 const readyPromise=new Promise((resolve,reject)=>{
  const id=setTimeout(()=>reject(Error('W47_INSTANCE_BOOT_TIMEOUT '+all)),7500);
  child.stdout.on('data',data=>{
   all+=String(data);
   const line=all.split(/\r?\n/).find(x=>x.includes('"event":"V2_API_READY"'));
   if(line){clearTimeout(id);try{resolve(JSON.parse(line))}catch(e){reject(e)}}
  });
  child.once('exit',code=>{clearTimeout(id);reject(Error('W47_INSTANCE_FAILED_EXIT_'+code+' '+all))});
  child.on('error',reject);
 });
 return {child,exitPromise,readyPromise};
}
const call=async(port,path,init)=>{
 const r=await fetch('http://127.0.0.1:'+port+path,init);
 const json=await r.json();return {status:r.status,json,headers:r.headers};
};
test('two distinct installed instances without fixed API port or Git; no cross-instance origin trust',async()=>{
 const a=await boot(pkg('user-a'),{webOrigin:'http://127.0.0.1:49071'});
 const b=await boot(pkg('user-b'),{webOrigin:'http://127.0.0.1:49072'});
 const [aa,bb]=await Promise.all([a.readyPromise,b.readyPromise]);
 assert.equal(aa.runtimeMode,'installed');assert.equal(bb.runtimeMode,'installed');
 const pa=Number(new URL(aa.url).port),pb=Number(new URL(bb.url).port);
 assert.ok(pa>0&&pb>0&&pa!==pb);
 const [ha,hb]=await Promise.all([call(pa,'/api/v2/runtime/health'),call(pb,'/api/v2/runtime/health')]);
 for(const [h,p] of [[ha,pa],[hb,pb]]){
  assert.equal(h.status,200);assert.equal(h.json.apiPort,p);
  assert.equal(h.json.runtimeSha,sourceSha);
  assert.equal(h.json.trustedSession,false);assert.equal(h.json.canSend,false);
  assert.equal(h.json.externalEffects,false);
  assert.equal(h.json.realContacts,null);
  assert.equal(h.json.countsAuthoritative,false);
  assert.equal(h.json.runtimeMode,'installed');
 }
 assert.equal((await call(pa,'/api/v2/contacts')).status,401);
 assert.equal((await call(pb,'/api/v2/contacts')).status,401);
 assert.equal((await call(pa,'/api/v2/runtime/health',{headers:{Origin:'http://127.0.0.1:49072'}})).status,403);
 assert.equal((await call(pb,'/api/v2/runtime/health',{headers:{Origin:'http://127.0.0.1:49071'}})).status,403);
 assert.equal(await rawHost(pa,'127.0.0.1:'+pb),403);
 assert.equal(await rawHost(pb,'127.0.0.1:'+pa),403);
 for(const [port,origin] of [[pa,'http://127.0.0.1:49071'],[pb,'http://127.0.0.1:49072']]){
  for(const path of ['/api/v2/identity-consent/takeover-state','/api/v2/managed-stop']){
   assert.equal((await call(port,path,{headers:{Origin:origin,'X-Yance-Trusted':'true'}})).status,401);
  }
  for(const path of ['/api/v2/identity-consent/takeover','/api/v2/managed-stop']){
   assert.equal((await call(port,path,{method:'POST',headers:{Origin:origin,
    'content-type':'application/json','X-Yance-Trusted':'true'},body:JSON.stringify({
      actor:'admin',principal:'claimed-admin',scope:'GLOBAL',grant:true
    })})).status,401);
  }
  assert.equal((await call(port,'/api/v2/send',{method:'POST',headers:{Origin:origin},
   body:JSON.stringify({authorized:true})})).status,403);
  assert.equal((await call(port,'/api/v2/agent/run',{method:'POST',headers:{Origin:origin},
   body:'{}'})).status,403);
  assert.equal((await call(port,'/w46-native-test/message')).status,410);
 }
 for(const c of [a.child,b.child])c.kill();
 for(const x of [a.exitPromise,b.exitPromise])await x;
 console.log('W47_PER_INSTALL_2_INSTANCES_LOOPBACK_PASS '+JSON.stringify({portA:pa,portB:pb,
  sha:sourceSha,accountsA:0,accountsB:0,writesAllowed:0,mode:'nonproduction-test'}));
});
test('installed startup rejects absent signed build provenance, no fabricated SHA',async()=>{
 const server=pkg('no-manifest',{manifest:false});
 const c=spawn(exe,[server],{windowsHide:true,env:{...process.env,
  YANCE_W47_RUNTIME_MODE:'installed',YANCE_W47_API_PORT:'0',
  YANCE_W47_WEB_ORIGIN:'http://127.0.0.1:49073'
 }});
 let err='';c.stderr.on('data',x=>err+=String(x));
 const code=await new Promise(resolve=>c.once('exit',resolve));
 assert.notEqual(code,0);assert.match(err,/W47_INSTALLED_BUILD_MANIFEST_REQUIRED/);
});

// On-demand ACTUAL Windows W09 compiled B+C assets + W47 Node API on
// ONE pinned port. No authenticated W54 renderer/cookie/paid account implied.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,copyFileSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer as netServer} from 'node:net';
import {verifyRealInstalledW54OnW47Origin} from './native-webview-cdp-qa.mjs';
import {fileURLToPath} from 'node:url';
const H=b=>createHash('sha256').update(b).digest('hex');
const source=fileURLToPath(new URL('.',import.meta.url));
const git=resolve(source,'../../..');
const SHA=execFileSync('git',['rev-parse','HEAD'],{cwd:git,encoding:'utf8'}).trim();
const modules=['server.mjs','runtime-config.mjs','runtime-provenance.mjs',
 'local-session.mjs','local-operator-console.mjs','private-brain-http.mjs',
 'private-python-port.mjs','private-native-ledger-port.mjs','private-model-http.mjs',
 'native-authoritative-reads.mjs','native-provider-gateway.mjs',
 'native-message-reads.mjs','native-pinned-web-assets.mjs',
 'w54-native-child-frame.mjs','w54-native-webview-session.mjs','w47-w43-private-child.py'];
test('real W09 compiled B+C + W47 API have one origin, API is JSON NOT HTML, session still 401',async t=>{
 const dist=process.env.YANCE_W47_TEST_REAL_WEB_DIST;
 if(!dist){t.skip('only Windows W09 exact-real-web staged acceptance');return}
 const childRoot=mkdtempSync(join(tmpdir(),'w47-one-origin-'));
 let child;
 try{
  const nodeRoot=join(childRoot,'runtime');mkdirSync(nodeRoot);
  for(const f of modules)copyFileSync(join(source,f),join(nodeRoot,f));
  writeFileSync(join(nodeRoot,'runtime-build.json'),JSON.stringify({
   format:1,product:'YanceV2',source_sha:SHA
  }));
  const webRoot=join(childRoot,'dist');mkdirSync(webRoot);
  mkdirSync(join(webRoot,'assets'));
  const names=['index.html','version.json'];
  const index=readFileSync(join(dist,'index.html'),'utf8');
  const matches=[...index.matchAll(/(?:src|href)="(?:\.\/|\/)?(assets\/[A-Za-z0-9_-]+\.(?:js|css))"/g)].map(m=>m[1]);
  assert.ok(matches.some(x=>x.endsWith('.js')),'REAL_WEB_HAS_JS');
  assert.ok(matches.some(x=>x.endsWith('.css')),'REAL_WEB_HAS_CSS');
  names.push(...new Set(matches));
  const entries=[];
  for(const name of names){
   const bytes=readFileSync(join(dist,...name.split('/')));
   const dst=join(webRoot,...name.split('/'));
   copyFileSync(join(dist,...name.split('/')),dst);
   entries.push({path:name,sha256:H(bytes),bytes:bytes.length});
  }
  const wmeta=JSON.parse(readFileSync(join(webRoot,'version.json'),'utf8'));
  assert.match(wmeta.source_sha,/^[a-f0-9]{40}$/);
  assert.equal(wmeta.trustedSession,false);assert.equal(wmeta.canSend,false);
  const mfile=join(childRoot,'web.json');
  const mbody=Buffer.from(JSON.stringify({format:1,product:'YanceV2NativeWeb',
   sourceSha:wmeta.source_sha,files:entries}));
  writeFileSync(mfile,mbody);
  const allocator=netServer();
  const port=await new Promise((ok,fail)=>{
   allocator.once('error',fail);
   allocator.listen(0,'127.0.0.1',()=>ok(allocator.address().port));
  });
  await new Promise(ok=>allocator.close(ok));
  const origin='http://127.0.0.1:'+port;
  const env={...process.env,YANCE_W47_RUNTIME_MODE:'installed',
   YANCE_W47_API_PORT:String(port),YANCE_W47_WEB_ORIGIN:origin,
   YANCE_W47_NATIVE_WEB_ROOT:webRoot,YANCE_W47_NATIVE_WEB_MANIFEST:mfile,
   YANCE_W47_NATIVE_WEB_MANIFEST_SHA256:H(mbody),
   YANCE_W47_NATIVE_WEB_SOURCE_SHA:wmeta.source_sha,
   ...(process.env.YANCE_W47_TEST_REAL_W26_PORT?
    {YANCE_W47_W26_READONLY_PORT:process.env.YANCE_W47_TEST_REAL_W26_PORT}:{})};
  delete env.YANCE_W47_OPERATOR_PAIRING;
  child=spawn(process.execPath,[join(nodeRoot,'server.mjs')],{
   windowsHide:true,shell:false,env,stdio:['ignore','pipe','pipe']
  });
  let err='',log='';
  child.stderr.on('data',x=>{err+=String(x).slice(0,1000)});
  const ready=await new Promise((ok,fail)=>{
   const timeout=setTimeout(()=>fail(Error('PINNED_REAL_W47_BOOT_TIMEOUT '+log+' '+err)),15000);
   child.once('error',e=>{clearTimeout(timeout);fail(e)});
   child.once('exit',n=>{clearTimeout(timeout);fail(Error('API_PREMATURE_EXIT_'+n+' '+err))});
   child.stdout.on('data',chunk=>{
    log+=String(chunk);
    for(const line of log.split(/\r?\n/)){
     if(!line.includes('"event":"V2_API_READY"'))continue;
     clearTimeout(timeout);try{ok(JSON.parse(line))}catch(e){fail(e)}
     return;
    }
   });
  });
  assert.equal(ready.apiGitSha,SHA);assert.equal(ready.url,origin);
  const response=async(path,init={})=>fetch(origin+path,{...init,
   headers:{Origin:origin,...init.headers}});
  const html=await response('/?productDraft=1');
  assert.equal(html.status,200);
  assert.match(html.headers.get('content-type'),/text\/html/);
  assert.equal(html.headers.get('set-cookie'),null);
  assert.match(await html.text(),/assets\//);
  for(const name of matches){
   const r=await response('/'+name);
   assert.equal(r.status,200);
   assert.notEqual((await r.arrayBuffer()).byteLength,0);
  }
  const health=await response('/api/v2/runtime/health');
  assert.equal(health.status,200);
  assert.match(health.headers.get('content-type'),/json/);
  const state=await health.json();
  assert.equal(state.runtimeSha,SHA);
  assert.equal(state.nativeWebSourceSha,wmeta.source_sha);
  assert.equal(state.nativeWebSameOrigin,true);
  assert.equal(state.trustedSession,false);
  assert.equal(state.canSend,false);
  const contacts=await response('/api/v2/contacts');
  assert.equal(contacts.status,401);
  assert.match(contacts.headers.get('content-type'),/json/);
  const missing=await response('/api/v2/absent-not-html');
  assert.equal(missing.status,404);
  assert.match(missing.headers.get('content-type'),/json/);
  assert.equal((await response('/api/v2/private-brain/history?threadId=personal')).status,401);
  assert.equal((await response('/api/v2/send',{method:'POST',
   headers:{'content-type':'application/json'},body:'{}'})).status,403);
  const foreign=await fetch(origin+'/api/v2/runtime/health',{
   headers:{Origin:'https://evil.example','Sec-Fetch-Site':'cross-site'}});
  assert.equal(foreign.status,403);
  const setup=await response('/api/v2/providers/fb-personal/setup');
  assert.equal(setup.status,200);
  assert.equal((await setup.json()).nextAction,'OFFICIAL_SETUP_REQUIRED');
  let w26='NOT_CONNECTED';
  if(process.env.YANCE_W47_TEST_REAL_W26_PORT){
   const upstream=await response('/api/v2/providers/fb-personal/status');
   assert.equal(upstream.status,200);
   const status=await upstream.json();
   assert.equal(status.status,'WAITING_USER_AUTH');
   assert.equal(status.canSend,false);
   w26=status.bridgeState;
  }
  // Real Chrome headless DOM also verifies the W46 compiled Vue isn't an
  // empty static HTML shell; no W54 installed WebView2 claim from this run.
  const chrome=process.env.YANCE_W47_TEST_CHROME_EXE;
  let chromeResult='NOT_REQUESTED';
  if(chrome){
   const chromeDir=join(childRoot,'chrome');
   const c=await new Promise((ok,fail)=>{
    const args=['--headless=new','--disable-gpu','--no-first-run',
     '--no-default-browser-check','--disable-background-networking',
     '--user-data-dir='+chromeDir,'--virtual-time-budget=4500',
     '--dump-dom',origin+'/?productDraft=1'];
    const p=spawn(chrome,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
    let out='',e='';
    p.stdout.on('data',b=>{out+=String(b)});
    p.stderr.on('data',b=>{e+=String(b).slice(0,400)});
    p.once('error',fail);
    p.once('exit',n=>ok({code:n,out,e}));
   });
   assert.equal(c.code,0,'REAL_CHROME_EXIT '+c.e);
   assert.match(c.out,/id="app"[^>]*data-v-app/);
   assert.match(c.out,/data-test="w46-product-candidate"/);
   chromeResult='REAL_CHROME_BC_DOM_PASS';
  }
  let nativeWebView='NOT_REQUESTED';
  if(process.env.YANCE_W47_TEST_TAURI_EXE){
   const real=await verifyRealInstalledW54OnW47Origin({
    executable:process.env.YANCE_W47_TEST_TAURI_EXE,origin,
    expectedApiSha:SHA,shotPath:process.env.YANCE_W47_TEST_TAURI_SCREENSHOT
   });
   assert.equal(real.nativeWebView,true);
   assert.equal(real.trustedSession,false);
   assert.equal(real.nav.length,4);
   nativeWebView='REAL_INSTALLED_WEBVIEW2_API_JSON_NAV_4PASS';
   console.log('W47_NATIVE_WEBVIEW2_REAL_HTTP_ACK '+JSON.stringify(real));
  }
  console.log('W47_ACTUAL_ONE_ORIGIN_WEB_AND_API_ACK '+JSON.stringify({
   pid:child.pid,port,apiSha:SHA,webSha:wmeta.source_sha,
   actualCompiledAssets:matches.length,apiJson:true,unpairedContacts401:true,
   sends403:true,w26Bridge:w26,chromeResult,nativeWebView,productionInstalledSession:false
  }));
 }finally{
  if(child?.exitCode===null){
   child.kill();
   await Promise.race([new Promise(ok=>child.once('exit',ok)),
    new Promise(ok=>setTimeout(ok,2000))]);
  }
  rmSync(childRoot,{recursive:true,force:true,maxRetries:15,retryDelay:150});
 }
});

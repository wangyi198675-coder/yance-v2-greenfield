import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {createPinnedNativeWebAssets} from './native-pinned-web-assets.mjs';
const H=x=>createHash('sha256').update(x).digest('hex');
const SH='894c25643cdde8af2307c8d8396dad96c39471eb';
const setup=()=>{
 const dir=mkdtempSync(join(tmpdir(),'w47-pinned-web-'));
 const root=join(dir,'release');mkdirSync(root);
 mkdirSync(join(root,'assets'));
 const entries=[
  ['index.html',Buffer.from('<!doctype html><div id="app"></div><script type="module" src="/assets/index-Abc9.js"></script>')],
  ['version.json',Buffer.from(JSON.stringify({source_sha:SH,canSend:false,trustedSession:false}))],
  ['assets/index-Abc9.js',Buffer.from('document.querySelector("#app").textContent="B+C";')],
  ['assets/index-Abc9.css',Buffer.from('body{color:black}')]
 ];
 const records=[];
 for(const [name,bytes] of entries){
  writeFileSync(join(root,...name.split('/')),bytes);
  records.push({path:name,sha256:H(bytes),bytes:bytes.length});
 }
 const manifest=join(dir,'web.json');
 writeFileSync(manifest,JSON.stringify({format:1,product:'YanceV2NativeWeb',
  sourceSha:SH,files:records}));
 const digest=H(readFileSync(manifest));
 const opts={distRoot:root,manifestFile:manifest,manifestSha256:digest,
  sourceSha:SH,mode:'installed',apiPort:51111,webOrigin:'http://127.0.0.1:51111'};
 return {root,manifest,records,opts,remove:()=>rmSync(dir,{recursive:true,force:true})};
};
test('original B+C build bytes are pinned before serving with HTML/CSS/JS and no Set-Cookie',async()=>{
 const f=setup();let s;
 try{
  const asset=createPinnedNativeWebAssets(f.opts);
  assert.equal(asset.fileCount,4);assert.equal(asset.sourceSha,SH);
  s=createServer((req,res)=>{
   if(!asset.respond(req,res,new URL(req.url,'http://127.0.0.1:51111'))){
    res.writeHead(404,{'content-type':'application/json'});res.end('{"ok":false}');
   }
  });
  await new Promise(ok=>s.listen(0,'127.0.0.1',ok));
  const base='http://127.0.0.1:'+s.address().port;
  const html=await fetch(base+'/?productDraft=1');
  assert.equal(html.status,200);
  assert.equal(html.headers.get('set-cookie'),null);
  assert.match(await html.text(),/id="app"/);
  const js=await fetch(base+'/assets/index-Abc9.js');
  assert.equal(js.status,200);assert.match(js.headers.get('content-type'),/javascript/);
  assert.match(await js.text(),/B\+C/);
  const version=await fetch(base+'/version.json');
  assert.equal((await version.json()).source_sha,SH);
  assert.equal((await fetch(base+'/api/v2/agent/run')).status,404);
  assert.equal((await fetch(base+'/index.html?malicious=1')).status,422);
  assert.equal((await fetch(base+'/assets/other.js')).status,404);
  const h=await fetch(base+'/',{method:'HEAD'});
  assert.equal(h.status,200);assert.equal(await h.text(),'');
 }finally{if(s)await new Promise(ok=>s.close(ok));f.remove()}
});
test('API origin must match actual installed port and no development static enablement',()=>{
 const f=setup();
 try{
  assert.throws(()=>createPinnedNativeWebAssets({...f.opts,mode:'development'}),
   /W47_WEB_API_ONE_ORIGIN_REQUIRED/);
  assert.throws(()=>createPinnedNativeWebAssets({...f.opts,webOrigin:'http://127.0.0.1:51112'}),
   /W47_WEB_API_ONE_ORIGIN_REQUIRED/);
  assert.throws(()=>createPinnedNativeWebAssets({...f.opts,apiPort:0}),
   /W47_WEB_API_ONE_ORIGIN_REQUIRED/);
 }finally{f.remove()}
});
test('manifest digest, source revision and tampered compiled JS fail closed',()=>{
 const f=setup();
 try{
  assert.throws(()=>createPinnedNativeWebAssets({...f.opts,manifestSha256:'0'.repeat(64)}),
   /W47_WEB_BUNDLE_MANIFEST_PIN_MISMATCH/);
  assert.throws(()=>createPinnedNativeWebAssets({...f.opts,sourceSha:'1'.repeat(40)}),
   /W47_WEB_BUNDLE_MANIFEST_FIELDS_INVALID/);
  writeFileSync(join(f.root,'assets','index-Abc9.js'),'tampered');
  assert.throws(()=>createPinnedNativeWebAssets(f.opts),
   /W47_WEB_BUNDLE_FILE_CHANGED|W47_WEB_BUNDLE_FILE_HASH_MISMATCH/);
 }finally{f.remove()}
});
test('symlinked or misleading bundled content never served',()=>{
 const f=setup();
 try{
  writeFileSync(join(f.root,'secret.env'),'SECRET=NOT_PUBLIC');
  const asset=createPinnedNativeWebAssets(f.opts);
  assert.equal(asset.fileCount,4);
  const copied={...f.opts,distRoot:join(f.root,'assets')};
  assert.throws(()=>createPinnedNativeWebAssets(copied),
   /W47_WEB_BUNDLE/);
 }finally{f.remove()}
});

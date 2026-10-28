// W47 optional INSTALLED same-origin B+C static assets. W54/W09 packages
// the already built Vue dist, no second web server, no reimplementation.
// A manifest HASH checks byte integrity; it is not native code-signing and
// never authenticates a localhost/browser principal or cloud model allowance.
import {createHash} from 'node:crypto';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {isAbsolute,join,resolve,sep} from 'node:path';

const hash=b=>createHash('sha256').update(b).digest('hex');
const sha40=s=>typeof s==='string'&&/^[a-f0-9]{40}$/.test(s);
const sha64=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const fail=s=>{throw Error(s)};
const safe=name=>name==='index.html'||name==='version.json'||
 /^assets\/[A-Za-z0-9_-]+\.(?:js|css|png|svg|woff2|ico)$/.test(name);
const types=Object.freeze({html:'text/html; charset=utf-8',
 json:'application/json; charset=utf-8',js:'text/javascript; charset=utf-8',
 css:'text/css; charset=utf-8',png:'image/png',svg:'image/svg+xml',
 woff2:'font/woff2',ico:'image/x-icon'});
const cap={files:120,total:24*1024*1024,single:12*1024*1024};
export function createPinnedNativeWebAssets({distRoot,manifestFile,manifestSha256,sourceSha,
 mode,apiPort,webOrigin}={}){
 if(mode!=='installed'||!Number.isSafeInteger(apiPort)||apiPort<1||apiPort>65535||
    webOrigin!==`http://127.0.0.1:${apiPort}`)
   fail('W47_WEB_API_ONE_ORIGIN_REQUIRED');
 if(!sha40(sourceSha)||!sha64(manifestSha256)||
    typeof distRoot!=='string'||typeof manifestFile!=='string'||
    !isAbsolute(distRoot)||!isAbsolute(manifestFile))
   fail('W47_WEB_BUILD_PIN_REQUIRED');
 if(lstatSync(distRoot).isSymbolicLink()||
    !lstatSync(distRoot).isDirectory())
   fail('W47_WEB_BUNDLE_DIRECTORY_INVALID');
 const root=realpathSync(distRoot);
 // Filename + digest must come from exact W09/W54 approved package metadata;
 // a browser-supplied path, blob, header or origin can never change this map.
 const manifestBytes=readFileSync(manifestFile);
 if(manifestBytes.byteLength>32000||hash(manifestBytes)!==manifestSha256)
   fail('W47_WEB_BUNDLE_MANIFEST_PIN_MISMATCH');
 let manifest;
 try{manifest=JSON.parse(manifestBytes.toString('utf8'))}
 catch{fail('W47_WEB_BUNDLE_MANIFEST_JSON_INVALID')}
 if(manifest?.format!==1||manifest.product!=='YanceV2NativeWeb'||
    manifest.sourceSha!==sourceSha||!Array.isArray(manifest.files)||
    manifest.files.length<4||manifest.files.length>cap.files)
   fail('W47_WEB_BUNDLE_MANIFEST_FIELDS_INVALID');
 const assets=new Map();let total=0;
 for(const item of manifest.files){
   const name=item?.path;
   if(typeof name!=='string'||!safe(name)||assets.has('/'+name)||
      !sha64(item.sha256)||!Number.isSafeInteger(item.bytes)||
      item.bytes<1||item.bytes>cap.single)
     fail('W47_WEB_BUNDLE_FILE_MANIFEST_INVALID');
   const absolute=resolve(root,...name.split('/'));
   if(!absolute.startsWith(root+sep))fail('W47_WEB_BUNDLE_ESCAPE_BLOCKED');
   // Refuse symlinks at each segment, not only the final file.
   if(name.includes('/')){
     let sub;
     try{sub=lstatSync(join(root,'assets'))}
     catch{fail('W47_WEB_BUNDLE_FILE_CHANGED')}
     if(!sub.isDirectory()||sub.isSymbolicLink())
       fail('W47_WEB_BUNDLE_SYMLINK_BLOCKED');
   }
   let st;
   try{st=lstatSync(absolute)}
   catch{fail('W47_WEB_BUNDLE_FILE_CHANGED')}
   if(!st.isFile()||st.isSymbolicLink()||st.size!==item.bytes)
     fail('W47_WEB_BUNDLE_FILE_CHANGED');
   const bytes=readFileSync(absolute);
   if(bytes.length!==item.bytes||hash(bytes)!==item.sha256)
     fail('W47_WEB_BUNDLE_FILE_HASH_MISMATCH');
   const ext=name.split('.').at(-1);
   assets.set('/'+name,{bytes,type:types[ext]});
   total+=bytes.byteLength;
   if(total>cap.total)fail('W47_WEB_BUNDLE_TOO_LARGE');
 }
 if(!assets.has('/index.html')||!assets.has('/version.json')||
    ![...assets.keys()].some(s=>s.endsWith('.js'))||
    ![...assets.keys()].some(s=>s.endsWith('.css')))
   fail('W47_WEB_BUNDLE_REQUIRED_ASSETS_MISSING');
 let version;
 try{version=JSON.parse(assets.get('/version.json').bytes.toString('utf8'))}
 catch{fail('W47_WEB_VERSION_INVALID')}
 if(version.source_sha!==sourceSha||
    version.canSend!==false||version.trustedSession!==false)
   fail('W47_WEB_VERSION_OR_AUTH_FALSEHOOD');
 return Object.freeze({
   sourceSha,manifestSha256,fileCount:assets.size,
   respond(req,res,url){
     // Strict no SPA fallback: /api/v2/** will ALWAYS be API JSON/401/503/404.
     if(req.method!=='GET'&&req.method!=='HEAD')return false;
     const path=url.pathname==='/'?'/index.html':url.pathname;
     const asset=assets.get(path);
     if(!asset)return false;
     if(url.pathname!=='/'&&url.search){
       res.writeHead(422,{'content-type':'application/json; charset=utf-8',
        'cache-control':'no-store','x-content-type-options':'nosniff'});
       if(req.method==='HEAD')res.end();
       else res.end(JSON.stringify({ok:false,error:'WEB_ASSET_QUERY_FORBIDDEN'}));
       return true;
     }
     // No Set-Cookie anywhere on static routes, no online account or SID.
     res.writeHead(200,{
       'content-type':asset.type,'content-length':String(asset.bytes.length),
       'cache-control':'no-store','x-content-type-options':'nosniff',
       'cross-origin-resource-policy':'same-origin','referrer-policy':'no-referrer',
       'x-frame-options':'DENY'
     });
     if(req.method==='HEAD')res.end();else res.end(asset.bytes);
     return true;
   }
 });
}
export function resolvePinnedNativeWebAssets({env=process.env,config}={}){
 const root=env.YANCE_W47_NATIVE_WEB_ROOT;
 const manifest=env.YANCE_W47_NATIVE_WEB_MANIFEST;
 const digest=env.YANCE_W47_NATIVE_WEB_MANIFEST_SHA256;
 const source=env.YANCE_W47_NATIVE_WEB_SOURCE_SHA;
 if([root,manifest,digest,source].every(x=>x===undefined))return null;
 if([root,manifest,digest,source].some(x=>typeof x!=='string'||!x))
   fail('W47_WEB_BUNDLE_FOUR_FIELDS_REQUIRED');
 return createPinnedNativeWebAssets({distRoot:root,manifestFile:manifest,
  manifestSha256:digest,sourceSha:source,mode:config?.mode,
  apiPort:config?.port,webOrigin:config?.webOrigin});
}

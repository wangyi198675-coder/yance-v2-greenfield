const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),crypto=require('node:crypto');
const root=__dirname, list=JSON.parse(fs.readFileSync(path.join(root,'W42_APPROVED_ACTIONS.json'),'utf8').replace(/^\uFEFF/,'')),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const copies=list.filter(x=>x.preimport_gate==='PREIMPORT_ALLOW'&&x.approved_action==='COPY');
if(copies.length!==72)throw Error('expected 72, got '+copies.length);
const hold=list.filter(x=>x.preimport_gate==='PREIMPORT_HOLD').length;
if(hold!==73)throw Error('expected 73 holds');
const grab=(url,depth=0)=>new Promise((resolve,reject)=>{
  const req=https.get(url,{headers:{'User-Agent':'YanceV2-P3-1-Offline-OSS-Hash-Gated-Importer'}},res=>{
    if([301,302,307,308].includes(res.statusCode)&&res.headers.location&&depth<4){res.resume();return grab(res.headers.location,depth+1).then(resolve,reject)}
    if(res.statusCode!==200){res.resume();return reject(Error('HTTP '+res.statusCode+' '+url))}
    const bufs=[];res.on('data',b=>bufs.push(b));res.on('end',()=>resolve(Buffer.concat(bufs)));res.on('error',reject);
  });req.setTimeout(20000,()=>req.destroy(Error('TIMEOUT '+url)));req.on('error',reject);
});
let next=0, results=[],failed=[];
async function worker(){
while(next<copies.length){
 const item=copies[next++];try{
 if(!/^apps\/v4\/registry\/bases\/reka\/(ui\/(button|bubble|message|message-scroller|context-menu|dialog|popover|scroll-area|input-group|input|textarea)\/|lib\/utils\.ts)/.test(item.path))throw Error('unexpected path');
 if(!item.target.startsWith('design/nonproduction/approved-clickable-abc-bc/'))throw Error('target escapes');
 const url='https://raw.githubusercontent.com/unovue/shadcn-vue/'+item.commit+'/'+item.path;
 let buf;for(let retry=0;retry<3;retry++){try{buf=await grab(url);break}catch(e){if(retry===2)throw e}}
 const actual=sha(buf);if(actual.toLowerCase()!==item.sha.toLowerCase())throw Error('SHA mismatch '+item.path+' got '+actual+' want '+item.sha);
 const rel=item.target.replace(/^design\/nonproduction\/approved-clickable-abc-bc\//,'');
 const out=path.resolve(root,rel);
 if(!out.startsWith(path.resolve(root)+path.sep))throw Error('path escape');
 fs.mkdirSync(path.dirname(out),{recursive:true});
 if(fs.existsSync(out))throw Error('already exists '+rel);
 fs.writeFileSync(out,buf);
 results.push({path:item.path,upstreamSha:item.sha,vendorPath:rel,originalVendorSha:sha(fs.readFileSync(out)),license:item.license,commit:item.commit,upstreamURL:url});
 }catch(e){failed.push({path:item.path,error:String(e)})}
}}
(async()=>{
 await Promise.all(Array.from({length:6},worker));
 const lic=await grab('https://raw.githubusercontent.com/unovue/shadcn-vue/3f048dfb495703f39e191b25a69307fba72822eb/LICENSE');
 const licenseSha=sha(lic);if(licenseSha!=='69f84f4ad77be299dbf42d03d7fd862ab3ab05546c6e573c6c7c875b0168a94d')throw Error('LICENSE hash mismatch '+licenseSha);
 fs.mkdirSync(path.join(root,'licenses'),{recursive:true});
 fs.writeFileSync(path.join(root,'licenses','SHADCN_VUE_MIT_LICENSE.txt'),lic);
 fs.writeFileSync(path.join(root,'W39_VENDOR_ORIGINAL_SHA_MANIFEST.json'),JSON.stringify({downloaded:results.length,failed,licenseSha,sourceCommit:'3f048dfb495703f39e191b25a69307fba72822eb',files:results},null,2));
 console.log(JSON.stringify({copied:results.length,failed:failed.slice(0,7),licenseSha}));
 if(failed.length)process.exitCode=2;
})().catch(e=>{console.error(e);process.exitCode=3});

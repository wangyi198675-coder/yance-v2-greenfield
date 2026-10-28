const fs=require('fs'),path=require('path'),crypto=require('crypto'),https=require('https');const root=__dirname,sha=x=>crypto.createHash('sha256').update(x).digest('hex');const m=JSON.parse(fs.readFileSync(path.join(root,'W39_VENDOR_MODIFICATIONS.json'),'utf8'));if(m.modifications.length!==5)throw Error('not 5');
const get=url=>new Promise((resolve,reject)=>{https.get(url,res=>{if(res.statusCode!==200)return reject(Error('HTTP '+res.statusCode));const out=[];res.on('data',x=>out.push(x));res.on('end',()=>resolve(Buffer.concat(out)));res.on('error',reject)}).on('error',reject)});
const lines=x=>x.toString('utf8').replace(/\r\n/g,'\n').replace(/\n$/,'').split('\n');
(async()=>{const patches=[];for(const mod of m.modifications){
const entry=m.files.find(x=>x.vendorPath===mod.target),url='https://raw.githubusercontent.com/unovue/shadcn-vue/'+entry.commit+'/'+entry.path,original=await get(url),vendor=fs.readFileSync(path.join(root,entry.vendorPath));
if(sha(original)!==entry.upstreamSha||sha(vendor)!==mod.vendorSha)throw Error('vendor patch verification failed '+entry.vendorPath);
const before=lines(original),after=lines(vendor);
const p=['diff --git a/'+entry.path+' b/'+entry.vendorPath,'--- a/'+entry.path,'+++ b/'+entry.vendorPath,'@@ -1,'+before.length+' +1,'+after.length+' @@',...before.map(x=>'-'+x),...after.map(x=>'+'+x)].join('\n')+'\n';
patches.push(p);console.log('PATCH_VERIFIED',mod.target,entry.upstreamSha,mod.vendorSha);
}
fs.writeFileSync(path.join(root,'evidence','W39_APPROVED_FIVE_VENDOR_DIFFS.patch'),patches.join('\n'));console.log('PATCH_SHA256='+sha(fs.readFileSync(path.join(root,'evidence','W39_APPROVED_FIVE_VENDOR_DIFFS.patch'))))})().catch(e=>{console.error(e);process.exitCode=1});

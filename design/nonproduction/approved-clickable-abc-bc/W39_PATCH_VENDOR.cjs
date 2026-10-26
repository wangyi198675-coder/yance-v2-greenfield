const fs=require('fs'),path=require('path'),crypto=require('crypto'),root=__dirname;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'), M=JSON.parse(fs.readFileSync(path.join(root,'W39_VENDOR_ORIGINAL_SHA_MANIFEST.json'),'utf8'));
if(M.downloaded!==72||M.failed.length)throw Error('vendor not complete');
const modifications=[];
for(const o of M.files){
 const target=path.join(root,o.vendorPath),raw=fs.readFileSync(target);if(sha(raw)!==o.upstreamSha)throw Error('original changed '+o.vendorPath);
 let s=raw.toString('utf8'),t=s;
 if(t.includes('IconPlaceholder')){
  const m=t.match(/import\s+(?:\{\s*)?IconPlaceholder(?:\s*\})?\s+from\s+["'][^"']+["']/);
  if(!m)throw Error('unhandled icon import '+o.vendorPath);
  let icon='XIcon';if(t.includes('lucide="CheckIcon"'))icon='CheckIcon';else if(t.includes('lucide="ChevronRightIcon"'))icon='ChevronRightIcon';
  t=t.replace(m[0],`import { ${icon} } from "@lucide/vue"`);
  const found=[...t.matchAll(/<IconPlaceholder\b[\s\S]*?\/>/g)];
  if(found.length!==1)throw Error('icon usage count '+o.vendorPath+' '+found.length);
  t=t.replace(/<IconPlaceholder\b[\s\S]*?\/>/g,`<${icon} class="size-4" aria-hidden="true" />`);
 }
 if(t!==s){
  fs.writeFileSync(target,t,'utf8');
  modifications.push({target:o.vendorPath,upstreamSha:o.upstreamSha,vendorSha:sha(Buffer.from(t)),modifications:[{old:mapped(s,t).old,new:mapped(s,t).new}],comment:'W42 approved single @lucide/vue@1.55.0 replacement of blocked IconPlaceholder'});
 }
}
function mapped(a,b){const aa=a.split('\n'),bb=b.split('\n');return {old:aa.filter(l=>l.includes('IconPlaceholder')||l.includes('lucide=')||l.includes('tabler=')||l.includes('hugeicons=')||l.includes('phosphor=')||l.includes('remixicon=')),new:bb.filter(l=>l.includes('@lucide/vue')||l.includes('size-4'))}}
if(modifications.length!==5)throw Error('Expected exactly five icon file patches got '+modifications.length);
for(const f of M.files)f.finalVendorSha=sha(fs.readFileSync(path.join(root,f.vendorPath)));
fs.writeFileSync(path.join(root,'W39_VENDOR_MODIFICATIONS.json'),JSON.stringify({modifications,files:M.files},null,2));
console.log(JSON.stringify({originalCopies:72,patched:modifications.length,unmodified:67,allHashChecked:true}));

// Safe real upstream reachability check: official public docs only, no credentials,
// no user social data, no provider send or local daemon.
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const urls = Object.freeze([
  ['pancake-rest-public-openapi','https://developer.pancake.biz/openapi/openapi.yaml'],
  ['pancake-webhook-public-openapi','https://developer.pancake.biz/openapi/webhook.yaml'],
  ['chatwoot-cloud-public-root','https://app.chatwoot.com/'],
  ['chatwoot-public-api-docs','https://developers.chatwoot.com/']
]);
export async function checkPublicVendors(fetchImpl=globalThis.fetch) {
  const results=[];
  for(const [name,url] of urls){
    const output={name,site:new URL(url).origin,kind:'PUBLIC_SERVICE_CHECK_NOT_ACCOUNT_AUTH'};
    try{
      const r=await fetchImpl(url,{method:'GET',redirect:'error',
        signal:AbortSignal.timeout(10000),cache:'no-store'});
      output.status=r.status;
      if(r.status!==200)output.state='UNAVAILABLE';
      else {
        const raw=Buffer.from(await r.arrayBuffer());
        if(raw.length>2_000_000)output.state='INVALID_SIZE';
        else {
          output.state='PUBLIC_UPSTREAM_REACHABLE';
          output.sha256=createHash('sha256').update(raw).digest('hex');
          output.bytes=raw.length;
        }
      }
    }catch(e){output.state='UNAVAILABLE';output.reason='UPSTREAM_CONNECT_ERROR';}
    results.push(output);
  }
  return Object.freeze({
    status:'WAITING_USER_AUTH',realPageCount:0,verifiedRealMidCount:0,
    sendEnabled:false,hasSocialCredentials:false,
    vendorDocs:results
  });
}
if(process.argv[1] && fileURLToPath(import.meta.url).toLowerCase()===process.argv[1].toLowerCase()){
  const result=await checkPublicVendors();
  console.log(JSON.stringify(result,null,2));
  if(result.vendorDocs.some(x=>x.name!=='chatwoot-public-api-docs' && x.state!=='PUBLIC_UPSTREAM_REACHABLE'))process.exitCode=2;
}

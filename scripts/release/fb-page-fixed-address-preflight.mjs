// P0 Facebook Page fixed-address release gate. Read-only; no token or cookie input.
// This is a required PRECHECK, not a substitute for the authenticated Chrome/W55 gate.
import {pathToFileURL} from 'node:url';

const SHA=/^[a-f0-9]{40}$/;
export async function assertRuntimeGate({webOrigin,expectedWebSha,expectedApiSha,fetchImpl=fetch}){
  const origin=new URL(webOrigin);
  if(origin.protocol!=='http:'||origin.hostname!=='127.0.0.1'||origin.username||origin.password||
     origin.pathname!=='/'||origin.search||origin.hash)throw Error('LOOPBACK_ORIGIN_REQUIRED');
  if(!SHA.test(expectedWebSha)||!SHA.test(expectedApiSha))throw Error('EXACT_SHA_REQUIRED');
  const request=async path=>{
    const response=await fetchImpl(origin.origin+path,{
      method:'GET',redirect:'manual',cache:'no-store',
      signal:AbortSignal.timeout(4000),headers:{accept:'application/json'}
    });
    if(response.status>=300&&response.status<400)throw Error('REDIRECT_BLOCKED_'+path);
    let json=null;
    if(response.status===200)try{json=await response.json()}catch{throw Error('INVALID_JSON_'+path)}
    return {status:response.status,json};
  };
  const [version,health,page,wa,personal]=await Promise.all([
    request('/version.json'),
    request('/api/v2/runtime/health'),
    request('/api/v2/providers/fb-page/onboarding/capabilities'),
    request('/api/v2/providers/whatsapp-personal/native/status'),
    request('/api/v2/providers/fb-personal/status')
  ]);
  if(version.status!==200||version.json?.source_sha!==expectedWebSha)
    throw Error('WEB_RUNNING_SHA_MISMATCH');
  // Never trust version.json.api_source_sha: actual running process must speak for itself.
  if(health.status!==200||health.json?.runtimeSha!==expectedApiSha)
    throw Error('ACTUAL_API_RUNTIME_SHA_MISMATCH');
  // Unauthorized Page is 401/403; 404 proves the route was lost at publish.
  if(![401,403].includes(page.status))throw Error('FB_PAGE_ONBOARDING_ROUTE_OR_AUTH_REGRESSION_'+page.status);
  if(![200,401,403,503].includes(wa.status))throw Error('WHATSAPP_NATIVE_ROUTE_REGRESSION_'+wa.status);
  if(![200,401,403,503].includes(personal.status))
    throw Error('FB_PERSONAL_ROUTE_REGRESSION_'+personal.status);
  return {
    result:'PASS_TRANSPORT_ONLY',
    webSha:expectedWebSha,apiSha:expectedApiSha,
    fbPageUnauthenticatedStatus:page.status,
    whatsappStatus:wa.status,fbPersonalStatus:personal.status,
    authenticatedChromeW55CredentialReady:'REQUIRED_NOT_PROVEN',
    realPageIdentityAndInbox:'REQUIRED_NOT_PROVEN'
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=Object.fromEntries(process.argv.slice(2).map(arg=>{
    const equal=arg.indexOf('=');
    if(!arg.startsWith('--')||equal<3)throw Error('USAGE_ARGS_REQUIRED');
    return [arg.slice(2,equal),arg.slice(equal+1)];
  }));
  assertRuntimeGate({
    webOrigin:args['web-origin'],expectedWebSha:args['web-sha'],
    expectedApiSha:args['api-sha']
  }).then(result=>{
    process.stdout.write(JSON.stringify(result)+'\n');
  }).catch(e=>{
    process.stderr.write('RELEASE_BLOCKED: '+(e?.message||'UNKNOWN')+'\n');
    process.exitCode=1;
  });
}

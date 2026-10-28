// W47 single-user local runtime endpoint configuration.
// Local routing is NOT identity: neither this file nor env vars authenticate requests.
// Tauri/install bootstrap must supply installed endpoints; OS user-data authority remains W54-owned.
const fail=code=>{throw Error(code)};
const decimal=value=>typeof value==='string'&&/^(0|[1-9][0-9]{0,4})$/.test(value);
function parsePort(raw,{allowZero=false}={}){
  if(!decimal(raw))fail('W47_RUNTIME_PORT_INVALID');
  const n=Number(raw);
  if(n>65535||(!allowZero&&n===0))fail('W47_RUNTIME_PORT_INVALID');
  return n;
}
function parseWebOrigin(raw){
  if(typeof raw!=='string'||!raw.trim())fail('W47_RUNTIME_WEB_ORIGIN_REQUIRED');
  let u;
  try{u=new URL(raw)}catch{fail('W47_RUNTIME_WEB_ORIGIN_INVALID')}
  if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||
     u.username||u.password||u.search||u.hash||u.pathname!=='/'||
     !/^http:\/\/127\.0\.0\.1:[0-9]{1,5}$/.test(raw))
     fail('W47_RUNTIME_WEB_ORIGIN_INVALID');
  parsePort(u.port);
  return u.origin;
}
/**
 * "installed" means endpoint selected at controlled native application STARTUP.
 * This flag is NOT an auth proof, and never enables mutations, credentials or sends.
 * Port 0 lets Windows select an unoccupied loopback port for independent installs.
 */
export function resolveRuntimeConfig(env=process.env){
  const mode=env.YANCE_W47_RUNTIME_MODE||'development';
  if(!['development','installed'].includes(mode))fail('W47_RUNTIME_MODE_INVALID');
  const rawPort=env.YANCE_W47_API_PORT;
  const rawOrigin=env.YANCE_W47_WEB_ORIGIN;
  if(mode==='installed' && (!rawPort||!rawOrigin))
    fail('W47_INSTALLED_ENDPOINT_CONFIG_REQUIRED');
  if(mode==='development' && (!!rawPort!==!!rawOrigin))
    fail('W47_DEVELOPMENT_ENDPOINT_CONFIG_INCOMPLETE');
  const port=parsePort(rawPort??'47182',{allowZero:mode==='installed'});
  const webOrigin=parseWebOrigin(rawOrigin??'http://127.0.0.1:4399');
  return Object.freeze({mode,bind:'127.0.0.1',port,webOrigin,
    webOriginHost:new URL(webOrigin).host,
    // Explicit truth: local endpoint configuration provides no Principal or platform grant.
    trustedSession:false,canSend:false,externalEffects:false});
}

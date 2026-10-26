/**
 * W26 actual local read-only bridge process status. This API NEVER handles
 * provider login, account secrets, real contacts, agent calls or sending.
 * W47 authenticated V2 runtime must proxy the sanitized status under its
 * existing session authority; this bridge never issues a Principal.
 */
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {inspectRealBridge} from './bridge-runtime.mjs';
const HOST='127.0.0.1',PORT=29321;
function send(res,code,json,contentType='application/json; charset=utf-8'){
  res.writeHead(code,{'content-type':contentType,'cache-control':'no-store',
    'x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",'x-frame-options':'DENY'});
  res.end(typeof json==='string'?json:JSON.stringify(json));
}
export function createBridgeStatusServer({probe=inspectRealBridge,port=PORT}={}){
  return createServer(async(req,res)=>{
    const h=req.headers.host;
    if(req.method!=='GET' || !['127.0.0.1:'+port,'localhost:'+port].includes(h))
      return send(res,403,{ok:false,error:'LOCAL_READ_ONLY'});
    try{
      const url=new URL(req.url||'/', 'http://127.0.0.1:'+PORT);
      if(url.search) return send(res,422,{ok:false,error:'NO_QUERY_INPUT'});
      if(url.pathname==='/api/v2/providers/fb-personal/status')
        return send(res,200,{ok:true,...await probe()});
      if(url.pathname==='/api/v2/providers/fb-personal/setup'){
        const state=await probe();
        return send(res,200,{
          channel:'FB_PERSONAL',origin:'OFFICIAL_MAUTRIX_META',
          nextAction:state.bridgeBotProfileVerified?'USER_MUST_EXPLICITLY_AUTHORIZE_MESSENGER_ACCOUNT':'INSTALL_AND_REGISTER_REAL_LOCAL_MATRIX_HOMESERVER',
          bridgeState:state.bridgeState, realAccountState:'WAITING_USER_AUTH',
          officialSetup:'https://docs.mau.fi/bridges/go/setup.html?bridge=meta',
          officialAuthentication:'https://docs.mau.fi/bridges/go/meta/authentication.html',
          requirements:['First register official bridge application service with a local Matrix homeserver.',
            'After legal/provider checks, user voluntarily authenticates their own Facebook account through the official bridge.',
            'W24 validates real ChannelAccount and peer ownership; W25 is the only outbound sender.'],
          canSend:false,
        });
      }
      if(url.pathname==='/health') return send(res,200,{
        ok:true,service:'W26 OFFICIAL Bridge Status (no account authority)',
        channel:'FB_PERSONAL',dataSource:'REAL_WSL_PROCESS',providerReadOnly:true,
        bridge:await probe()});
      return send(res,404,{ok:false,error:'NOT_FOUND'});
    } catch {return send(res,503,{ok:false,error:'REAL_PROVIDER_PROBE_FAILED',canSend:false});}
  });
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]){
  const s=createBridgeStatusServer();
  s.listen(PORT,HOST,()=>process.stdout.write('W26 real bridge read-only local API http://'+HOST+':'+PORT+'\n'));
}

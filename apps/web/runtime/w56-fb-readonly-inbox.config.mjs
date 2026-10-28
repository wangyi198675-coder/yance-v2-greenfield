/**
 * Fixed 44751 minimal read-only Facebook inbox bridge.
 * Reuses the EXISTING native W47/W55 first-party HttpOnly local session.
 * Does not install an identity service, DB, sender or credentials.
 */
import previous from 'file:///C:/Users/1/Documents/YanceV2/W09_FIXED_44751_STAGE_20261026/p0-fb-page-verified.config.mjs';
const API='http://127.0.0.1:49417',BRIDGE='http://127.0.0.1:29321';
const prefix='/api/v2/facebook-inbox';
const noStore={'content-type':'application/json; charset=utf-8','cache-control':'no-store',
 'x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin'};
function json(res,status,obj){if(res.headersSent)return;res.writeHead(status,noStore);res.end(JSON.stringify(obj))}
function isAllowed(req){
 const host=req.headers.host,origin=req.headers.origin,site=req.headers['sec-fetch-site'];
 return host==='127.0.0.1:44751'&&(!origin||origin==='http://127.0.0.1:44751')&&
  site!=='cross-site'&&site!=='same-site'&&req.method==='GET'&&
  typeof req.headers.cookie==='string'&&req.headers.cookie.length<6000;
}
function createInboxBridge(){
 return {name:'w56-official-fb-matrix-inbox-existing-local-session',
  configurePreviewServer(server){
   server.middlewares.use((req,res,next)=>{
    const raw=req.url||'',path=new URL(raw,'http://127.0.0.1:44751');
    if(![prefix,prefix+'/messages',prefix+'/avatar'].includes(path.pathname))return next();
    void (async()=>{
     if(!isAllowed(req)){json(res,401,{ok:false,error:'LOCAL_APP_SESSION_REQUIRED',canSend:false});return}
     const verify=await fetch(API+'/api/v2/local-session/status',{
      headers:{Cookie:req.headers.cookie,Origin:'http://127.0.0.1:44751',
       'Sec-Fetch-Site':'same-origin'},signal:AbortSignal.timeout(6000),
      redirect:'error',cache:'no-store'});
     if(!verify.ok){json(res,401,{ok:false,error:'LOCAL_SESSION_INVALID',canSend:false});return}
     const s=await verify.json();
     if(s?.ok!==true||s.authorized!==true||!['WEB_LOCAL_PRIVATE','NATIVE_FIRST_PARTY'].includes(s.sessionKind)){
      json(res,401,{ok:false,error:'LOCAL_SESSION_NOT_CURRENT',canSend:false});return}
     if(path.pathname===prefix&&path.search){
      json(res,422,{ok:false,error:'INBOX_FILTER_UNSUPPORTED',canSend:false});return}
     if(path.pathname===prefix+'/avatar'&&
       (path.searchParams.size!==1||path.searchParams.getAll('room').length!==1)){
      json(res,422,{ok:false,error:'INVALID_AVATAR_ROOM',canSend:false});return}
     if(path.pathname===prefix+'/messages'&&
       (path.searchParams.size!==1||path.searchParams.getAll('room').length!==1)){
      json(res,422,{ok:false,error:'INVALID_ROOM_SELECTOR',canSend:false});return}
     const suffix=path.pathname===prefix+'/messages'?'/messages'+path.search:
      path.pathname===prefix+'/avatar'?'/avatar'+path.search:'';
     const response=await fetch(BRIDGE+'/api/v2/providers/fb-personal/inbox'+suffix,{
      signal:AbortSignal.timeout(15000),redirect:'error',cache:'no-store'});
     if(!response.ok)throw Error('W56_MATRIX_BRIDGE_READ_FAILED');
     if(path.pathname===prefix+'/avatar'){
      const mime=String(response.headers.get('content-type')||'').split(';')[0];
      if(!['image/jpeg','image/png','image/webp','image/gif'].includes(mime))
       throw Error('AVATAR_MEDIA_NOT_IMAGE');
      const raw=Buffer.from(await response.arrayBuffer());
      if(!raw.length||raw.length>1500000)throw Error('AVATAR_MEDIA_OVERSIZE');
      res.writeHead(200,{'content-type':mime,'content-length':raw.length,
       'cache-control':'private, max-age=180','x-content-type-options':'nosniff'});
      return res.end(raw);
     }
     const text=await response.text();
     if(text.length>2000000)throw Error('INBOX_RESULT_TOO_LARGE');
     const data=JSON.parse(text);
     if(data?.ok!==true||data?.source!=='OFFICIAL_MAUTRIX_META_MATRIX_READ_ONLY'||
      data.canSend!==false||data.providerPeerBindingPending!==true)
      throw Error('UNVERIFIED_BRIDGE_REPLY');
     json(res,200,data);
    })().catch(()=>json(res,503,{ok:false,error:'OFFICIAL_FB_INBOX_NOT_READY',canSend:false}));
   });
  }
 };
}
export default {...previous,plugins:[...(previous.plugins||[]),createInboxBridge()]};

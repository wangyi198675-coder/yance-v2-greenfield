// Issue #146: read-only native capability truth for original ContextMenu.
// NOT a Conversation state store, W24 approval, W44 grant or W25 sender.
// An unconnected original Owner must NOT be reported as PROVIDER_UNSUPPORTED.
const entries=Object.freeze([
 ['PIN','W24_CONVERSATION_DB_OWNER_UNASSIGNED'],
 ['UNPIN','W24_CONVERSATION_DB_OWNER_UNASSIGNED'],
 ['MARK_UNREAD','W24_CONVERSATION_DB_OWNER_UNASSIGNED'],
 ['MARK_READ','W24_CONVERSATION_DB_OWNER_UNASSIGNED'],
 ['MUTE_UNTIL','W24_CONVERSATION_DB_OWNER_UNASSIGNED'],
 ['UNMUTE','W24_CONVERSATION_DB_OWNER_UNASSIGNED'],
 ['READ_PROFILE','W24_CURRENT_USER_CONTACT_PROOF_NOT_CONNECTED'],
 ['SEARCH_MESSAGES','W25_COMPLETE_HISTORY_AND_MID_AUTHORITY_NOT_CONNECTED'],
 ['READ_AI_MODE','W24_W44_W43_REAL_ACCOUNT_AGENT_JOIN_NOT_CONNECTED'],
 ['READ_AI_GRANT_BUDGET','W24_W44_W43_REAL_ACCOUNT_AGENT_JOIN_NOT_CONNECTED'],
 ['ISSUE_AI_GRANT','W24_W44_W43_REAL_ACCOUNT_AGENT_JOIN_NOT_CONNECTED'],
 ['PAUSE_AI_CONTACT','W24_W44_W43_REAL_ACCOUNT_AGENT_JOIN_NOT_CONNECTED'],
 ['RESUME_AI_CONTACT','W24_W44_W43_REAL_ACCOUNT_AGENT_JOIN_NOT_CONNECTED'],
 ['TAKEOVER_HUMAN','W24_ASSIST_TAKEOVER_OWNER_FIX_AND_CURRENT_K_REQUIRED'],
 ['ARCHIVE','W24_CONVERSATION_DB_OWNER_UNASSIGNED'],
 ['RESTORE','W24_CONVERSATION_DB_OWNER_UNASSIGNED'],
 ['LOCAL_HIDE','W24_CONVERSATION_DB_OWNER_UNASSIGNED'],
 ['SOFT_DELETE','W24_CONVERSATION_DB_OWNER_UNASSIGNED'],
 ['REACTION','W25_PROVIDER_MID_ACK_OWNER_NOT_SIGNED'],
 ['QUOTE_REPLY','W25_PROVIDER_MID_ACK_OWNER_NOT_SIGNED'],
 ['COPY_ORIGINAL','CURRENT_W24_MESSAGE_AUTHORITY_NOT_VERIFIED'],
 ['COPY_TRANSLATION','CURRENT_W24_MESSAGE_AUTHORITY_NOT_VERIFIED'],
 ['FORWARD','W25_PROVIDER_MID_ACK_OWNER_NOT_SIGNED'],
 ['FAVORITE_MESSAGE','W24_CONVERSATION_DB_OWNER_UNASSIGNED'],
 ['UNFAVORITE_MESSAGE','W24_CONVERSATION_DB_OWNER_UNASSIGNED'],
 ['ANALYZE_WITH_BRAIN','W24_W43_MESSAGE_SCOPE_AND_RUN_NOT_VERIFIED'],
 ['EDIT_MESSAGE','W25_PROVIDER_MID_ACK_OWNER_NOT_SIGNED'],
 ['RECALL_MESSAGE','W25_PROVIDER_MID_ACK_OWNER_NOT_SIGNED'],
 ['DELETE_MESSAGE','W25_PROVIDER_MID_ACK_OWNER_NOT_SIGNED'],
 ['MEDIA_MESSAGE_ACTION','W25_PROVIDER_MEDIA_AND_ACK_NOT_SIGNED']
 ]);
const respond=(res,status,body)=>{
 res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  'x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin',
  'referrer-policy':'no-referrer','vary':'Origin, Sec-Fetch-Site'});
 res.end(JSON.stringify(body));
};
export function createW47NativeContextMenuCapabilitiesHttp({sessionAuthority,webOrigin}={}){
 if(typeof sessionAuthority?.sessionFor!=='function'||typeof webOrigin!=='string')
  throw Error('W47_ORIGINAL_LOCAL_SESSION_REQUIRED');
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/v2/context-menu/'))return false;
  const send=(status,error)=>{respond(res,status,{ok:false,error,canSend:false});return true};
  if(url.pathname!=='/api/v2/context-menu/capabilities')return send(404,'CONTEXT_MENU_ROUTE_NOT_FOUND');
  if(req.method!=='GET')return send(405,'NATIVE_ACTION_OWNER_NOT_SIGNED');
  if(req.headers.origin&&req.headers.origin!==webOrigin)return send(403,'ORIGIN_NOT_ALLOWED');
  if(req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))
   return send(403,'CROSS_SITE_REQUEST_DENIED');
  if(url.search)return send(422,'CONTACT_SELECTOR_MUST_BE_VERIFIED_BY_W24');
  const before=sessionAuthority.sessionFor(req);
  if(!before||before.record?.kind!=='NATIVE_FIRST_PARTY')
   return send(401,'W54_NATIVE_OWNER_SESSION_REQUIRED');
  const after=sessionAuthority.sessionFor(req);
  if(!after||after.id!==before.id||after.record.rev!==before.record.rev)
   return send(401,'LOCAL_SESSION_REVOKED');
  respond(res,200,{
   ok:true,authoritative:true,source:'W47_RUNTIME_REAL_OWNER_CONNECTION_STATUS',
   ownerContracts:{identity:'W24_PERMISSION_SOURCE_ONLY',conversationDb:'OWNER_UNASSIGNED',
    aiGrant:'W44_SOURCE_ONLY',agent:'W43_REAL_ACCOUNT_JOIN_HOLD',
    takeover:'W24_ASSIST_MODE_OWNER_FIX_HOLD',messageDelivery:'W25_PROVIDER_ACK_HOLD'},
   scope:'CURRENT_NATIVE_FIRST_PARTY_SESSION_ONLY',
   serverVerifiedActor:false,serverVerifiedChannelAccount:false,
   // The full K, epochs, MID and permissions MUST come from original W24 and W25.
   // Do not let caller claims ever upgrade any action to COMMITTED.
   actions:Object.fromEntries(entries.map(([key,reason])=>[key,{
    state:'UI_DISABLED_HOLD',reason,canExecute:false,canSend:false}])),
   counts:{nativeVerified:0,providerUnsupported:0,fail:0,uiDisabledHold:entries.length},
   canSend:false
  });
  return true;
 };
}

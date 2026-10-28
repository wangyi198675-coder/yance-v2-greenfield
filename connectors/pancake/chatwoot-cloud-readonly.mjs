// Chatwoot Cloud is read-only standby. Official Application API, no generic API
// Inbox channel creation, no message POST, no Messenger send or automatic switch.
const abort=()=>Object.assign(new Error('CHATWOOT_HOLD'),{status:503});
const fail=(code,status=503)=>Object.assign(new Error(code),{code,status});
const numeric=(x,name)=>{const n=Number(x);if(!Number.isSafeInteger(n)||n<=0)throw fail('INVALID_'+name);return n;};
const required=(f,name)=>{if(typeof f!=='function')throw fail('MISSING_'+name);return f;};

export function chatwootCloudAuthorizationSetup(){
  return Object.freeze({
    provider:'CHATWOOT_CLOUD',state:'WAITING_USER_AUTH',role:'CONTROLLED_STANDBY_ONLY',
    officialSignin:'https://app.chatwoot.com/',
    officialDocs:'https://developers.chatwoot.com/',
    steps:[
      'User signs into official Chatwoot Cloud and explicitly links their own Meta Facebook Page to a Facebook Messenger Inbox.',
      'Verify the Inbox is a Facebook Page channel, not a generic API Channel.',
      'User supplies their own Cloud Application API access token through protected W55 native credential entry only.',
      'W24 and W47 authorize the same real Meta Page, tenant, account and PSID; obtain authoritative Meta conversation routing and both Apps.',
      'Confirm existing conversation or independently authorized Messenger cold-start and window; do not use generic API Channel Create Conversation.',
      'W25 alone may evaluate pending UNKNOWN, grant, Page send-owner epoch and CAS; no simultaneous providers.'
    ],canSend:false,automatedSwitch:false
  });
}

export function createChatwootCloudReader({
  resolveTrustedSession, resolveAuthorizedStandby, credentialLease,
  fetchImpl=globalThis.fetch
}){
  required(resolveTrustedSession,'TRUSTED_SESSION');
  required(resolveAuthorizedStandby,'W24_CHATWOOT_BINDING');
  required(credentialLease,'CREDENTIAL_CUSTODIAN');
  required(fetchImpl,'FETCH');
  async function context(){
    const p=await resolveTrustedSession();
    if(!p?.authenticated || !p.principalId || !p.sessionRevision)
      throw fail('NO_TRUSTED_SESSION',401);
    const b=await resolveAuthorizedStandby(p);
    if(!b||b.channel!=='FB_PAGE'||b.status!=='ACTIVE'||
       b.principalId!==p.principalId ||!b.metaPageId||
       !b.channelAccountId || !Number.isSafeInteger(b.bindingRevision) ||
       b.bindingRevision<=0 ||b.cloudOrigin!=='https://app.chatwoot.com' ||
       !b.chatwootAccountId) throw fail('NO_APPROVED_CHATWOOT_PAGE_BINDING',403);
    return {p,b};
  }
  async function get(endpoint){
    const {p,b}=await context();
    const token=await credentialLease({
      provider:'CHATWOOT_CLOUD',principalId:p.principalId,
      channelAccountId:b.channelAccountId,bindingRevision:b.bindingRevision
    });
    if(token?.provider!=='CHATWOOT_CLOUD' ||
       token.channelAccountId!==b.channelAccountId ||
       token.bindingRevision!==b.bindingRevision ||
       typeof token.secret!=='string'||token.secret.length<8||
       token.expiresAtMs<=Date.now())throw fail('NO_VALID_CLOUD_TOKEN_LEASE',401);
    const u=new URL('https://app.chatwoot.com/api/v1/accounts/'+numeric(b.chatwootAccountId,'ACCOUNT_ID')+endpoint);
    if(u.protocol!=='https:'||u.host!=='app.chatwoot.com')throw fail('UNTRUSTED_CLOUD_HOST');
    try {
      const r=await fetchImpl(u,{method:'GET',redirect:'error',cache:'no-store',
        headers:{Accept:'application/json',api_access_token:token.secret},
        signal:AbortSignal.timeout(12000)});
      if(r?.status===401||r?.status===403)throw fail('CHATWOOT_AUTH_REVOKED',401);
      if(r?.status!==200)throw fail('CHATWOOT_UNAVAILABLE');
      const raw=await r.text();
      if(Buffer.byteLength(raw,'utf8')>2_000_000)throw fail('CHATWOOT_BODY_TOO_LARGE');
      try {return {json:JSON.parse(raw),binding:b};}
      catch {throw fail('INVALID_CHATWOOT_RESPONSE');}
    }catch(e){
      if(e?.code)throw e;
      throw fail('CHATWOOT_NETWORK_UNAVAILABLE');
    }
  }
  return Object.freeze({
    async listFacebookInboxes(){
      const {json,binding}=await get('/inboxes');
      const a=Array.isArray(json?.payload)?json.payload:Array.isArray(json)?json:null;
      if(!a)throw fail('INVALID_CHATWOOT_INBOX_RESPONSE');
      return { state:'READ_ONLY_CLOUD_DATA',channelAccountId:binding.channelAccountId,
        metaPageId:binding.metaPageId,sendEnabled:false,
        inboxes:a.filter(x=>String(x.channel_type||'').toLowerCase().includes('facebook')).map(x=>({
          id:x.id,channelType:x.channel_type,name:x.name,
          // An inbox listing does NOT prove the same Meta Page or PSID.
          metaPageBindingVerified:false
        })) };
    },
    async listConversations({inboxId,page=1}){
      const id=numeric(inboxId,'INBOX_ID');
      numeric(page,'PAGE');
      const {json,binding}=await get('/conversations?status=all&inbox_id='+id+'&page='+page);
      const a=Array.isArray(json?.data?.payload)?json.data.payload:
        Array.isArray(json?.payload)?json.payload:null;
      if(!a)throw fail('INVALID_CHATWOOT_CONVERSATIONS_RESPONSE');
      return {state:'READ_ONLY_CLOUD_DATA',channelAccountId:binding.channelAccountId,
        metaPageId:binding.metaPageId,conversations:a.filter(x=>Number(x.inbox_id)===id),
        realMetaConversationProof:false,eligibleToSwitch:false,sendEnabled:false};
    },
    authorizationSetup:chatwootCloudAuthorizationSetup
  });
}

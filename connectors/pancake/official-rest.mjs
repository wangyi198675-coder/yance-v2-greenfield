// Real upstream Pancake REST transport. Scope: read-only; no send or secondary Outbox.
// Only the existing W47 native runtime may supply a trusted session resolver;
// only an authorized credential custodian (W55/approved Owner) may supply token leases.
// Never accept a credential or authorization flag from a browser/webhook JSON body.

const USER_API = 'https://pages.fm/api/v1';
const PAGE_V1 = 'https://pages.fm/api/public_api/v1';
const PAGE_V2 = 'https://pages.fm/api/public_api/v2';
const MAX_BODY = 2_000_000;
const TIMEOUT_MS = 12_000;
const allowedHost = 'pages.fm';
const requiredFunction = (f, name) => {
  if (typeof f !== 'function') throw new TypeError('MISSING_NATIVE_' + name);
  return f;
};
const str = (v, name, limit = 256) => {
  if (typeof v !== 'string' || !v || v.length > limit || /[\x00-\x1f\x7f]/.test(v))
    throw new Error('INVALID_' + name);
  return v;
};
const id = (v, name) => encodeURIComponent(str(String(v ?? ''), name));
const int = (v, name, min, max) => {
  if (!Number.isSafeInteger(v) || v < min || v > max) throw new Error('INVALID_' + name);
  return v;
};
const error = (code, status = 503) =>
  Object.assign(new Error(code), { code, status });
function sanitizedErrorStatus(httpStatus) {
  if (httpStatus === 401 || httpStatus === 403) return error('PROVIDER_AUTH_EXPIRED_OR_FORBIDDEN', 401);
  if (httpStatus === 429) return error('PROVIDER_RATE_LIMITED', 429);
  if (httpStatus >= 500) return error('PROVIDER_UNAVAILABLE');
  return error('PROVIDER_REQUEST_REJECTED', 502);
}
function normalizeResponse(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result))
    throw error('INVALID_PROVIDER_BODY');
  if (result.success === false) throw error('PROVIDER_REJECTED');
  return result;
}
function accountState({ principal, binding }) {
  // Principal and binding MUST come from the server-owned W47/W24 resolver, never HTTP input.
  if (!principal?.authenticated || !principal?.principalId || !principal?.sessionRevision)
    throw error('NO_TRUSTED_NATIVE_SESSION', 401);
  if (!binding || binding.status !== 'ACTIVE' || binding.channel !== 'FB_PAGE' ||
      binding.principalId !== principal.principalId || !binding.channelAccountId ||
      !binding.metaPageId || !binding.pancakePageId ||
      !Number.isSafeInteger(binding.bindingRevision) || binding.bindingRevision < 1 ||
      !Number.isSafeInteger(binding.accountRevocationEpoch) ||
      !Number.isSafeInteger(binding.consentEpoch) ||
      binding.accountRevocationEpoch < 0 || binding.consentEpoch < 0 ||
      binding.peerRevoked === true) throw error('CHANNEL_ACCOUNT_UNAUTHORIZED', 403);
  return Object.freeze({
    principalId: principal.principalId,
    channelAccountId: binding.channelAccountId,
    metaPageId: binding.metaPageId,
    pancakePageId: binding.pancakePageId,
    bindingRevision: binding.bindingRevision,
    accountRevocationEpoch: binding.accountRevocationEpoch,
    consentEpoch: binding.consentEpoch
  });
}
export function pancakeAuthorizationSetup() {
  return Object.freeze({
    provider: 'PANCAKE', channel: 'FB_PAGE', status: 'WAITING_USER_AUTH',
    officialSignin: 'https://pages.fm/',
    officialDocs: 'https://developer.pancake.biz/',
    officialWebhookDocs: 'https://developer.pancake.biz/webhook',
    requiredSteps: [
      'User explicitly signs into their own approved Pancake account via official site.',
      'User checks Meta Page admin ownership and legal Pancake integration entitlement.',
      'In Page Settings → Tools, user obtains a Page Access Token; or from Personal Settings obtains a User Access Token.',
      'User enters credentials only in protected native Windows credential UI owned by W55, never in URL, repo, logs, browser or assistant chat.',
      'Native runtime W47 and W24 verify current Principal → channel account → Page ownership and revocation epochs.',
      'Official Pancake webhook origin verification and secure receiving endpoint must be approved before incoming data is trusted.',
      'W25 remains the only actual sender; no automatic Chatwoot failover.'
    ],
    canConnectWithoutUserAuth: false, canSend: false, webhookEnabled: false
  });
}

export function createPancakeOfficialRest({
  resolveTrustedSession, resolveChannelBinding, credentialLease,
  fetchImpl = globalThis.fetch, signalTimeoutMs = TIMEOUT_MS
}) {
  requiredFunction(resolveTrustedSession, 'SESSION_RESOLVER');
  requiredFunction(resolveChannelBinding, 'CHANNEL_BINDING');
  requiredFunction(credentialLease, 'CREDENTIAL_CUSTODIAN');
  requiredFunction(fetchImpl, 'FETCH');
  int(signalTimeoutMs, 'REQUEST_TIMEOUT', 1, 30_000);

  async function trusted(requestedPageId = null) {
    const principal = await resolveTrustedSession();
    const binding = await resolveChannelBinding(principal, { channel: 'FB_PAGE', pageId: requestedPageId });
    const state = accountState({ principal, binding });
    if (requestedPageId && state.pancakePageId !== requestedPageId)
      throw error('PAGE_SCOPE_MISMATCH', 403);
    return state;
  }
  async function request({base, path, params = {}, principalState, tokenKind, timeoutMs = signalTimeoutMs}) {
    const tokenLease = await credentialLease({
      provider: 'PANCAKE', tokenKind, principalId: principalState.principalId,
      channelAccountId: principalState.channelAccountId, metaPageId: principalState.metaPageId,
      bindingRevision: principalState.bindingRevision,
      revocationEpoch: principalState.accountRevocationEpoch
    });
    if (tokenLease?.provider !== 'PANCAKE' || tokenLease?.kind !== tokenKind ||
        tokenLease?.channelAccountId !== principalState.channelAccountId ||
        tokenLease?.bindingRevision !== principalState.bindingRevision ||
        tokenLease?.revocationEpoch !== principalState.accountRevocationEpoch ||
        tokenLease?.expiresAtMs <= Date.now() || typeof tokenLease.secret !== 'string' ||
        tokenLease.secret.length < 8) throw error('NO_VALID_PROVIDER_TOKEN_LEASE', 401);
    const url = new URL(base + path);
    if (url.protocol !== 'https:' || url.hostname !== allowedHost || url.username || url.password)
      throw error('UNTRUSTED_PROVIDER_ENDPOINT');
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    url.searchParams.set(tokenKind === 'USER' ? 'access_token' : 'page_access_token', tokenLease.secret);
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET', redirect: 'error', cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response || typeof response.status !== 'number') throw error('INVALID_PROVIDER_RESPONSE');
      if (response.status !== 200) throw sanitizedErrorStatus(response.status);
      if (Number(response.headers?.get?.('content-length') || '0') > MAX_BODY)
        throw error('PROVIDER_BODY_TOO_LARGE');
      const raw = await response.text();
      if (Buffer.byteLength(raw, 'utf8') > MAX_BODY) throw error('PROVIDER_BODY_TOO_LARGE');
      let json;
      try { json = JSON.parse(raw); } catch { throw error('INVALID_PROVIDER_JSON'); }
      // Re-check W47/W24 after the remote read to reject a revoke/rebind race.
      const current = await trusted(principalState.pancakePageId);
      if (current.channelAccountId !== principalState.channelAccountId ||
          current.metaPageId !== principalState.metaPageId ||
          current.bindingRevision !== principalState.bindingRevision ||
          current.accountRevocationEpoch !== principalState.accountRevocationEpoch ||
          current.consentEpoch !== principalState.consentEpoch)
        throw error('PROVIDER_RESULT_STALE_AUTHORITY', 409);
      return normalizeResponse(json);
    } catch (e) {
      if (e?.code) throw e;
      // Never expose fetch exceptions: these may include URL including secret query token.
      throw error('PROVIDER_NETWORK_UNAVAILABLE');
    } finally {
      // Tokens are lease-local; caller never receives the query URL or credential.
      url.searchParams.delete('access_token');
      url.searchParams.delete('page_access_token');
    }
  }
  // An account token is only ever supplied by a protected native credential custodian.
  async function listAuthorizedPages() {
    const state = await trusted();
    const raw = await request({ base: USER_API, path: '/pages', principalState: state, tokenKind: 'USER' });
    if (!Array.isArray(raw.pages)) throw error('INVALID_PAGES_RESPONSE');
    return Object.freeze({
      status: 'READ_ONLY_PROVIDER_DATA', channelAccountId: state.channelAccountId,
      pages: raw.pages.map(p => ({ id: p.id, name: p.name, platform: p.platform ?? null })),
      canSend: false
    });
  }
  async function scoped(pageId) { return trusted(str(pageId, 'PAGE_ID')); }
  async function listConversations({ pageId, lastConversationId, type, since, until } = {}) {
    const state = await scoped(pageId);
    const params = {};
    if (lastConversationId) params.last_conversation_id = str(lastConversationId, 'CURSOR');
    if (type) params.type = str(type, 'CONVERSATION_TYPE');
    if (since !== undefined) params.since = int(since, 'SINCE', 0, Number.MAX_SAFE_INTEGER);
    if (until !== undefined) params.until = int(until, 'UNTIL', 0, Number.MAX_SAFE_INTEGER);
    const raw = await request({ base: PAGE_V2, path: '/pages/' + id(pageId, 'PAGE_ID') + '/conversations',
      params, principalState: state, tokenKind: 'PAGE' });
    if (!Array.isArray(raw.conversations)) throw error('INVALID_CONVERSATIONS_RESPONSE');
    return { status: 'READ_ONLY_PROVIDER_DATA', pageId: state.metaPageId,
      channelAccountId: state.channelAccountId, bindingRevision: state.bindingRevision,
      conversations: raw.conversations, canSend: false };
  }
  async function listMessages({ pageId, conversationId, currentCount } = {}) {
    const state = await scoped(pageId);
    const params = {};
    if (currentCount !== undefined) params.current_count = int(currentCount,'CURRENT_COUNT',0,1000000);
    const raw = await request({ base: PAGE_V1,
      path: '/pages/' + id(pageId,'PAGE_ID') + '/conversations/' + id(conversationId,'CONVERSATION_ID') + '/messages',
      params, principalState: state, tokenKind: 'PAGE' });
    if (!Array.isArray(raw.messages)) throw error('INVALID_MESSAGES_RESPONSE');
    return { status: 'READ_ONLY_PROVIDER_DATA', pageId: state.metaPageId,
      channelAccountId: state.channelAccountId, conversationId,
      messages: raw.messages, convFrom: raw.conv_from?.id ? { id: raw.conv_from.id } : null,
      attachmentMetadata: raw.messages.flatMap(m => (Array.isArray(m.attachments)
        ? m.attachments.map(a => ({ messageId: m.id, id: a.id ?? null,
          type: a.type ?? null, size: a.size ?? null, mimeType: a.mime_type ?? null })) : [])),
      verifiedMetaMid: null, canSend: false };
  }
  async function listCustomers({ pageId, since, until, pageNumber = 1, pageSize = 50 } = {}) {
    const state = await scoped(pageId);
    const params = {
      since: int(since,'SINCE',0,Number.MAX_SAFE_INTEGER),
      until: int(until,'UNTIL',0,Number.MAX_SAFE_INTEGER),
      page_number: int(pageNumber,'PAGE_NUMBER',1,1000000),
      page_size: int(pageSize,'PAGE_SIZE',1,100)
    };
    if (params.since > params.until) throw error('INVALID_TIME_RANGE', 422);
    const raw = await request({ base: PAGE_V1, path:'/pages/' + id(pageId,'PAGE_ID') + '/page_customers',
      params, principalState:state, tokenKind:'PAGE' });
    if (!Array.isArray(raw.customers)) throw error('INVALID_CUSTOMERS_RESPONSE');
    return { status:'READ_ONLY_PROVIDER_DATA', pageId:state.metaPageId,
      channelAccountId:state.channelAccountId, total:raw.total ?? null,
      customers: raw.customers.map(c => ({
        pageCustomerId:c.id, psid:c.psid ?? null, customerId:c.customer_id ?? null,
        name:c.name ?? null, verifiedPagePeer:false
      })), canSend:false };
  }
  async function listPageUsers({ pageId } = {}) {
    const state = await scoped(pageId);
    const raw = await request({ base: PAGE_V1,path:'/pages/'+id(pageId,'PAGE_ID')+'/users',
      principalState:state, tokenKind:'PAGE' });
    if (!Array.isArray(raw.users)) throw error('INVALID_PAGE_USERS_RESPONSE');
    return { status:'READ_ONLY_PROVIDER_DATA', channelAccountId:state.channelAccountId,
      users:raw.users.map(u=>({ id:u.id, status:u.status, statusInPage:u.status_in_page ?? null })),
      canSend:false };
  }
  return Object.freeze({
    listAuthorizedPages, listConversations, listMessages, listCustomers, listPageUsers,
    authorizationSetup: pancakeAuthorizationSetup,
    capabilities: () => ({ channel:'FB_PAGE', provider:'PANCAKE', nativeTransport:'OFFICIAL_HTTPS_REST',
      owner:'W27', outboundOwnedBy:'W25_ONLY', webhook:'REQUIRES_VERIFIED_ORIGIN',
      canSend:false, realAccountState:'REQUIRES_TRUSTED_W47_W24_W55' })
  });
}

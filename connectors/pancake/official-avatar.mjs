// W27 official Pancake avatar read-only integration.
// Official public endpoint, as documented in Pancake OpenAPI v1:
// GET https://pages.fm/api/v1/pages/{page_id}/avatar/{psid}
// 301 -> https://content.pancake.vn/... (no Page Access Token).
//
// The endpoint being public does NOT entitle arbitrary identity lookups.
// Gate through the existing W47 native session + W24 Page/Peer binding before
// resolving and again before returning. No image DB, alternate provider,
// Facebook protocol, outbound message or automatic model use.

const DENY = (code, status = 403) => Object.assign(new Error(code), {code, status});
const validId = (v, name) => {
  if (typeof v !== 'string' || !/^[0-9]{1,40}$/.test(v))
    throw DENY('INVALID_' + name, 422);
  return v;
};
function validState(principal, binding, pageId, psid) {
  if (principal?.authenticated !== true || !principal.principalId ||
      !Number.isSafeInteger(principal.sessionRevision) || principal.sessionRevision < 1)
    throw DENY('NO_TRUSTED_NATIVE_SESSION', 401);
  if (binding?.channel !== 'FB_PAGE' || binding?.provider !== 'PANCAKE' ||
      binding?.active !== true || binding?.verifiedByW24 !== true ||
      binding?.principalId !== principal.principalId ||
      binding?.providerPageId !== pageId || binding?.pageScopedPsid !== psid ||
      !binding.channelAccountId ||
      !Number.isSafeInteger(binding.bindingRevision) || binding.bindingRevision < 1 ||
      !Number.isSafeInteger(binding.accountRevocationEpoch) || binding.accountRevocationEpoch < 0 ||
      !Number.isSafeInteger(binding.consentEpoch) || binding.consentEpoch < 0)
    throw DENY('NO_CURRENT_W24_PAGE_PEER_AUTHORITY');
  return Object.freeze({
    channelAccountId:binding.channelAccountId,
    bindingRevision:binding.bindingRevision,
    accountRevocationEpoch:binding.accountRevocationEpoch,
    consentEpoch:binding.consentEpoch
  });
}
const same = (a,b) => Object.keys(a).every(k=>a[k]===b[k]);
export function createOfficialPancakeAvatarResolver({
  resolveTrustedNativeSession,resolveCurrentW24PagePeer,fetchImpl=globalThis.fetch
} = {}) {
  if ([resolveTrustedNativeSession,resolveCurrentW24PagePeer,fetchImpl]
    .some(fn=>typeof fn !== 'function'))
    throw DENY('MISSING_NATIVE_AVATAR_DEPENDENCY',503);
  async function readAuthorizedAvatar({pageId,psid}={}) {
    // Only operate on an already authorized account's verified Page-scoped peer.
    pageId=validId(pageId,'PAGE_ID');
    psid=validId(psid,'PAGE_SCOPED_PSID');
    const p=await resolveTrustedNativeSession();
    const bindingRequest={channel:'FB_PAGE',provider:'PANCAKE',
      providerPageId:pageId,pageScopedPsid:psid,principalId:p?.principalId};
    const before=validState(p,await resolveCurrentW24PagePeer(bindingRequest),pageId,psid);
    const official = new URL('https://pages.fm/api/v1/pages/'+pageId+'/avatar/'+psid);
    let response;
    try {
      response=await fetchImpl(official,{method:'GET',redirect:'manual',cache:'no-store',
        signal:AbortSignal.timeout(10000),headers:{Accept:'image/*'}});
    } catch {
      // Never leak URLs or identifiers from underlying provider errors.
      throw DENY('PANCAKE_AVATAR_UNAVAILABLE',503);
    }
    if (response?.status === 404 || response?.status === 410)
      return Object.freeze({status:'NO_AVATAR',avatarUrl:null,canSend:false});
    // Public OpenAPI states exact 301 redirect. Do NOT auto-follow unknown sites.
    if (response?.status !== 301)
      throw DENY('UNEXPECTED_PANCAKE_AVATAR_RESPONSE',502);
    const location=response.headers?.get?.('location');
    let target;
    try { target=new URL(location); }
    catch { throw DENY('INVALID_PANCAKE_AVATAR_LOCATION',502); }
    if (target.protocol !== 'https:' || target.hostname !== 'content.pancake.vn' ||
        target.username || target.password || target.port ||
        !target.pathname.startsWith('/') || target.pathname.length > 1024)
      throw DENY('UNTRUSTED_PANCAKE_AVATAR_CDN',502);
    // An unrelated original actor, stale revocation epoch, or newly rebound
    // Page/PSID must not receive the previous user's CDN avatar URL.
    const now=await resolveTrustedNativeSession();
    if (now?.principalId !== p.principalId ||
        now?.sessionRevision !== p.sessionRevision)
      throw DENY('NATIVE_SESSION_CHANGED_DURING_READ',409);
    const after=validState(now,await resolveCurrentW24PagePeer(bindingRequest),pageId,psid);
    if (!same(before,after)) throw DENY('W24_AVATAR_BINDING_STALE',409);
    return Object.freeze({
      status:'PRESENT',source:'PANCAKE_OFFICIAL_PUBLIC_AVATAR_REDIRECT',
      avatarUrl:target.toString(),channelAccountId:after.channelAccountId,
      bindingRevision:after.bindingRevision,canSend:false
    });
  }
  return Object.freeze({readAuthorizedAvatar});
}

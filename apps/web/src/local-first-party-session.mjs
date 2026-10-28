// Reuse the ORIGINAL W47 same-origin /local-session authority.
// WhatsApp and Pancake mount together. One in-flight bootstrap avoids
// overwriting the browser's HttpOnly cookie with two separate CSRF grants.
// No new login provider, credential store, or session ownership.
const pendingByFetch=new WeakMap();
const invalid=code=>{throw Object.assign(new Error(code),{code})};
const safeSession=s=>s?.ok===true&&s?.paired===true&&
  ['WEB_LOCAL_PRIVATE','NATIVE_FIRST_PARTY'].includes(s.sessionKind)&&
  /^[a-f0-9]{64}$/.test(s.csrfToken??'');
const read=async f=>{
  const r=await f('/api/v2/local-session/status',{method:'GET',
    credentials:'same-origin',cache:'no-store',redirect:'error',
    referrerPolicy:'no-referrer'});
  return r?.ok?await r.json():null;
};
export async function renewFirstPartyWebSession(fetchImpl=globalThis.fetch){
  if(typeof fetchImpl!=='function')invalid('LOCAL_FIRST_PARTY_FETCH_REQUIRED');
  const prior=pendingByFetch.get(fetchImpl);
  if(prior)return prior;
  const running=(async()=>{
    const post=await fetchImpl('/api/v2/local-session/web-private-start',{
      method:'POST',credentials:'same-origin',cache:'no-store',
      redirect:'error',referrerPolicy:'no-referrer',
      headers:{'Content-Type':'application/json'},body:'{}'
    });
    if(!post?.ok)invalid('LOCAL_FIRST_PARTY_BOOTSTRAP_HTTP_'+(post?.status??0));
    // Read BACK from the browser's actual HttpOnly cookie. The response to
    // POST alone is not proof that a concurrent mount hasn't rotated it.
    const session=await read(fetchImpl);
    if(!safeSession(session))invalid('LOCAL_FIRST_PARTY_SESSION_NOT_VERIFIED');
    return session;
  })();
  pendingByFetch.set(fetchImpl,running);
  try{return await running}finally{
    if(pendingByFetch.get(fetchImpl)===running)pendingByFetch.delete(fetchImpl);
  }
}
export async function currentFirstPartyWebSession(fetchImpl=globalThis.fetch){
  if(typeof fetchImpl!=='function')invalid('LOCAL_FIRST_PARTY_FETCH_REQUIRED');
  const first=await read(fetchImpl);
  if(safeSession(first))return first;
  const pending=pendingByFetch.get(fetchImpl);
  if(pending)return pending;
  return renewFirstPartyWebSession(fetchImpl);
}

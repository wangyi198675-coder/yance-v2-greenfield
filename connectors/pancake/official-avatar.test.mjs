import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfficialPancakeAvatarResolver} from './official-avatar.mjs';

const principal={authenticated:true,principalId:'native-owner',sessionRevision:17};
const binding={
  channel:'FB_PAGE',provider:'PANCAKE',active:true,verifiedByW24:true,
  principalId:'native-owner',providerPageId:'123456',pageScopedPsid:'778899',
  channelAccountId:'current-page-binding',bindingRevision:4,
  accountRevocationEpoch:2,consentEpoch:5
};
function setup(opts={}) {
  let calls=0, reads=0;
  const resolver=createOfficialPancakeAvatarResolver({
    resolveTrustedNativeSession:async()=>opts.session??principal,
    resolveCurrentW24PagePeer:async()=>{reads++;return opts.boundAfter&&reads>1?opts.boundAfter:(opts.bound??binding);},
    fetchImpl:async(url,init)=>{
      calls++;
      assert.equal(url.toString(),'https://pages.fm/api/v1/pages/123456/avatar/778899');
      assert.equal(init.redirect,'manual');
      assert.equal(init.method,'GET');
      if(opts.throwFetch)throw Error('secret user URL in underlying error');
      return {status:opts.status??301,headers:{get:()=>opts.location??'https://content.pancake.vn/avatars/abcd'}};
    }
  });
  return {resolver,get calls(){return calls;},get reads(){return reads;}};
}
const args={pageId:'123456',psid:'778899'};
const rejects=(value,code)=>assert.rejects(value,{code});
test('official Pancake avatar returns only approved CDN URL for authorized current Page Peer',async()=>{
  const x=setup();const r=await x.resolver.readAuthorizedAvatar(args);
  assert.equal(r.status,'PRESENT');
  assert.equal(r.source,'PANCAKE_OFFICIAL_PUBLIC_AVATAR_REDIRECT');
  assert.equal(r.avatarUrl,'https://content.pancake.vn/avatars/abcd');
  assert.equal(r.canSend,false);
  assert.equal(x.calls,1);assert.equal(x.reads,2);
});
test('rejects unauthenticated native Principal before provider request',async()=>{
  const x=setup({session:{authenticated:false}});
  await rejects(x.resolver.readAuthorizedAvatar(args),'NO_TRUSTED_NATIVE_SESSION');
  assert.equal(x.calls,0);
});
test('rejects cross Page or cross PSID W24 peer ownership',async()=>{
  const x=setup({bound:{...binding,providerPageId:'777777'}});
  await rejects(x.resolver.readAuthorizedAvatar(args),'NO_CURRENT_W24_PAGE_PEER_AUTHORITY');
  assert.equal(x.calls,0);
  const y=setup({bound:{...binding,pageScopedPsid:'998877'}});
  await rejects(y.resolver.readAuthorizedAvatar(args),'NO_CURRENT_W24_PAGE_PEER_AUTHORITY');
  assert.equal(y.calls,0);
});
test('W24 revoked account refuses avatar read',async()=>{
  const x=setup({bound:{...binding,active:false}});
  await rejects(x.resolver.readAuthorizedAvatar(args),'NO_CURRENT_W24_PAGE_PEER_AUTHORITY');
  assert.equal(x.calls,0);
});
test('invalid peer ID cannot be inserted into URL',async()=>{
  const x=setup();
  await rejects(x.resolver.readAuthorizedAvatar({pageId:'123456',psid:'../other'}),'INVALID_PAGE_SCOPED_PSID');
  assert.equal(x.calls,0);
});
test('missing avatar results in truthful no avatar not fake image',async()=>{
  const x=setup({status:404});
  const r=await x.resolver.readAuthorizedAvatar(args);
  assert.equal(r.status,'NO_AVATAR');assert.equal(r.avatarUrl,null);
});
test('rejects arbitrary redirect and insecure image CDN',async()=>{
  for(const location of ['https://evil.example/path','http://content.pancake.vn/x',
    'https://content.pancake.vn.evil.test/avatars/a',
    'https://user:pass@content.pancake.vn/x']){
    const x=setup({location});
    await rejects(x.resolver.readAuthorizedAvatar(args),'UNTRUSTED_PANCAKE_AVATAR_CDN');
  }
});
test('revocation epoch or bindingRevision change during read denies stale URL',async()=>{
  const x=setup({boundAfter:{...binding,accountRevocationEpoch:3}});
  await rejects(x.resolver.readAuthorizedAvatar(args),'W24_AVATAR_BINDING_STALE');
  const y=setup({boundAfter:{...binding,bindingRevision:5}});
  await rejects(y.resolver.readAuthorizedAvatar(args),'W24_AVATAR_BINDING_STALE');
});
test('provider network failure never leaks underlying target or identifier',async()=>{
  const x=setup({throwFetch:true});
  try {await x.resolver.readAuthorizedAvatar(args);assert.fail('should reject');}
  catch(e){assert.equal(e.code,'PANCAKE_AVATAR_UNAVAILABLE');
    assert.doesNotMatch(e.message,/secret|123456|778899/);}
});
test('never treat provider 200 HTML or arbitrary 302 as confirmed avatar',async()=>{
  for(const status of [200,302,403,429,500]){
    const x=setup({status});
    await rejects(x.resolver.readAuthorizedAvatar(args),'UNEXPECTED_PANCAKE_AVATAR_RESPONSE');
  }
});

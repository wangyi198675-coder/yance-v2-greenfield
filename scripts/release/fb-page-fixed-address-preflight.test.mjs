import test from 'node:test';
import assert from 'node:assert/strict';
import {assertRuntimeGate} from './fb-page-fixed-address-preflight.mjs';

const WEB='a'.repeat(40),API='b'.repeat(40);
const mock=(overrides={})=>async url=>{
  const path=new URL(url).pathname;
  const defaultByPath={
    '/version.json':[200,{source_sha:WEB,api_source_sha:'stale-version-json'}],
    '/api/v2/runtime/health':[200,{runtimeSha:API,canSend:false}],
    '/api/v2/providers/fb-page/onboarding/capabilities':[403,{}],
    '/api/v2/providers/whatsapp-personal/native/status':[401,{}],
    '/api/v2/providers/fb-personal/status':[200,{canSend:false}]
  };
  const [status,data]=overrides[path]||defaultByPath[path]||[404,{}];
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
};
const call=fetchImpl=>assertRuntimeGate({
  webOrigin:'http://127.0.0.1:44751/',expectedWebSha:WEB,
  expectedApiSha:API,fetchImpl
});
test('current 44751 exact Web + actual API + untrusted Page 403 qualifies only transport',async()=>{
  const r=await call(mock());
  assert.equal(r.result,'PASS_TRANSPORT_ONLY');
  assert.equal(r.authenticatedChromeW55CredentialReady,'REQUIRED_NOT_PROVEN');
});
test('W09 release to an old API returning Page 404 is rejected',async()=>{
  await assert.rejects(call(mock({
    '/api/v2/providers/fb-page/onboarding/capabilities':[404,{}]
  })),/FB_PAGE_ONBOARDING_ROUTE_OR_AUTH_REGRESSION_404/);
});
test('version.json cannot mask runtime SHA rollback',async()=>{
  await assert.rejects(call(mock({
    '/api/v2/runtime/health':[200,{runtimeSha:'c'.repeat(40)}]
  })),/ACTUAL_API_RUNTIME_SHA_MISMATCH/);
});
test('regressed WhatsApp path is rejected',async()=>{
  await assert.rejects(call(mock({
    '/api/v2/providers/whatsapp-personal/native/status':[404,{}]
  })),/WHATSAPP_NATIVE_ROUTE_REGRESSION_404/);
});
test('a nonlocal preview origin is not accepted',async()=>{
  await assert.rejects(assertRuntimeGate({
    webOrigin:'https://evil.test/',expectedWebSha:WEB,expectedApiSha:API,
    fetchImpl:mock()
  }),/LOOPBACK_ORIGIN_REQUIRED/);
});

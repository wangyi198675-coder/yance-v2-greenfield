import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const script=String.raw`
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createLocalSessionAuthority,createLocalSessionHttpApi} from './local-session.mjs';
const auth=createLocalSessionAuthority();
const handle=createLocalSessionHttpApi({authority:auth,webOrigin:'http://127.0.0.1:44751',enableWebPrivate:true});
const processRequest=async(method,path,headers,body)=>{
 const request=Readable.from(body===null?[]:[Buffer.from(body)]);request.method=method;request.headers=headers;
 const response={status:null,headers:null,body:'',writeHead(code,heads){this.status=code;this.headers=heads},end(value){this.body=value}};
 await handle(request,response,new URL('http://127.0.0.1:44751'+path));return response;
};
const suffix=process.env.YANCE_W47_WEB_COOKIE_SUFFIX;
const name='yance_web_private_session'+(suffix?'_'+suffix:'');
const headers={origin:'http://127.0.0.1:44751','sec-fetch-site':'same-origin','content-type':'application/json'};
const started=await processRequest('POST','/api/v2/local-session/web-private-start',headers,'{}');
assert.equal(started.status,200);
assert.ok(started.headers['set-cookie'].startsWith(name+'='));
assert.match(started.headers['set-cookie'],/HttpOnly; SameSite=Strict; Path=\//);
const cookie=started.headers['set-cookie'].split(';')[0];
const valid=await processRequest('GET','/api/v2/local-session/status',{cookie},null);
assert.equal(valid.status,200);
assert.equal(JSON.parse(valid.body).authorized,true);
// Real Opera request on 2026-10-28 was 4454 bytes: unrelated cookies must not
// invalidate a valid first-party HttpOnly session merely due to aggregate size.
const crowded='other_browser_cookie='+('x'.repeat(4400))+'; '+cookie;
assert.ok(Buffer.byteLength(crowded,'utf8')>4096);
const busyBrowser=await processRequest('GET','/api/v2/local-session/status',{cookie:crowded},null);
assert.equal(JSON.parse(busyBrowser.body).authorized,true);
const duplicated=await processRequest('GET','/api/v2/local-session/status',{cookie:cookie+'; '+cookie},null);
assert.equal(JSON.parse(duplicated.body).authorized,false);
const tooLong=await processRequest('GET','/api/v2/local-session/status',{cookie:'padding='+('x'.repeat(16500))+'; '+cookie},null);
assert.equal(JSON.parse(tooLong.body).authorized,false);
const unrelated=await processRequest('GET','/api/v2/local-session/status',{cookie:'yance_web_private_session='+('b'.repeat(64))},null);
assert.equal(JSON.parse(unrelated.body).authorized,false);
const noCookie=await processRequest('GET','/api/v2/local-session/status',{},null);
assert.equal(JSON.parse(noCookie.body).authorized,false);
console.log('WEB_COOKIE_NAMESPACE_ROUNDTRIP_PASS');
`;
function child(suffix){
 const env={...process.env};delete env.YANCE_W47_WEB_COOKIE_SUFFIX;
 if(suffix!==null)env.YANCE_W47_WEB_COOKIE_SUFFIX=suffix;
 return spawnSync(process.execPath,['--input-type=module','-e',script],{env,cwd:new URL('.',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),encoding:'utf8',timeout:20000});
}
test('existing default WEB cookie retains original W47 name and CSRF authority',()=>{
 const r=child(null);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/ROUNDTRIP_PASS/);
});
test('isolated PRIVATE session cookie survives unrelated localhost legacy cookie',()=>{
 const r=child('p0page49369');assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/ROUNDTRIP_PASS/);
});
test('invalid cookie name suffix is rejected at module load',()=>{
 const r=child('bad; Domain=example.com');assert.notEqual(r.status,0);
 assert.match(r.stderr,/W47_WEB_COOKIE_SUFFIX_INVALID/);
});

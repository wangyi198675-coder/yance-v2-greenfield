import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../runtime/vite.w47.config.mjs',import.meta.url),'utf8');
test('W09 approved read-only path is exactly setup and status, never login/send/claim',()=>{
 assert.match(source,/W09_FB_READONLY_STATUS_TARGET/);
 assert.match(source,/W09_FB_READONLY_TARGET_NOT_APPROVED/);
 const pattern=String.raw`^/api/v2/providers/fb-personal/(?:setup|status)(?:\?.*)?$`;
 assert.ok(source.includes(String.raw`'^/api/v2/providers/fb-personal/(?:setup|status)(?:\\?.*)?$'`));
 const route=new RegExp(pattern);
 for(const url of ['/api/v2/providers/fb-personal/status',
   '/api/v2/providers/fb-personal/setup',
   '/api/v2/providers/fb-personal/status?ignored=x']){
  assert.ok(route.test(url),url);
 }
 for(const url of ['/api/v2/providers/fb-personal/auth/flows',
   '/api/v2/providers/fb-personal/claim',
   '/api/v2/providers/fb-personal/send',
   '/api/v2/providers/whatsapp-personal/status',
   '/api/v2/providers/fb-personal/account/status']){
  assert.ok(!route.test(url),url);
 }
});
test('FB read-only handler is earlier than broad API handler and does not change UI assets',()=>{
 const x=source.indexOf('proxy:{...fbReadOnlyProxy,');
 const y=source.indexOf("'/api/v2':{target:stageApiTarget,changeOrigin:true}",x);
 assert.ok(x>=0&&y>x);
 assert.match(source,/fbReadOnlyTarget!=='http:\/\/127\.0\.0\.1:47183'/);
 assert.match(source,/const stageApiTarget=process.env.W09_STAGE_API_TARGET/);
});
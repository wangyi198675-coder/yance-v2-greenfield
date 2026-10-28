import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveRuntimeConfig as config} from './runtime-config.mjs';

test('original development defaults',()=>{
  const c=config({});
  assert.equal(c.port,47182);
  assert.equal(c.webOrigin,'http://127.0.0.1:4399');
  assert.equal(c.trustedSession,false);
  assert.equal(c.canSend,false);
});
test('installed loopback instance uses OS allocated port',()=>{
  const c=config({YANCE_W47_RUNTIME_MODE:'installed',
    YANCE_W47_API_PORT:'0',YANCE_W47_WEB_ORIGIN:'http://127.0.0.1:49121'});
  assert.equal(c.port,0);
  assert.equal(c.webOriginHost,'127.0.0.1:49121');
});
test('installed configuration must be explicit',()=>{
  assert.throws(()=>config({YANCE_W47_RUNTIME_MODE:'installed'}));
  assert.throws(()=>config({YANCE_W47_RUNTIME_MODE:'installed',YANCE_W47_API_PORT:'0'}));
});
test('reject unsafe origins and invalid ports',()=>{
  const env={YANCE_W47_RUNTIME_MODE:'installed',YANCE_W47_API_PORT:'0'};
  for(const origin of ['http://localhost:49221','http://0.0.0.0:49221',
    'https://127.0.0.1:49221','http://127.0.0.1:49221/path']){
    assert.throws(()=>config({...env,YANCE_W47_WEB_ORIGIN:origin}));
  }
  for(const port of ['-1','65536','abc','00080']){
    assert.throws(()=>config({...env,YANCE_W47_API_PORT:port,
      YANCE_W47_WEB_ORIGIN:'http://127.0.0.1:49221'}));
  }
  assert.throws(()=>config({YANCE_W47_RUNTIME_MODE:'development',
    YANCE_W47_API_PORT:'0',YANCE_W47_WEB_ORIGIN:'http://127.0.0.1:4399'}));
});

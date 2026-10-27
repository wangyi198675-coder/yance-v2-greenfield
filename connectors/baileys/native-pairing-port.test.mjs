import test from 'node:test';
import assert from 'node:assert/strict';
import {createBaileysPairingViewPort} from './native-pairing-port.mjs';
test('NO QR display unless verified existing first-party viewer',async()=>{
 let shown=0;
 const view=createBaileysPairingViewPort({assertAuthorizedLocalViewer:async()=>false,
 showImage:async()=>{shown++},clearImage:async()=>{}});
 await assert.rejects(view.onQr({rawQr:'only-fixture',generation:1,expiresAt:Date.now()+60000}),/LOCAL_VIEWER_NOT_AUTHORIZED/);
 assert.equal(shown,0);
 await view.dispose();
});
test('native QR is rendered in-memory to W46 viewer only, then disposable',async()=>{
 let displayed=null,clears=0;
 const view=createBaileysPairingViewPort({assertAuthorizedLocalViewer:async()=>true,
 showImage:async x=>{displayed=x},clearImage:async()=>{clears++}});
 const result=await view.onQr({rawQr:'OFFLINE-QRCODE-TEST-NOT-A-REAL-LOGIN',generation:1,expiresAt:Date.now()+60000});
 assert.equal(result.shown,true);
 assert.match(displayed.imageDataUrl,/^data:image\/png;base64,/);
 await view.dispose();
 assert.equal(clears,1);
 await assert.rejects(view.onQr({rawQr:'late',generation:2,expiresAt:Date.now()+60000}),/QR_VIEW_DISPOSED/);
});
test('expired QR denied before display; missing session function denied at setup',async()=>{
 assert.throws(()=>createBaileysPairingViewPort({}),/SIGNED_LOCAL_VIEW_PORT_REQUIRED/);
 const view=createBaileysPairingViewPort({assertAuthorizedLocalViewer:async()=>true,
 showImage:async()=>{throw Error('SHOULD_NOT_SHOW')},clearImage:async()=>{}});
 await assert.rejects(view.onQr({rawQr:'expired',generation:1,expiresAt:Date.now()-1}),/QR_EXPIRED_OR_INVALID/);
});

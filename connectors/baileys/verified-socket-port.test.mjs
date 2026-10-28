import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createW28VerifiedSocketEvidence} from './verified-socket-port.mjs';
const me='12345678900@s.whatsapp.net';
const them='441234567891@s.whatsapp.net';
test('real SDK source evidence does not attest self or peer until original socket opens',async()=>{
 const ev=new EventEmitter(),socket={ev,user:{id:me}};
 const evidence=createW28VerifiedSocketEvidence({makeSocket:()=>socket});
 const ready=evidence.sdk.makeWASocket({auth:'ORIGINAL_SDK'});
 assert.equal(ready,socket);
 assert.equal(await evidence.verifySdkSelf({selfJid:me}),false);
 ev.emit('contacts.upsert',[{id:them}]);
 assert.equal(await evidence.verifySdkPeer({selfJid:me,remoteJid:them}),false);
 ev.emit('connection.update',{connection:'open'});
 assert.equal(await evidence.verifySdkSelf({selfJid:me}),true);
 assert.equal(await evidence.verifySdkPeer({selfJid:me,remoteJid:them}),true);
 assert.equal(await evidence.verifySdkPeer({selfJid:me,remoteJid:'9999999999@s.whatsapp.net'}),false);
 ev.emit('messages.upsert',{messages:[{key:{id:'original-mid-1',remoteJid:them,fromMe:false},
  message:{conversation:'received message'}}]});
 assert.equal(await evidence.verifySdkMessage({providerMid:'original-mid-1',
  providerRemoteJid:them,original:'received message',fromMe:false,isHistory:false}),true);
 assert.equal(await evidence.verifySdkMessage({providerMid:'original-mid-1',
  providerRemoteJid:them,original:'changed content',fromMe:false,isHistory:false}),false);
 ev.emit('connection.update',{connection:'close'});
 assert.equal(await evidence.verifySdkSelf({selfJid:me}),false);
 assert.equal(await evidence.verifySdkMessage({providerMid:'original-mid-1',
  providerRemoteJid:them,original:'received message',fromMe:false,isHistory:false}),false);
});
test('W28 source attests historical own messages without fabricating delivery ACK',async()=>{
 const ev=new EventEmitter(),socket={ev,user:{id:me}};
 const evidence=createW28VerifiedSocketEvidence({makeSocket:()=>socket});
 evidence.sdk.makeWASocket({auth:'ORIGINAL_SDK'});
 ev.emit('messaging-history.set',{chats:[{id:them}],
  messages:[{key:{id:'mid-old',remoteJid:them,fromMe:true},
   message:{conversation:'sent before pairing'}}]});
 ev.emit('connection.update',{connection:'open'});
 assert.equal(await evidence.verifySdkMessage({providerMid:'mid-old',
  providerRemoteJid:them,original:'sent before pairing',fromMe:true,isHistory:true}),true);
 assert.equal(await evidence.verifySdkMessage({providerMid:'mid-old',
  providerRemoteJid:them,original:'sent before pairing',fromMe:false,isHistory:true}),false);
});

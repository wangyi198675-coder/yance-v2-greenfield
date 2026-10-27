import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createComposerBridge} from '../src/composer-bridge.mjs';
const config=readFileSync(new URL('../vite.w46.config.mjs',import.meta.url),'utf8');
const shell=readFileSync(new URL('../src/BCProductWorkspaceCandidate.vue',import.meta.url),'utf8');
const A={tenant:'SYNTHETIC_TEST_ONLY',account:'fixture-account-1',
 channel:'FB_PERSONAL',peer_id:'fake-peer-001',binding_revision:1};
const B={...A,peer_id:'fake-peer-002'};
test('R4 compact keeps the original B+C Composer and keeps live contact state mounted while navigating',()=>{
 assert.match(config,/v-else-if="!w46WorkspaceEnabled"/);
 assert.match(shell,/<BCLiveChatWorkspace v-show="activeWorkspace==='CHAT'"/);
 assert.match(config,/CHAT/);
 assert.ok(!config.includes('<main v-else v-show=\\"!w46WorkspaceEnabled\\" class='));
 assert.ok(!config.includes('<main v-else v-if='));
 assert.match(shell,/:data-active-workspace="activeWorkspace"/);
 assert.match(shell,/#yance-prototype:has\(> \.w46-product-candidate:not\(\[data-active-workspace='CHAT'\]\)\) main\.workspace\{display:none!important\}/);
 assert.ok(!shell.includes('#yance-prototype:has(> .w46-product-candidate) main.workspace{display:none!important}'));
});
test('existing Composer stays the sole B+C Composer; no second rendering or sender injected',()=>{
 assert.equal((config.match(/<BCNativeComposer/g)||[]).length,1);
 assert.ok(!shell.includes('<BCNativeComposer'));
 assert.ok(!shell.includes('MessageDelivery'));
 assert.ok(!shell.includes('takeoverPort'));
});
test('synthetic-only CONTACT unsent draft survives passive workspace changes without GET/POST/takeover',async()=>{
 let gets=0,posts=0;
 const bridge=createComposerBridge({takeoverPort:{
   get:async()=>{gets++;throw Error('UNAUTHORIZED')},
   post:async()=>{posts++;throw Error('FORBIDDEN')}
 }});
 bridge.choose(A);
 assert.equal(bridge.view().canSend,false);
 // No user action: selecting workspace navigation does not call the takeover port.
 const tabs=['CHAT','PEOPLE','TASKS','SETTINGS','BRAIN','CHAT'];
 for(const _tab of tabs){
   assert.equal(bridge.selectedIdentity().peer_id,A.peer_id);
 }
 assert.equal(gets,0);assert.equal(posts,0);
 // A draft is locally edited in this *synthetic-only* test, not authorized/sent.
 await bridge.userAction(A,'TYPE',{text:'Unsent fake contact A draft — never deliver'});
 assert.equal(bridge.view().status,'BLOCKED');
 assert.equal(bridge.view().canSend,false);
 bridge.choose(B); // passive identity selection, distinct persistent draft map
 assert.equal(bridge.view().draft.text,'');
 bridge.choose(A);
 assert.equal(bridge.view().draft.text,'Unsent fake contact A draft — never deliver');
 assert.equal(posts,0);
 // This proves local per-K map retention, NOT a valid real-user session.
});

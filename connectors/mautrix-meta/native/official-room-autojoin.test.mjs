import test from 'node:test';
import assert from 'node:assert/strict';
import {joinOfficialFacebookInvites} from './official-room-autojoin.mjs';
const principal='@w56_internal_fb_bridge:yance-w26.invalid',bot='@facebookbot:yance-w26.invalid';
const account={bridgeBot:bot,connectedCount:1,realAccountState:'UPSTREAM_CONNECTED_W24_BINDING_PENDING'};
const good='!officialabcdef0123456789',bad='!unknownbridgeabcdef1234';
const invite=(roomId,sender)=>({type:'m.room.member',sender,state_key:principal,content:{membership:'invite'}});
test('join only verified official Facebook appservice rooms, no provider send or untrusted membership',async()=>{
 const calls=[];
 const fetchImpl=async(url,opts={})=>{
  calls.push({url,method:opts.method||'GET'});
  if(url.includes('/profile/'))return Response.json({displayname:'Facebook Messenger bridge bot'});
  if(url.includes('/sync?'))return Response.json({rooms:{invite:{
   [good]:{invite_state:{events:[{type:'m.room.create',content:{}},invite(good,bot)]}},
   [bad]:{invite_state:{events:[{type:'m.room.create',content:{}},invite(bad,'@untrusted:example.org')]}}
  }}});
  if(url.includes('/join/'))return Response.json({room_id:good});
  return Response.json({},{status:404});
 };
 const result=await joinOfficialFacebookInvites({
  getSession:async()=>({principal,token:'fixture-only-token'}),
  readAccount:async()=>account,fetchImpl});
 assert.deepEqual(result,{officialCandidates:1,joined:1,skipped:1,failed:0,canSend:false});
 assert.equal(calls.filter(c=>c.method==='POST').length,1);
 assert.ok(calls.every(x=>!x.url.includes('facebook.com')&&!x.url.includes('send')));
});
test('identity mismatch and missing upstream connection fail closed, never accept an invitation',async()=>{
 let fetchCount=0;
 const fetchImpl=async()=>{fetchCount++;throw Error('UNREACHABLE')};
 await assert.rejects(joinOfficialFacebookInvites({
  getSession:async()=>({principal:'@another:yance-w26.invalid',token:'fixture'}),
  readAccount:async()=>account,fetchImpl}),/WRONG|PRINCIPAL_NOT_VERIFIED/);
 await assert.rejects(joinOfficialFacebookInvites({
  getSession:async()=>({principal,token:'fixture'}),
  readAccount:async()=>({...account,connectedCount:0}),fetchImpl}),/UPSTREAM_LOGIN_NOT_CURRENT/);
 assert.equal(fetchCount,0);
});

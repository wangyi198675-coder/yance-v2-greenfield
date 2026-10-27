import test from 'node:test';
import assert from 'node:assert/strict';
import {createW29TelegramChatDataPort} from '../src/native-telegram-chat-data.mjs';

const CHAT=123456789,ACCOUNT='native-owner-account';
const K={channel:'TELEGRAM_PERSONAL',account:ACCOUNT,peer:'chat-123456789'};
const state={nativeRunning:true,telegramAuthorized:true,
  accountIdentityVerified:true,platformUserIdExact:'555444333',channelAccountId:ACCOUNT};
function rig({auth=true,allowed=true,peer=true,contact=true,history=true,avatar=true,avatarDownloaded=true}={}){
  const calls=[],callbacks=[];
  const data={
    getChats:{'@type':'chats',chat_ids:[CHAT,98765]},
    getChat:{'@type':'chat',id:CHAT,title:'Actual SDK test placeholder',
      unread_count:3,last_message:{id:42},
      photo:{small:{'@type':'file',id:77,local:{is_downloading_completed:false}}}},
    getContacts:{'@type':'users',user_ids:[8888]},
    getUser:{'@type':'user',id:8888,first_name:'Synthetic',
      last_name:'Test',usernames:{active_usernames:['sample']},
      phone_number:'+000private',profile_photo:{small:{id:77}}},
    getChatHistory:{'@type':'messages',messages:[
      {'@type':'message',id:51,chat_id:CHAT,date:12345,content:{'@type':'messageText'}},
      {'@type':'message',id:52,chat_id:999999,date:12346,content:{'@type':'messageText'}}]},
    downloadFile:{'@type':'file',id:77,local:{is_downloading_completed:avatarDownloaded,
      path:'C:\\secret\\tdlib\\avatar.jpg'}},
  };
  const controller={
    readPrivateAccountState:async()=>auth?state:{
      ...state,nativeRunning:false,telegramAuthorized:false,accountIdentityVerified:false},
    requestRead:async({query})=>{
      calls.push(query);
      return data[query['@type']];
    },
  };
  const bind={current:peer,k:K,binding_revision:1,
    allows:{CHAT:true,HISTORY:true,AVATAR:true,CONTACTS:true}};
  const cBind={...bind,current:contact};
  const port=createW29TelegramChatDataPort({
    controller,
    verifyW24Account:async({permission})=>({
      current:allowed,channelAccountId:ACCOUNT,
      platformUserIdExact:state.platformUserIdExact,
      allows:{[permission]:true},
    }),
    verifyW24Peer:async({chatId})=>chatId===CHAT?bind:{
      current:false},
    verifyW24Contact:async()=>cBind,
    onW25HistoryBatch:async p=>{callbacks.push({type:'W25',p});
      return {accepted:history,receiptRef:'w25-native-ingest-1'}},
    onW47AvatarFile:async p=>{callbacks.push({type:'W47',p});
      return {accepted:avatar,assetRef:'w47-existing-asset-ref'}},
  });
  return {port,calls,callbacks};
}

test('refuses a second native data store without all original owner callbacks',()=>{
  assert.throws(()=>createW29TelegramChatDataPort({}),{
    code:'ORIGINAL_OWNER_READ_PORT_REQUIRED'});
});
test('unconnected native SDK never asks Telegram for contacts or messages',async()=>{
  const f=rig({auth:false});
  await assert.rejects(f.port.listChats({sessionHandle:'owner'}),{
    code:'WAITING_USER_AUTH'});
  await assert.rejects(f.port.readHistory({sessionHandle:'owner',chatId:CHAT}),{
    code:'WAITING_USER_AUTH'});
  assert.equal(f.calls.length,0);
});
test('expired W24 account/Consent refuses all native reads',async()=>{
  const f=rig({allowed:false});
  await assert.rejects(f.port.listChats({sessionHandle:'owner'}),{
    code:'W24_CURRENT_ACCOUNT_CONSENT_REQUIRED'});
  assert.equal(f.calls.length,0);
});
test('real SDK-shaped getChats + getChat only yield W24-verified Peer IDs',async()=>{
  const f=rig();
  const v=await f.port.listChats({sessionHandle:'owner'});
  assert.equal(v.chats.length,1);
  assert.equal(v.chats[0].platformChatIdExact,String(CHAT));
  assert.equal(v.chats[0].unreadCount,3);
  assert.equal(v.chats[0].avatarAvailable,true);
  assert.equal(v.chats[0].pinned,null);
  assert.equal(v.chats[0].canSend,false);
  assert.deepEqual(f.calls.map(c=>c['@type']),['getChats','getChat']);
});
test('TDLib contacts omit unproven contacts and private phone_number',async()=>{
  const f=rig();
  const c=await f.port.listContacts({sessionHandle:'owner'});
  assert.equal(c.contacts.length,1);
  assert.equal(c.contacts[0].platformUserIdExact,'8888');
  assert.equal(c.contacts[0].displayName,'Synthetic Test');
  assert.equal(c.contacts[0].avatarAvailable,true);
  assert.equal('phone_number' in c.contacts[0],false);
  const notAllowed=rig({contact:false});
  const none=await notAllowed.port.listContacts({sessionHandle:'owner'});
  assert.equal(none.contacts.length,0);
  assert.equal(notAllowed.calls.length,1);
});
test('verified TDLib history goes only to W25 original history port',async()=>{
  const f=rig();
  const res=await f.port.readHistory({sessionHandle:'owner',chatId:CHAT,
    fromMessageId:0,limit:20});
  assert.equal(res.deliveredToW25,true);
  assert.equal(res.nativeMessageCount,1);
  assert.equal(res.w25Receipt,'w25-native-ingest-1');
  assert.equal(f.callbacks.length,1);
  assert.equal(f.callbacks[0].type,'W25');
  assert.equal(f.callbacks[0].p.nativeMessages[0].chat_id,CHAT);
  assert.equal('messages' in res,false);
  assert.equal(f.calls[0].only_local,false);
});
test('W25 history rejection never claims a persisted timeline',async()=>{
  const f=rig({history:false});
  await assert.rejects(f.port.readHistory({sessionHandle:'owner',chatId:CHAT}),{
    code:'W25_NATIVE_HISTORY_PORT_HOLD'});
});
test('W24 unknown Peer cannot read history, download avatar or forge new K',async()=>{
  const f=rig({peer:false});
  await assert.rejects(f.port.readHistory({sessionHandle:'owner',chatId:CHAT}),{
    code:'W24_CURRENT_PEER_K_REQUIRED'});
  await assert.rejects(f.port.readChatAvatar({sessionHandle:'owner',chatId:CHAT}),{
    code:'W24_CURRENT_PEER_K_REQUIRED'});
  assert.equal(f.calls.length,0);
});
test('actual avatar file metadata goes to original W47 owner, not raw path in UI',async()=>{
  const f=rig();
  const a=await f.port.readChatAvatar({sessionHandle:'owner',
    chatId:CHAT,requestDownload:true});
  assert.equal(a.avatarAvailable,true);
  assert.equal(a.nativeFileId,77);
  assert.equal(a.downloaded,true);
  assert.equal(a.avatarRef,'w47-existing-asset-ref');
  assert.equal('local' in a,false);
  assert.equal(JSON.stringify(a).includes('secret'),false);
  assert.equal(f.callbacks[0].type,'W47');
  assert.equal(f.calls[1]['@type'],'downloadFile');
});
test('W47 avatar bridge rejection stays HOLD and never returns fake avatar URL',async()=>{
  const f=rig({avatar:false});
  await assert.rejects(f.port.readChatAvatar({sessionHandle:'owner',
    chatId:CHAT,requestDownload:true}),{code:'W47_EXISTING_AVATAR_PORT_HOLD'});
});
test('pagination and platform int53 bounds fail closed before SDK use',async()=>{
  const f=rig();
  await assert.rejects(f.port.listChats({sessionHandle:'owner',limit:999}),{
    code:'TDLIB_LIST_LIMIT_INVALID'});
  await assert.rejects(f.port.readHistory({sessionHandle:'owner',chatId:CHAT,
    fromMessageId:Number.MAX_SAFE_INTEGER+1}),{code:'TDLIB_HISTORY_PAGE_INVALID'});
  await assert.rejects(f.port.readHistory({sessionHandle:'owner',chatId:0}),{
    code:'OFFICIAL_TDLIB_CHAT_ID_REQUIRED'});
  assert.equal(f.calls.length,0);
});

test('official file download must finish before claiming a real avatar asset',async()=>{
  const f=rig({avatarDownloaded:false});
  await assert.rejects(f.port.readChatAvatar({sessionHandle:'owner',chatId:CHAT,requestDownload:true}),
    {code:'OFFICIAL_TDLIB_AVATAR_DOWNLOAD_INCOMPLETE'});
  assert.equal(f.callbacks.length,0);
});

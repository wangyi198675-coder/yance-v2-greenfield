import test from 'node:test';
import assert from 'node:assert/strict';
import {createW29TelegramMessageActionCapabilitiesPort} from
  '../src/native-message-actions-capabilities.mjs';

// These test pure OWNER glue/contract responses, NOT real Telegram login,
// provider mutation, SDK ACK or a product UI send.
const CID=123456, MID=654321, A='owner-telegram-account';
const K={channel:'TELEGRAM_PERSONAL',account:A,peer:'real-peer-stub'};
const STATE={nativeRunning:true,telegramAuthorized:true,
  accountIdentityVerified:true,channelAccountId:A,platformUserIdExact:'88112'};
function rig({connected=true,accountPermission=true,peerPermission=true,
  changedRevision=false,content='messageText',outgoing=true,
  props={},badMessage=false}={}){
  const calls=[];
  let peerCalls=0,accountCalls=0;
  const state=connected?STATE:{...STATE,telegramAuthorized:false,
    accountIdentityVerified:false};
  const controller={
    readPrivateAccountState:async()=>state,
    requestRead:async({query})=>{
      calls.push(query);
      switch(query['@type']){
        case 'getMessage':return {'@type':'message',
          id:badMessage?9999:MID,chat_id:CID,is_outgoing:outgoing,
          content:{'@type':content}};
        case 'getMessageProperties':return {'@type':'messageProperties',
          can_be_replied:true,can_be_forwarded:true,can_be_saved:true,
          can_be_edited:true,can_edit_media:false,
          can_be_deleted_only_for_self:true,can_be_deleted_for_all_users:false,
          ...props};
        case 'getMessageAvailableReactions':return {'@type':'availableReactions',
          top_reactions:[{'@type':'availableReaction'}],
          recent_reactions:[],popular_reactions:[]};
        default:throw Error('ONLY_OFFICIAL_READS_EXPECTED');
      }
    },
  };
  const port=createW29TelegramMessageActionCapabilitiesPort({
    controller,
    verifyW24Account:async()=>{accountCalls++;return {
      current:accountPermission,channelAccountId:A,
      platformUserIdExact:'88112',allows:{MESSAGE_ACTION_READ:accountPermission}};},
    verifyW24Peer:async()=>{peerCalls++;return {
      current:peerPermission,binding_revision:changedRevision && peerCalls>1?2:1,
      k:K,allows:{MESSAGE_ACTION_READ:peerPermission}};},
  });
  return {port,calls,getPeerCalls:()=>peerCalls,getAccountCalls:()=>accountCalls};
}
test('no current native W29 or W24 functions means no independent action sender',()=>{
  assert.throws(()=>createW29TelegramMessageActionCapabilitiesPort({}),
    {code:'ORIGINAL_OWNER_CAPABILITY_PORTS_REQUIRED'});
});
test('unauthorized Telegram session does not read any provider message',async()=>{
  const x=rig({connected:false});
  await assert.rejects(x.port.inspect({sessionHandle:'owned',chatId:CID,
    messageId:MID}),{code:'WAITING_USER_AUTH'});
  assert.equal(x.calls.length,0);
});
test('current W24 account consent is mandatory',async()=>{
  const x=rig({accountPermission:false});
  await assert.rejects(x.port.inspect({sessionHandle:'owned',chatId:CID,
    messageId:MID}),{code:'W24_ACCOUNT_AND_CONSENT_REQUIRED'});
  assert.equal(x.calls.length,0);
});
test('unknown, revoked, or rebound peer cannot trigger SDK',async()=>{
  const x=rig({peerPermission:false});
  await assert.rejects(x.port.inspect({sessionHandle:'owned',chatId:CID,
    messageId:MID}),{code:'W24_CURRENT_MESSAGE_PEER_K_REQUIRED'});
  assert.equal(x.calls.length,0);
});
test('message id must exactly match official TDLib message id',async()=>{
  const x=rig({badMessage:true});
  await assert.rejects(x.port.inspect({sessionHandle:'owned',chatId:CID,
    messageId:MID}),{code:'TDLIB_MESSAGE_IDENTITY_MISMATCH'});
});
test('a property result only yields W25-required eligibility, no native write',async()=>{
  const x=rig();
  const v=await x.port.inspect({sessionHandle:'owned',chatId:CID,messageId:MID});
  assert.deepEqual(x.calls.map(q=>q['@type']),
    ['getMessage','getMessageProperties']);
  assert.equal(v.platformMessageIdExact,String(MID));
  assert.equal(v.capabilities.reply.tdlibMethod,
    'sendMessage.reply_to(inputMessageReplyToMessage)');
  assert.equal(v.capabilities.reply.state,'W25_PROVIDER_OPERATION_PORT_HOLD');
  assert.equal(v.capabilities.forward.providerProperty,true);
  assert.equal(v.capabilities.deleteOnlyForSelf.providerProperty,true);
  assert.equal(v.capabilities.deleteForAll.state,'PROVIDER_RESTRICTED');
  assert.equal(v.capabilities.localFavorite.state,'CONVERSATION_DB_OWNER_HOLD');
  assert.equal(v.capabilities.editText.providerProperty,true);
  assert.equal(v.capabilities.editCaption.state,'PROVIDER_RESTRICTED');
  assert.equal(v.capabilities.react.add.state,'UI_DISABLED_HOLD');
  assert.equal(v.canSend,false);
  assert.equal(v.providerAck,false);
  assert.equal(x.getPeerCalls(),2);
});
test('TDLib photo is not a text message, but may allow media/caption editing',async()=>{
  const x=rig({content:'messagePhoto',props:{can_edit_media:true}});
  const v=await x.port.inspect({sessionHandle:'owned',chatId:CID,messageId:MID});
  assert.equal(v.nativeContentType,'messagePhoto');
  assert.equal(v.capabilities.editText.providerProperty,false);
  assert.equal(v.capabilities.editCaption.providerProperty,true);
  assert.equal(v.capabilities.editMedia.providerProperty,true);
});
test('available emoji reactions are read only and not sent to provider',async()=>{
  const x=rig();
  const v=await x.port.inspect({sessionHandle:'owned',chatId:CID,messageId:MID,
    includeAvailableReactions:true});
  assert.equal(v.reactionOptions.officialAvailabilityRead,true);
  assert.equal(v.reactionOptions.optionCount,1);
  assert.equal(v.capabilities.react.add.canExecuteFromW29,false);
  assert.deepEqual(x.calls.map(q=>q['@type']),
    ['getMessage','getMessageProperties','getMessageAvailableReactions']);
  assert.equal(x.calls[2].row_size,8);
});
test('W24 binding revision changes while async SDK reads are rejected',async()=>{
  const x=rig({changedRevision:true});
  await assert.rejects(x.port.inspect({sessionHandle:'owned',chatId:CID,
    messageId:MID}),{code:'TDLIB_ACTION_READ_REVOKED_OR_REBOUND'});
});
test('unsafe IDs and cross-account parameters fail before a native request',async()=>{
  const x=rig();
  for(const [chatId,messageId]of [[0,MID],[CID,0],[CID,2**54],[1.1,MID]]){
    await assert.rejects(x.port.inspect({sessionHandle:'owned',chatId,messageId}),
      {code:'EXACT_TDLIB_CHAT_MESSAGE_IDS_REQUIRED'});
  }
  assert.equal(x.calls.length,0);
});

/**
 * W29 Issue #146: read-only official TDLib per-message action capabilities.
 * It does not submit a reaction, forward, edit, delete, or a sendMessage.
 * All mutations require W25's ORIGINAL unique MessageDelivery/operation ledger.
 *
 * Only actual TDLib getMessage/getMessageProperties/getChat/
 * getMessageAvailableReactions are authoritative for Telegram eligibility.
 * W24 alone verifies current real account, Peer, K, revision and consent.
 */
const reject=(code)=>{throw Object.assign(new Error(code),{code});};
const requireTrue=(ok,code)=>{if(!ok)reject(code);};
const id=v=>Number.isSafeInteger(v)&&v>0;
const chatId=v=>Number.isSafeInteger(v)&&v!==0;
const asBool=v=>typeof v==='boolean'?v:null;
function action(method,possible,reason='W25_PROVIDER_OPERATION_PORT_HOLD'){
  // Eligibility is NOT a provider ACK, final permission, or "NATIVE_VERIFIED".
  return Object.freeze({tdlibMethod:method,
    providerProperty:asBool(possible),
    state:possible===false?'PROVIDER_RESTRICTED':
      possible===true?reason:'UI_DISABLED_HOLD',
    providerAck:false,canExecuteFromW29:false});
}
export function createW29TelegramMessageActionCapabilitiesPort({
  controller, verifyW24Account, verifyW24Peer,
}={}){
  requireTrue(typeof controller?.requestRead==='function' &&
    typeof controller?.readPrivateAccountState==='function' &&
    typeof verifyW24Account==='function' && typeof verifyW24Peer==='function',
    'ORIGINAL_OWNER_CAPABILITY_PORTS_REQUIRED');

  async function inspect({sessionHandle,chatId:cid,messageId:mid,
    includeAvailableReactions=false}={}){
    requireTrue(chatId(cid)&&id(mid),'EXACT_TDLIB_CHAT_MESSAGE_IDS_REQUIRED');
    const state=await controller.readPrivateAccountState({sessionHandle});
    requireTrue(state?.nativeRunning===true&&
      state?.telegramAuthorized===true&&
      state?.accountIdentityVerified===true&&
      typeof state.channelAccountId==='string'&&
      typeof state.platformUserIdExact==='string',
      'WAITING_USER_AUTH');
    const accountId=state.channelAccountId,self=state.platformUserIdExact;
    const source={sessionHandle,channel:'TELEGRAM_PERSONAL',
      channelAccountId:accountId,platformUserIdExact:self};
    const owner=await verifyW24Account({...source,permission:'MESSAGE_ACTION_READ'});
    requireTrue(owner?.current===true &&
      owner?.channelAccountId===accountId &&
      owner?.platformUserIdExact===self &&
      owner?.allows?.MESSAGE_ACTION_READ===true,
      'W24_ACCOUNT_AND_CONSENT_REQUIRED');
    const binding=await verifyW24Peer({...source,
      chatId:cid,messageId:mid,operation:'MESSAGE_ACTION_READ'});
    const k=binding?.k;
    requireTrue(binding?.current===true &&
      Number.isSafeInteger(binding?.binding_revision)&&
      binding.binding_revision>=0 &&
      binding?.allows?.MESSAGE_ACTION_READ===true &&
      k?.channel==='TELEGRAM_PERSONAL'&&k?.account===accountId,
      'W24_CURRENT_MESSAGE_PEER_K_REQUIRED');
    const read=query=>controller.requestRead({sessionHandle,query});
    // Real historic message properties; never infer rights from a chat type
    // or a stale UI object. These are two official read-only SDK methods.
    const message=await read({'@type':'getMessage',chat_id:cid,message_id:mid});
    const props=await read({'@type':'getMessageProperties',
      chat_id:cid,message_id:mid});
    requireTrue(message?.['@type']==='message'&&
      message.chat_id===cid&&message.id===mid,
      'TDLIB_MESSAGE_IDENTITY_MISMATCH');
    requireTrue(props?.['@type']==='messageProperties',
      'TDLIB_MESSAGE_PROPERTIES_NOT_AVAILABLE');
    let reactions=null;
    if(includeAvailableReactions){
      const v=await read({'@type':'getMessageAvailableReactions',
        chat_id:cid,message_id:mid,row_size:8});
      requireTrue(v?.['@type']==='availableReactions',
        'TDLIB_REACTION_OPTIONS_NOT_AVAILABLE');
      // Do not fabricate reaction choices or try paid reactions.
      reactions=Object.freeze({officialAvailabilityRead:true,
        optionCount:(
          (Array.isArray(v.top_reactions)?v.top_reactions.length:0)+
          (Array.isArray(v.recent_reactions)?v.recent_reactions.length:0)+
          (Array.isArray(v.popular_reactions)?v.popular_reactions.length:0)
        ),providerAck:false});
    }
    // Mandatory re-read after all asynchronous SDK operations to catch
    // account revocation/Peer rebinding, without storing another K.
    const now=await controller.readPrivateAccountState({sessionHandle});
    const ownerNow=await verifyW24Account({...source,
      permission:'MESSAGE_ACTION_READ'});
    const peerNow=await verifyW24Peer({...source,chatId:cid,messageId:mid,
      operation:'MESSAGE_ACTION_READ'});
    requireTrue(now?.nativeRunning===true&&now?.telegramAuthorized===true&&
      now?.accountIdentityVerified===true&&
      now.channelAccountId===accountId&&now.platformUserIdExact===self&&
      ownerNow?.current===true&&ownerNow?.allows?.MESSAGE_ACTION_READ===true&&
      peerNow?.current===true&&
      peerNow?.binding_revision===binding.binding_revision&&
      peerNow?.k?.channel===k.channel&&peerNow?.k?.account===k.account&&
      peerNow?.k?.peer===k.peer,
      'TDLIB_ACTION_READ_REVOKED_OR_REBOUND');
    const kind=message.content?.['@type']??'UNKNOWN';
    const own=message.is_outgoing===true;
    const isText=kind==='messageText'||kind==='messageGame';
    const hasCaption=['messagePhoto','messageVideo','messageAnimation',
      'messageAudio','messageDocument'].includes(kind);
    const result=Object.freeze({
      provider:'TDLIB_JSON',originalOwner:'W29',platformAccountId:accountId,
      k,platformChatIdExact:String(cid),platformMessageIdExact:String(mid),
      nativeContentType:kind,isOutgoing:own,realProvider:true,
      currentBindingRevision:binding.binding_revision,
      capabilities:Object.freeze({
        react:addOrRemoveReaction(),
        reply:action('sendMessage.reply_to(inputMessageReplyToMessage)',
          props.can_be_replied),
        forward:action('forwardMessages',props.can_be_forwarded),
        telegramSavedMessages:action('forwardMessages(to verified self chat)',
          props.can_be_saved),
        localFavorite:Object.freeze({tdlibMethod:null,
          state:'CONVERSATION_DB_OWNER_HOLD',canExecuteFromW29:false}),
        editText:action('editMessageText',
          isText?props.can_be_edited:false),
        editCaption:action('editMessageCaption',
          hasCaption?props.can_be_edited:false),
        editMedia:action('editMessageMedia',props.can_edit_media),
        deleteOnlyForSelf:action('deleteMessages(revoke:false)',
          props.can_be_deleted_only_for_self),
        deleteForAll:action('deleteMessages(revoke:true)',
          props.can_be_deleted_for_all_users),
      }),
      reactionOptions:reactions,
      canSend:false,providerAck:false,writePath:'W25_ORIGINAL_OWNER_ONLY',
    });
    return result;

    function addOrRemoveReaction(){
      return Object.freeze({
        add:action('addMessageReaction',null,
          'W25_PROVIDER_OPERATION_PORT_HOLD'),
        remove:action('removeMessageReaction',null,
          'W25_PROVIDER_OPERATION_PORT_HOLD'),
        optionsSource:reactions?'OFFICIAL_TDLIB_AVAILABLE_REACTIONS':
          'READ_ONLY_NOT_REQUESTED',
      });
    }
  }
  return Object.freeze({inspect});
}

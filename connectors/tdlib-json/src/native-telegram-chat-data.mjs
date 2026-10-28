/**
 * W29 R4 compact Smart Inbox: OFFICIAL TDLib JSON read-only sources.
 * Only connects existing native TDLib controller, W24 current K,
 * W25 original history persistence and W47 existing avatar asset consumer.
 * No new contacts DB, timeline store, file HTTP server or MessageDelivery.
 */
const fail=(code)=>{throw Object.assign(new Error(code),{code})};
const requireThat=(yes,code)=>{if(!yes)fail(code)};
const integer=(v)=>Number.isSafeInteger(v);
const chatIdOk=v=>integer(v)&&v!==0;
const userIdOk=v=>integer(v)&&v>0;
const limited=(value,min,max)=>integer(value)&&value>=min&&value<=max;
function assertKey(binding,channelAccountId,operation){
  const k=binding?.k;
  requireThat(binding?.current===true&&
    k?.channel==='TELEGRAM_PERSONAL' &&
    k?.account===channelAccountId &&
    integer(binding?.binding_revision) &&
    binding.binding_revision>=0 &&
    (operation==='CHAT'||binding?.allows?.[operation]===true),
    'W24_CURRENT_PEER_K_REQUIRED');
  return k;
}
const noPII=user=>Object.freeze({
  platformUserIdExact:String(user.id),
  displayName:[user.first_name,user.last_name].filter(x=>typeof x==='string').join(' ').trim(),
  username:typeof user.usernames?.active_usernames?.[0]==='string'?
    user.usernames.active_usernames[0]:null,
  avatarAvailable:!!user.profile_photo?.small,
  // Deliberately do not return phone_number, local paths, raw SDK blob.
});
/** W47/W46 may mount these ONLY after their own user session verification. */
export function createW29TelegramChatDataPort({
  controller,verifyW24Account,verifyW24Peer,verifyW24Contact,
  onW25HistoryBatch,onW47AvatarFile,
}={}){
  for(const fn of [controller?.readPrivateAccountState,
    controller?.requestRead,verifyW24Account,verifyW24Peer,verifyW24Contact,
    onW25HistoryBatch,onW47AvatarFile]){
    requireThat(typeof fn==='function','ORIGINAL_OWNER_READ_PORT_REQUIRED');
  }
  const current=async (sessionHandle,permission)=>{
    const state=await controller.readPrivateAccountState({sessionHandle});
    requireThat(state.nativeRunning===true &&
      state.accountIdentityVerified===true &&
      state.telegramAuthorized===true &&
      typeof state.platformUserIdExact==='string' &&
      typeof state.channelAccountId==='string',
      'WAITING_USER_AUTH');
    const owner=await verifyW24Account({sessionHandle,
      channel:'TELEGRAM_PERSONAL',channelAccountId:state.channelAccountId,
      platformUserIdExact:state.platformUserIdExact,permission});
    requireThat(owner?.current===true &&
      owner.channelAccountId===state.channelAccountId &&
      owner.platformUserIdExact===state.platformUserIdExact &&
      owner?.allows?.[permission]===true,
      'W24_CURRENT_ACCOUNT_CONSENT_REQUIRED');
    return state;
  };
  const peer=async(sessionHandle,state,chatId,op)=>{
    requireThat(chatIdOk(chatId),'OFFICIAL_TDLIB_CHAT_ID_REQUIRED');
    const attested=await verifyW24Peer({
      sessionHandle,channelAccountId:state.channelAccountId,
      chatId,operation:op});
    return assertKey(attested,state.channelAccountId,op);
  };
  async function readNative({sessionHandle,query}){
    return controller.requestRead({sessionHandle,query});
  }

  async function listChats({sessionHandle,limit=40}={}){
    requireThat(limited(limit,1,100),'TDLIB_LIST_LIMIT_INVALID');
    const state=await current(sessionHandle,'CHAT');
    const sdk=await readNative({sessionHandle,query:{
      '@type':'getChats',chat_list:{'@type':'chatListMain'},limit}});
    requireThat(sdk?.['@type']==='chats'&&Array.isArray(sdk.chat_ids),
      'OFFICIAL_TDLIB_CHATS_RESPONSE_INVALID');
    const result=[];
    for(const chatId of sdk.chat_ids){
      if(!chatIdOk(chatId))continue;
      // Unknown/non-consented peers do not appear in Smart Inbox.
      let k;try{k=await peer(sessionHandle,state,chatId,'CHAT');}catch{continue}
      const chat=await readNative({sessionHandle,query:{
        '@type':'getChat',chat_id:chatId}});
      if(chat?.['@type']!=='chat'||chat.id!==chatId)continue;
      // Only native TDLib unread counts can be reported; never fabricate 0.
      const unread=integer(chat.unread_count)&&chat.unread_count>=0?
        chat.unread_count:null;
      result.push(Object.freeze({
        k,provider:'TDLIB_JSON',realProvider:true,
        platformChatIdExact:String(chatId),
        displayName:typeof chat.title==='string'?chat.title:'',
        unreadCount:unread,
        lastMessageIdExact:chat.last_message&&integer(chat.last_message.id)?
          String(chat.last_message.id):null,
        avatarAvailable:!!chat.photo?.small,
        // W24 owns list pin/archive filters; no fake pin/unread flags.
        pinned:null,archived:null,canSend:false,
      }));
    }
    return Object.freeze({source:'OFFICIAL_TDLIB_JSON',authorized:true,
      chats:result,hasVerifiedCount:true,canSend:false});
  }

  async function listContacts({sessionHandle}={}){
    const state=await current(sessionHandle,'CONTACTS');
    const sdk=await readNative({sessionHandle,query:{'@type':'getContacts'}});
    requireThat(sdk?.['@type']==='users'&&Array.isArray(sdk.user_ids),
      'OFFICIAL_TDLIB_CONTACTS_RESPONSE_INVALID');
    const verified=[];
    for(const userId of sdk.user_ids.slice(0,100)){
      if(!userIdOk(userId))continue;
      const binding=await verifyW24Contact({
        sessionHandle,channelAccountId:state.channelAccountId,
        platformUserIdExact:String(userId),operation:'CONTACTS'});
      let k;try{k=assertKey(binding,state.channelAccountId,'CONTACTS');}
      catch{continue}
      const user=await readNative({sessionHandle,query:{
        '@type':'getUser',user_id:userId}});
      if(user?.['@type']!=='user'||user.id!==userId)continue;
      verified.push(Object.freeze({k,...noPII(user),canSend:false}));
    }
    return Object.freeze({source:'OFFICIAL_TDLIB_JSON',
      contacts:verified,authorized:true,canSend:false});
  }

  async function readHistory({sessionHandle,chatId,fromMessageId=0,limit=30}={}){
    requireThat(limited(fromMessageId,0,Number.MAX_SAFE_INTEGER) &&
      limited(limit,1,50),'TDLIB_HISTORY_PAGE_INVALID');
    const state=await current(sessionHandle,'HISTORY');
    const k=await peer(sessionHandle,state,chatId,'HISTORY');
    const sdk=await readNative({sessionHandle,query:{
      '@type':'getChatHistory',chat_id:chatId,
      from_message_id:fromMessageId,offset:0,limit,only_local:false}});
    requireThat(sdk?.['@type']==='messages'&&Array.isArray(sdk.messages),
      'OFFICIAL_TDLIB_HISTORY_RESPONSE_INVALID');
    // TDLib scheme uses int53 for IDs: never coerce unsafe integer to another K.
    const messages=sdk.messages.filter(m=>
      m?.['@type']==='message' && m.chat_id===chatId &&
      integer(m.id) && m.id>0 && integer(m.date));
    // W25 decides durable history save, dedupe and next cursor, not W29.
    const receipt=await onW25HistoryBatch({
      source:'OFFICIAL_TDLIB_JSON',sessionHandle,k,
      platformChatIdExact:String(chatId),nativeMessages:messages,
      requestedLimit:limit,requestedFromMessageIdExact:String(fromMessageId)});
    requireThat(receipt?.accepted===true,'W25_NATIVE_HISTORY_PORT_HOLD');
    return Object.freeze({source:'OFFICIAL_TDLIB_JSON',
      k,deliveredToW25:true,
      nativeMessageCount:messages.length,
      w25Receipt:receipt.receiptRef??null,canSend:false});
  }

  async function readChatAvatar({sessionHandle,chatId,requestDownload=false}={}){
    const state=await current(sessionHandle,'AVATAR');
    const k=await peer(sessionHandle,state,chatId,'AVATAR');
    const chat=await readNative({sessionHandle,query:{
      '@type':'getChat',chat_id:chatId}});
    requireThat(chat?.['@type']==='chat'&&chat.id===chatId,
      'OFFICIAL_TDLIB_AVATAR_CHAT_MISMATCH');
    const ref=chat.photo?.small;
    if(!ref||!integer(ref.id)||ref.id<=0)return Object.freeze({
      k,source:'OFFICIAL_TDLIB_JSON',avatarAvailable:false,canSend:false});
    let file=ref;
    if(requestDownload){
      const r=await readNative({sessionHandle,query:{
        '@type':'downloadFile',file_id:ref.id,priority:1,
        offset:0,limit:0,synchronous:true}});
      requireThat(r?.['@type']==='file'&&r.id===ref.id,
        'OFFICIAL_TDLIB_AVATAR_FILE_MISMATCH');
      requireThat(r.local?.is_downloading_completed===true,
        'OFFICIAL_TDLIB_AVATAR_DOWNLOAD_INCOMPLETE');
      file=r;
    }
    // Actual file/TDLib path stays inside original W47 asset Owner callback,
    // never publish file.local.path or an invented avatar URL to the renderer.
    const receipt=await onW47AvatarFile({
      source:'OFFICIAL_TDLIB_JSON',sessionHandle,k,
      platformChatIdExact:String(chatId),nativeFile:file,
      downloadRequested:requestDownload});
    requireThat(receipt?.accepted===true,'W47_EXISTING_AVATAR_PORT_HOLD');
    return Object.freeze({k,source:'OFFICIAL_TDLIB_JSON',
      avatarAvailable:true,downloadRequested:requestDownload,
      nativeFileId:file.id,
      downloaded:file.local?.is_downloading_completed===true,
      avatarRef:receipt.assetRef??null,canSend:false});
  }

  return Object.freeze({listChats,listContacts,readHistory,readChatAvatar});
}

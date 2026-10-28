// Original W28 BAILEYS SDK evidence: only actual socket callbacks, never
// browser-supplied JIDs, grant an official W44 self/peer persistence proof.
import makeWASocket,{jidNormalizedUser,normalizeMessageContent} from 'baileys';
import pino from 'pino';
const valid=s=>typeof s==='string'&&/^[0-9]{4,18}(?::[0-9]{1,4})?@(s\.whatsapp\.net|lid)$/.test(s);
const norm=x=>{try{return jidNormalizedUser(x)}catch{return null}};
export function createW28VerifiedSocketEvidence({makeSocket=makeWASocket}={}){
 if(typeof makeSocket!=='function')throw Error('W28_REAL_SDK_REQUIRED');
 let latest=null,opened=false,self=null;
 const seenPeers=new Set(),seenMessages=new Map();
 const recordMessage=(m,history)=>{
  const mid=m?.key?.id,remote=norm(m?.key?.remoteJid);
  if(!mid||typeof mid!=='string'||mid.length>256||!valid(remote)||!m.message)return;
  const content=normalizeMessageContent(m.message);
  const text=content?.conversation??content?.extendedTextMessage?.text;
  if(typeof text!=='string')return;
  const key=[mid,remote,m.key.fromMe===true,history===true].join('|');
  if(seenMessages.size>=5000){seenMessages.delete(seenMessages.keys().next().value)}
  seenMessages.set(key,text);
 };
 const capture=x=>{
  if(!x||typeof x!=='object')return;
  if(Array.isArray(x))for(const item of x){
   const id=norm(item?.id??item?.key?.remoteJid);
   if(valid(id)&&id!==self)seenPeers.add(id);
  }
 };
 const sdk=Object.freeze({
  logger:pino({level:'silent'}),
  makeWASocket:options=>{
   const socket=makeSocket(options);
   if(!socket?.ev?.on)throw Error('W28_SDK_EVENT_PORT_MISSING');
   latest=socket;opened=false;self=null;seenPeers.clear();seenMessages.clear();
   socket.ev.on('connection.update',state=>{
    if(socket!==latest)return;
    if(state?.connection==='open'){
     const id=norm(socket.user?.id);
     if(!valid(id)){opened=false;self=null;return}
     self=id;opened=true;
    }else if(state?.connection==='close'){
     opened=false;self=null;seenPeers.clear();seenMessages.clear();
    }
   });
   for(const type of ['contacts.upsert','contacts.update','chats.upsert','chats.update'])
    socket.ev.on(type,value=>{if(socket===latest)capture(value)});
   socket.ev.on('messaging-history.set',value=>{
    if(socket!==latest)return;
    capture(value?.contacts);capture(value?.chats);
    if(Array.isArray(value?.messages))for(const m of value.messages)
     recordMessage(m,true);
   });
   socket.ev.on('messages.upsert',value=>{
    if(socket!==latest)return;
    capture(value?.messages?.map(m=>({id:m?.key?.remoteJid})));
    if(Array.isArray(value?.messages))for(const m of value.messages)
      recordMessage(m,false);
   });
   return socket;
  },
 });
 return Object.freeze({
  sdk,
  verifySdkSelf:async({selfJid})=>opened===true&&latest!==null&&
    norm(selfJid)===self&&norm(latest.user?.id)===self,
  verifySdkPeer:async({selfJid,remoteJid})=>opened===true&&
    norm(selfJid)===self&&seenPeers.has(norm(remoteJid))&&
    norm(latest?.user?.id)===self,
  verifySdkMessage:async({providerMid,providerRemoteJid,original,fromMe,isHistory})=>{
    if(!opened||!latest||typeof original!=='string')return false;
    const key=[providerMid,norm(providerRemoteJid),fromMe===true,
      isHistory===true].join('|');
    return seenMessages.get(key)===original;
  },
  state:()=>Object.freeze({opened,peers:seenPeers.size,accountAvailable:!!self}),
 });
}

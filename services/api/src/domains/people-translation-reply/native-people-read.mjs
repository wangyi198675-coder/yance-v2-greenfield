// W45 existing-owner business READ composition. No database, HTTP route, Agent, channel
// SDK or sender. ALL callbacks must be injected by trusted W09 native owner wiring,
// never constructed from browser-submitted proof or an untrusted provider response.
import {createHash} from 'node:crypto';
const CHANNELS=new Set(['FB_PERSONAL','FB_PAGE','WHATSAPP_PERSONAL','TELEGRAM_PERSONAL']);
const PROVIDERS=new Set(['mautrix-meta','pancake','baileys','tdlib-json']);
const sha=x=>createHash('sha256').update(x,'utf8').digest('hex');
const fail=code=>{const e=new Error(code);e.code=code;throw e};
const copy=x=>structuredClone(x);
const value=x=>(typeof x==='string'||typeof x==='number')&&String(x).length>0&&String(x).length<=200;
const canonical=k=>{
 if(!k||!['tenant','account','channel','peer_id','binding_revision'].every(f=>value(k[f]))||
    !CHANNELS.has(k.channel)||!(/^[1-9]\d*$/.test(String(k.binding_revision))))fail('W24_NATIVE_FULL_K_REQUIRED');
 return ['tenant','account','channel','peer_id','binding_revision'].map(f=>String(k[f]));
};
export const nativeKKey=k=>JSON.stringify(canonical(k));
const w25K=k=>[k?.tenantId,k?.accountId,k?.channel,k?.peerId,k?.bindingRevision].map(String);
const equal=(a,b)=>nativeKKey(a)===nativeKKey(b);
const verifiedPrincipal=p=>p&&p.verified===true&&p.source==='W54_NATIVE_CURRENT_USER'&&
 typeof p.principalRef==='string'&&p.principalRef.length>=8&&
 typeof p.installationRef==='string'&&p.installationRef.length>=8&&
 Number.isSafeInteger(p.revocationGeneration);
const verifiedContact=(c,principal,k)=>{
 if(!c||c.status!=='AUTHORIZED'||c.source!=='W24_CURRENT_K'||c.principalRef!==principal.principalRef||
    !equal(c.identity,k)||c.w24CurrentKVerified!==true||c.readInboundConsent!==true||
    !Number.isSafeInteger(c.accountEpoch)||c.accountEpoch<1||
    !Number.isSafeInteger(c.consentEpoch)||c.consentEpoch<1)
  fail('W24_CONTACT_AUTHORITY_NOT_VERIFIED');
 return c;
};
const waiting=()=>({status:'WAITING_USER_AUTH',contacts:[],messages:[],canSend:false,authoritative:false});
const unconfigured=code=>({status:'NOT_WIRED',error_code:code,contacts:[],messages:[],canSend:false,authoritative:false});
const unavailable=()=>({status:'UNAVAILABLE',text:null,provenance:null});
const noSuggestions=code=>({status:code,candidates:[],run_id:null,session_id:null});
function projectionOfTranslation(record,k,mid,original,attestW45Translation){
 if(!record||record.status!=='TRANSLATED'||typeof record.text!=='string'||!record.text.trim()||
    record.target_language!=='zh-CN')return unavailable();
 const p=record.provenance;
 if(!p||!['LOCAL_ENGINE','AGNO_NATIVE_TRANSLATION'].includes(p.kind)||p.synthetic===true||
    p.source_mid!==mid||p.input_sha256!==sha(original)||!value(p.provider)||
    !value(p.request_id)||typeof attestW45Translation!=='function')return unavailable();
 let proof;
 try{proof=attestW45Translation({translation:record,identity:k,mid,originalSha256:sha(original),
    translatedSha256:sha(record.text)});}
 catch{return unavailable();}
 if(!proof||proof.then||proof.verified!==true||proof.source!=='W45_ORIGINAL_TRANSLATION_EXECUTION'||
    !equal(proof.identity,k)||proof.sourceMid!==mid||
    proof.originalSha256!==sha(original)||proof.translatedSha256!==sha(record.text)||
    proof.provider!==p.provider||proof.requestId!==p.request_id)return unavailable();
 return {status:'TRANSLATED',text:record.text,source_language:record.source_language,
   target_language:'zh-CN',provenance:{kind:p.kind,provider:p.provider,
   request_id:p.request_id,source_mid:mid,input_sha256:sha(original),
   text_sha256:sha(record.text),sdk_run_id:p.sdk_run_id??null,
   sdk_session_id:p.sdk_session_id??null,verified_execution:true}};
}
function projectionOfReplies(receipt,k,mid,original,translation,attestW43Run){
 if(!receipt||receipt.status!=='AGNO_RUN_COMPLETED'||receipt.engine!=='OFFICIAL_AGNO_SDK'||
    !Array.isArray(receipt.candidates)||receipt.candidates.length>3||
    !value(receipt.run_id)||!value(receipt.session_id)||!value(receipt.model_id)||
    !value(receipt.provider)||receipt.source_mid!==mid||
    receipt.original_sha256!==sha(original)||!equal(receipt.identity,k)||
    typeof attestW43Run!=='function')return noSuggestions('RUN_UNAVAILABLE');
 const needsTranslation=receipt.candidates.some(c=>c?.sources?.some(s=>s.part==='TRANSLATION'));
 if(needsTranslation&&(translation.status!=='TRANSLATED'||
   receipt.translation_sha256!==translation.provenance.text_sha256))return noSuggestions('SOURCE_UNVERIFIED');
 let proof;
 try{proof=attestW43Run({receipt,identity:k,mid,originalSha256:sha(original),
    translationSha256:translation.provenance?.text_sha256??null});}
 catch{return noSuggestions('RUN_UNAVAILABLE')}
 if(!proof||proof.then||proof.verified!==true||proof.issuer!=='W43_NATIVE_AGNO'||
    proof.nativePersisted!==true||!equal(proof.identity,k)||
    proof.sourceMid!==mid||proof.runId!==receipt.run_id||
    proof.sessionId!==receipt.session_id||proof.modelId!==receipt.model_id||
    proof.provider!==receipt.provider||proof.originalSha256!==sha(original))
  return noSuggestions('RUN_UNAVAILABLE');
 const seen=new Set(),out=[];
 for(const c of receipt.candidates){
   if(!value(c?.id)||typeof c.text!=='string'||!c.text.trim()||c.text.length>650||
      seen.has(c.id)||!Array.isArray(c.sources)||!c.sources.length||
      c.sources.some(s=>s.mid!==mid||!['ORIGINAL','TRANSLATION'].includes(s.part)))
     return noSuggestions('SOURCE_UNVERIFIED');
   seen.add(c.id);out.push({id:c.id,text:c.text,action:'DRAFT_ONLY',
     source_mid:mid,sources:copy(c.sources),
     provenance:{engine:'OFFICIAL_AGNO_SDK',run_id:receipt.run_id,session_id:receipt.session_id,
       model_provider:receipt.provider,model_id:receipt.model_id,
       quality_qualified:false,source_mid:mid}});
 }
 return {status:out.length?'CANDIDATES_PRESENT':'NO_CANDIDATES',candidates:out,
   run_id:receipt.run_id,session_id:receipt.session_id};
}
/** W47 composes the current authenticated native session; W45 only correlates
 * original W24 K + W25 persisted messages + W45 engine receipt + W43 Agno Run.
 * Absent provider consent never falls back to synthetic contacts/messages.
 */
export function createNativePeopleReadModel({
 readW24Contacts=null,resolveW24Contact=null,readW25Inbound=null,
 readW45Translation=null,attestW45Translation=null,
 readW43ReplyCandidates=null,attestW43Run=null,revalidateW24=null
}={}){
 const needs=()=>[resolveW24Contact,readW25Inbound,revalidateW24].every(f=>typeof f==='function');
 return Object.freeze({
  async listContacts({principal}={}){
   if(!verifiedPrincipal(principal))return waiting();
   if(typeof readW24Contacts!=='function'||typeof revalidateW24!=='function')
      return unconfigured('W24_NATIVE_CONTACT_LIST_PORT_MISSING');
   const source=await readW24Contacts({principal,operation:'READ_CONTACTS'});
   if(source?.status==='WAITING_USER_AUTH')return waiting();
   if(!source||source.status!=='AUTHORIZED'||source.principalRef!==principal.principalRef||
      !Array.isArray(source.contacts)||source.contacts.length>10000)
     fail('W24_CONTACT_LIST_UNVERIFIED');
   const unique=new Set(),contacts=[];
   for(const c of source.contacts){
     if(!c?.identity||!value(c.displayName)||c.w24CurrentKVerified!==true||
        c.principalRef!==principal.principalRef)fail('W24_CONTACT_LIST_UNVERIFIED');
     const key=nativeKKey(c.identity);
     if(unique.has(key))fail('DUPLICATE_CONTACT_K');
     unique.add(key);contacts.push({identity:copy(c.identity),displayName:c.displayName,
       status:'AUTHORIZED',canSend:false});
   }
   if(await revalidateW24({principal,operation:'READ_CONTACTS',source})!==true)
     fail('W24_CONTACT_LIST_REVOKED_DURING_READ');
   return {status:'READY',contacts,canSend:false,authoritative:true};
  },
  async getThread({principal,identity}={}){
   if(!verifiedPrincipal(principal))return waiting();
   if(!needs())return unconfigured('W24_W25_NATIVE_READ_PORTS_MISSING');
   const k=Object.fromEntries(['tenant','account','channel','peer_id','binding_revision']
     .map((field,i)=>[field,canonical(identity)[i]]));
   const current=await resolveW24Contact({principal,identity:copy(k),operation:'READ_INBOUND'});
   if(current?.status==='WAITING_USER_AUTH')return waiting();
   verifiedContact(current,principal,k);
   const rows=await readW25Inbound({principal,identity:copy(k),consent:current,max:250});
   if(!Array.isArray(rows)||rows.length>250)fail('W25_NATIVE_INBOUND_SOURCE_UNVERIFIED');
   const mids=new Set(),validated=[];
   for(const m of rows){
     if(!m||!Array.isArray(w25K(m.k))||JSON.stringify(w25K(m.k))!==JSON.stringify(canonical(k))||
        typeof m.id!=='string'||!/^[a-f0-9]{64}$/.test(m.id)||
        typeof m.providerMid!=='string'||!m.providerMid.length||m.providerMid.length>250||
        typeof m.original!=='string'||m.original.length>64000||
        !PROVIDERS.has(m.source)||mids.has(m.providerMid))
       fail('W25_NATIVE_INBOUND_SOURCE_UNVERIFIED');
     mids.add(m.providerMid);
     validated.push({mid:m.providerMid,original:m.original,original_sha256:sha(m.original),
       providerSource:m.source,nativeInboundId:m.id});
   }
   const messages=[];
   for(const m of validated){
     let translation=unavailable();
     if(typeof readW45Translation==='function'){
       let t;
       try{t=await readW45Translation({principal,identity:copy(k),mid:m.mid,
         originalSha256:m.original_sha256,targetLanguage:'zh-CN'});}
       catch{t=null;}
       translation=projectionOfTranslation(t,k,m.mid,m.original,attestW45Translation);
     }
     let suggestions=noSuggestions('RUN_UNAVAILABLE');
     if(typeof readW43ReplyCandidates==='function'){
       let reply;
       try{reply=await readW43ReplyCandidates({principal,identity:copy(k),
         mid:m.mid,originalSha256:m.original_sha256,translation});}
       catch{reply=null;}
       suggestions=projectionOfReplies(reply,k,m.mid,m.original,translation,attestW43Run);
     }
     messages.push({...m,identity:copy(k),translation,suggestions,delivery:'NOT_REQUESTED'});
   }
   if(await revalidateW24({principal,identity:copy(k),operation:'READ_INBOUND',
     previous:current})!==true)fail('W24_READ_REVOKED_DURING_AWAIT');
   return {status:'READY',authoritative:true,identity:copy(k),messages,
     message_count:messages.length,canSend:false,delivery:'NOT_REQUESTED'};
  }
 });
}

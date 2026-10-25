// W46: B+C sole CONTACT Composer, synthetic-only until native owner contracts exist.
const channels=new Set(['FB_PERSONAL','FB_PAGE','WHATSAPP_PERSONAL','TELEGRAM_PERSONAL']);
const userActions=new Set(['TYPE','IME_COMMIT','PASTE','ATTACH','DROP','VOICE','SEND_ATTEMPT']);
function error(code){throw Error(code)}
export function fullK(c){
 if(!c||typeof c!=='object')error('FULL_K_REQUIRED');
 const values=['tenant','account','channel','peer_id','binding_revision'].map(n=>{
   const value=c[n];
   if(!['string','number'].includes(typeof value)||!String(value).trim()||String(value).includes('|'))error('INVALID_K_'+n);
   return String(value);
 });
 if(!channels.has(c.channel))error('INVALID_CHANNEL');
 return values.join('|');
}
export function synthetic(c){
 if(c?.tenant!=='SYNTHETIC_TEST_ONLY'||!String(c.account).startsWith('fixture-')||
   !String(c.peer_id).startsWith('fake-'))error('LIVE_IDENTITY_FORBIDDEN');
 return fullK(c);
}
function assertStatus(s,id){
 if(!s||fullK(s.identity)!==fullK(id))error('IDENTITY_MISMATCH');
 if(!Number.isSafeInteger(s.epoch)||s.epoch<0)error('INVALID_EPOCH');
 if(s.accountActive!==true||s.canTakeover!==true)error('TAKEOVER_AUTH_DENIED');
 if(!['HUMAN','AUTO'].includes(s.mode))error('INVALID_MODE');
 if(s.status!=='NATIVE_TAKEOVER_STATE'||s.identityKey!==fullK(id)||
    !Number.isSafeInteger(s.accountRevocationEpoch)||s.accountRevocationEpoch<0||
    !Number.isSafeInteger(s.consentEpoch)||s.consentEpoch<1||s.canSend!==false)
   error('INCOMPLETE_W24_AUTHORITY_SNAPSHOT');
 return s;
}
export function createComposerBridge({takeoverPort=null}={}){
 const drafts=new Map(),states=new Map(),pending=new Map();
 let selected=null;
 function choose(id){
   synthetic(id);selected=Object.freeze({...id});
   if(!drafts.has(fullK(id)))drafts.set(fullK(id),{text:'',quote:null,attachments:[],candidateId:null});
   return view();
 }
 function requireSelected(id){
   const k=synthetic(id);
   if(!selected||fullK(selected)!==k)error('WRONG_SELECTED_K');
   return k;
 }
 function view(){
   if(!selected)return {key:null,status:'NO_CONTACT',draft:null,canSend:false};
   const k=fullK(selected);
   return {key:k,status:states.get(k)?.status||'UNAVAILABLE',
      draft:{...drafts.get(k),attachments:[...drafts.get(k).attachments]},
      verifiedEpoch:states.get(k)?.epoch??null,canSend:false};
 }
 function write(id,patch){
   const k=requireSelected(id);drafts.set(k,{...drafts.get(k),...patch});return view();
 }
 function quote(id,source){
   const k=requireSelected(id);
   if(!source||source.identityKey!==k||!source.mid||typeof source.original!=='string')
      error('QUOTE_FULL_K_MID_REQUIRED');
   return write(id,{quote:{mid:source.mid,original:source.original,zh:source.zh||''}});
 }
 function candidates(id,sourceMid,rows){
   requireSelected(id);
   if(!Array.isArray(rows)||rows.length>3)error('CANDIDATE_COUNT');
   const seen=new Set();
   return rows.map(row=>{
     if(!row||typeof row.id!=='string'||!row.id||seen.has(row.id)||
        typeof row.text!=='string'||!row.text.trim()||
        row.provenance?.kind!=='AGNO_RUN'||!row.provenance.runId||
        row.provenance.sourceMid!==sourceMid||row.provenance.identityKey!==fullK(id))error('CANDIDATE_PROVENANCE');
     seen.add(row.id);
     return Object.freeze({...row,provenance:Object.freeze({...row.provenance})});
   });
 }
 function adoptCandidate(id,row,sourceMid){
   const r=candidates(id,sourceMid,[row])[0];
   return write(id,{text:r.text,candidateId:r.id}); // Legacy contract / does NOT take over.
 }
 function insertW45Draft(id,sourceMid,row,receipt,now=Date.now()){
   const k=requireSelected(id);
   const candidate=candidates(id,sourceMid,[row])[0];
   if(!Number.isSafeInteger(now)||receipt?.destination!=='EXISTING_BC_COMPOSER'||
      receipt.action!=='INSERT_DRAFT_ONLY'||receipt.delivery!=='NOT_REQUESTED'||
      fullK(receipt.identity)!==k||receipt.source_mid!==sourceMid||
      receipt.candidate_id!==candidate.id||receipt.text!==candidate.text||
      receipt.provenance?.engine!=='OFFICIAL_AGNO_SDK'||
      receipt.provenance?.source_mid!==sourceMid||
      receipt.provenance?.run_id!==candidate.provenance.runId||
      receipt.provenance?.model_id!=='qwen3:8b'||
      receipt.provenance?.model_provider!=='LLAMACPP_LOCAL_QWEN3_8B_FREE'||
      receipt.provenance?.quality_qualified!==false||
      receipt.provenance?.quality_status!=='MODEL_QUALITY_UNREVIEWED'||
      receipt.qualityQualified!==false||
      receipt.qualityStatus!=='MODEL_QUALITY_UNREVIEWED'||
      !Number.isSafeInteger(receipt.runExpiresAt)||receipt.runExpiresAt<=now)
      error('W45_DRAFT_PROVENANCE_INVALID_OR_EXPIRED');
   return write(id,{text:receipt.text,candidateId:receipt.candidate_id,
      provenance:{sourceMid,runId:receipt.provenance.run_id,
        candidateId:receipt.candidate_id,qualityStatus:receipt.qualityStatus}});
 }
 async function inspect(id){
   const k=requireSelected(id);
   if(!takeoverPort?.get){states.set(k,{status:'UNAVAILABLE'});return view()}
   try{
     const raw=await takeoverPort.get({...id});
     if(raw?.status==='IDENTITY_READ_VERIFIED'&&raw.identityKey===k&&
       raw.canTakeover===false&&raw.canSend===false&&fullK(raw.identity)===k){
       states.set(k,{status:'READ_ONLY_IDENTITY_VERIFIED'});
     }else{
       const s=assertStatus(raw,id);
       states.set(k,{status:s.mode==='HUMAN'?'READY_HUMAN':'READ_ONLY_AUTO',epoch:s.epoch});
     }
   }catch{states.set(k,{status:'BLOCKED'})}
   return view(); // Safe GET on view, never POST.
 }
 async function userAction(id,action,patch={}){
   const k=requireSelected(id);
   if(!userActions.has(action))error('UNTRUSTED_ACTION');
   if(patch.text!==undefined){
     if(typeof patch.text!=='string')error('INVALID_TEXT');
     drafts.set(k,{...drafts.get(k),text:patch.text});
   }
   if(patch.attachments!==undefined){
     if(!Array.isArray(patch.attachments)||patch.attachments.some(a=>!a||
       typeof a.name!=='string'||a.name.length>255||!Number.isSafeInteger(a.size)||a.size<0))
       error('BAD_ATTACHMENT_METADATA');
     drafts.set(k,{...drafts.get(k),attachments:patch.attachments.map(a=>({name:a.name,size:a.size}))});
   }
   if(!takeoverPort?.get||!takeoverPort?.post){
     const status=takeoverPort?.get?'READ_ONLY_NO_TAKEOVER_API':'UNAVAILABLE';
     states.set(k,{status});return {key:k,status,canSend:false};
   }
   if(pending.has(k))return pending.get(k);
   const promise=(async()=>{
     states.set(k,{status:'TAKEOVER_PENDING'});
     try{
       const before=assertStatus(await takeoverPort.get({...id}),id);
       if(before.mode==='AUTO'){
         const receipt=await takeoverPort.post({...id},{
           expectedIdentityKey:before.identityKey,
           expectedEpoch:before.epoch,
           expectedAccountRevocationEpoch:before.accountRevocationEpoch,
           expectedConsentEpoch:before.consentEpoch,
           action,intent:'TAKEOVER_HUMAN_COMPOSER'});
         if(receipt?.accepted!==true||receipt.confirmedByGet!==true||
            receipt.identityKey!==k||fullK(receipt.identity)!==k||
            receipt.mode!=='HUMAN'||receipt.epoch!==before.epoch+1||
            receipt.accountRevocationEpoch!==before.accountRevocationEpoch||
            receipt.consentEpoch!==before.consentEpoch||receipt.canSend!==false)
            error('TAKEOVER_POST_NOT_CONFIRMED');
       }
       const after=assertStatus(await takeoverPort.get({...id}),id);
       if(after.mode!=='HUMAN'||
          after.accountRevocationEpoch!==before.accountRevocationEpoch||
          after.consentEpoch!==before.consentEpoch||
          (before.mode==='AUTO'?after.epoch!==before.epoch+1:after.epoch<before.epoch))
          error('TAKEOVER_NOT_VERIFIED');
       states.set(k,{status:'READY_HUMAN',epoch:after.epoch});
       return {key:k,status:'READY_HUMAN',verifiedEpoch:after.epoch,canSend:false};
     }catch(e){
       states.set(k,{status:'BLOCKED'});
       return {key:k,status:'BLOCKED',reason:String(e.message||e),canSend:false};
     }finally{pending.delete(k)}
   })();
   pending.set(k,promise);return promise;
 }
 return Object.freeze({choose,view,quote,candidates,adoptCandidate,insertW45Draft,inspect,userAction,
   selectedIdentity:()=>selected?{...selected}:null});
 // Deliberately no send/outbox/ACK/retry; W25 owns MessageDelivery.
}

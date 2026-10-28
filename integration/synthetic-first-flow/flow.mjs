// Runnable NONPRODUCTION integration-contract test fixture. This is NOT Agno SDK or MessageDelivery implementation.
const channels=new Set(['FB_PERSONAL','FB_PAGE','WHATSAPP_PERSONAL','TELEGRAM_PERSONAL']);
export function k(c){for(const n of ['tenant','account','channel','peer_id','binding_revision'])if(c[n]===undefined||c[n]===null||String(c[n])==='')throw Error('MISSING_K_'+n);if(!channels.has(c.channel))throw Error('BAD_CHANNEL');return [c.tenant,c.account,c.channel,c.peer_id,c.binding_revision].join('|')}
export function harness({contacts,translate,generate,send}){
 if(!Array.isArray(contacts)||contacts.some(c=>c.tenant!=='SYNTHETIC_TEST_ONLY'))throw Error('ONLY_SYNTHETIC_DATA');
 if([translate,generate,send].some(f=>typeof f!=='function'))throw Error('EXPLICIT_PORTS_REQUIRED');
 const map=new Map(contacts.map(c=>[k(c),c]));if(map.size!==contacts.length)throw Error('DUPLICATE_K');
 const modes=new Map([...map].map(([id,c])=>[id,c.mode]));
 const drafts=new Map(),grants=new Map([...map].map(([id])=>[id,{valid:true,expires:999999999,budget:2}]));
 const events=[],seen=new Set(),attempts=new Map();const log=(type,id)=>events.push({type,id,seq:events.length+1});
 const check=id=>{if(!map.has(id))throw Error('UNKNOWN_K')};
 return {
   events,
   snapshot(id){check(id);return {mode:modes.get(id),draft:drafts.get(id)||'',grant:{...grants.get(id)}}},
   focus(id){check(id);log('FOCUS_NO_TAKEOVER',id)},
   edit(id,txt){check(id);modes.set(id,'HUMAN');drafts.set(id,txt);log('HUMAN_EDIT_ONLY_THIS_K',id)},
   setGrant(id,data){check(id);grants.set(id,{...grants.get(id),...data})},
   async inbound({id,mid,original}){
     check(id);if(!String(mid).startsWith('fake-'))throw Error('REAL_PROVIDER_MID_FORBIDDEN');
     const key=id+'|'+mid;if(seen.has(key)){log('DUPLICATE_INBOUND',id);return {duplicate:true}};seen.add(key);
     const tr=await translate({id,mid,original});if(!tr||typeof tr.zh!=='string'||!tr.provenance)throw Error('TRANSLATION_PROVENANCE');
     const suggestions=await generate({id,mid,original,zh:tr.zh});
     if(!Array.isArray(suggestions)||suggestions.length>3||suggestions.some(x=>!x.id||!x.text||!x.provenance))throw Error('BAD_CANDIDATES');
     log('INBOUND_TO_CANDIDATES_SYNTHETIC',id);
     return {id,mid,original,zh:tr.zh,translationProvenance:tr.provenance,suggestions,delivered:'NOT_REQUESTED'}
   },
   draftCandidate(id,c){check(id);if(!c||!c.id||!c.provenance||!c.text)throw Error('NO_PROVENANCE');drafts.set(id,c.text);log('DRAFT_ONLY_NO_SEND',id)},
   async syntheticIntent({id,rid,now=100}){
     check(id);if(!String(rid).startsWith('fake-'))throw Error('NOT_SYNTHETIC_INTENT');
     const key=id+'|'+rid;if(attempts.has(key)){log('REPLAY_BLOCKED',id);return attempts.get(key)}
     const g=grants.get(id);if(!g.valid||g.expires<=now||g.budget<=0||modes.get(id)==='HUMAN'){const blocked={status:'BLOCKED',simulated:true};attempts.set(key,blocked);log('ELIGIBILITY_BLOCK',id);return blocked}
     const out=await send({id,rid,simulated:true});if(!['ACK','UNKNOWN'].includes(out?.status))throw Error('INVALID_MOCK_RECEIPT');
     const resp={status:out.status,simulated:true};attempts.set(key,resp);log(out.status==='ACK'?'SIMULATED_ACK':'SIMULATED_UNKNOWN_NO_RETRY',id);return resp;
   }
 }
}
export const mockPorts={
 translate:async ({original})=>({zh:'[SYNTHETIC_TRANSLATION] '+original,provenance:'MOCK_TRANSLATOR_NOT_REAL'}),
 generate:async ({mid})=>[{id:'fake-reply-'+mid,text:'[SYNTHETIC_REPLY_ONLY]',provenance:'MOCK_NOT_AGNO'}],
 send:async ({rid})=>({status:rid.includes('unknown')?'UNKNOWN':'ACK'})
};

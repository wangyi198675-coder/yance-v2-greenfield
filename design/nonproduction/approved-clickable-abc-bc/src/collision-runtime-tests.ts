import { allContacts, state, reset, key, getDraft, quote, select, uniqueByPeerIn, getByK, COLLISION_ROWS } from './store'
export function runCollisionNegatives(){
 const cases:{id:string;pass:boolean;proof:string}[]=[]
 const ok=(id:string,pass:boolean,proof:string)=>cases.push({id,pass,proof})
 const contacts=COLLISION_ROWS.map(r=>r.contact)
 const keys=COLLISION_ROWS.map(r=>r.identity_K)
 reset()
 ok('NEG_FULL_K_ACCOUNT',keys[0]!==keys[1]&&contacts[0].account!==contacts[1].account,'One peer, different account K')
 ok('NEG_FULL_K_CHANNEL',keys[0]!==keys[2]&&contacts[0].channel!==contacts[2].channel,'One peer, different channel K')
 ok('NEG_FULL_K_REVISION',keys[0]!==keys[3]&&contacts[0].binding_revision!==contacts[3].binding_revision,'One peer, different revision K')
 ok('NEG_FULL_K_TENANT',keys[0]!==keys[4]&&contacts[0].tenant!==contacts[4].tenant,'One peer, different tenant K')
 ok('NEG_BY_PEER_AMBIGUOUS',!uniqueByPeerIn(contacts,contacts[0].peer_id)&&keys.every(k=>!getByK(k)),'Colliding peer-only lookup rejected, negative dataset not merged in real 120')
 for(const r of COLLISION_ROWS){const c=r.contact;getDraft(c).text=r.synthetic_draft;quote(c);state.mode[key(c)]='HUMAN'}
 ok('NEG_SWITCH_AND_RESTORE',COLLISION_ROWS.every(r=>getDraft(r.contact).text===r.synthetic_draft&&getDraft(r.contact).quote?.k===r.identity_K)&&new Set(COLLISION_ROWS.map(r=>getDraft(r.contact).quote?.mid)).size===5,'Five isolated drafts, immutable quoted K/MID')
 const selectedBefore=state.selected
 const rejected=COLLISION_ROWS.every(r=>select(r.contact)===false)
 ok('NEG_SOURCE_MID_SCOPED',rejected&&state.selected===selectedBefore&&allContacts.length===120&&new Set(COLLISION_ROWS.map(r=>getDraft(r.contact).quote?.mid)).size===5,'Collision test rows cannot be selected into visible list; no provider transport')
 reset()
 return {classification:'W39_CHROME_NEGATIVE_DATA_ONLY_NO_REAL_PROVIDER',cases,pass:cases.filter(x=>x.pass).length,fail:cases.filter(x=>!x.pass).length,sourceCount:allContacts.length}
}

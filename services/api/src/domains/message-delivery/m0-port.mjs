// Explicitly NONPRODUCTION adapter for W09 PR #3's existing M0 harness `send({id,rid,simulated})` Port.
// This does not modify the M0 flow, create a second sender, or send to any channel.
// M1 must replace identity/grant fixtures with actual W24/W44 service authority.
import { DeliveryError, assertCanonicalK } from './index.mjs';
const text = (x) => typeof x === 'string' && x.length > 0 && !x.includes('|');

export function canonicalKFromM0SyntheticContact(contact) {
  if (!contact || contact.tenant !== 'SYNTHETIC_TEST_ONLY' ||
      ![contact.tenant,contact.account,contact.channel,contact.peer_id,contact.binding_revision].every(text))
    throw new DeliveryError('M0_SYNTHETIC_CONTACT_REQUIRED');
  return assertCanonicalK({
    tenantId:contact.tenant,accountId:contact.account,channel:contact.channel,
    peerId:contact.peer_id,bindingRevision:String(contact.binding_revision)
  });
}
function m0Id(contact) {
  return [contact.tenant,contact.account,contact.channel,contact.peer_id,contact.binding_revision].join('|');
}
export function createM0SyntheticSendPort({ delivery, contacts }) {
  if (!delivery || typeof delivery.submitIntent !== 'function' ||
      typeof delivery.dispatchOne !== 'function' || !Array.isArray(contacts))
    throw new DeliveryError('M0_PORT_INCOMPLETE');
  const map = new Map();
  for (const contact of contacts) {
    canonicalKFromM0SyntheticContact(contact);
    const id=m0Id(contact);
    if (map.has(id)) throw new DeliveryError('DUPLICATE_M0_K');
    map.set(id,contact);
  }
  return async function send({ id, rid, simulated }) {
    if (simulated !== true || typeof id !== 'string' || !id.includes('|') ||
        typeof rid !== 'string' || !rid.startsWith('fake-'))
      throw new DeliveryError('M0_SYNTHETIC_ONLY');
    const contact=map.get(id);
    if (!contact) throw new DeliveryError('UNKNOWN_M0_K');
    const k=canonicalKFromM0SyntheticContact(contact);
    const intent=await delivery.submitIntent({
      k, businessMessageId:rid,
      payload:{text:'[M0_SYNTHETIC_CONTRACT_ONLY] '+rid},
      mode:'AUTO', actorId:'W09_M0_HARNESS',sessionId:'W09_M0_SYNTHETIC'
    });
    const result=await delivery.dispatchOne(intent.id);
    const final=delivery.getIntent(intent.id);
    if (final.state==='ACKED_SYNTHETIC') return {status:'ACK',simulated:true,intentId:intent.id};
    if (final.state==='UNKNOWN') return {status:'UNKNOWN',simulated:true,intentId:intent.id};
    // Do not lie that lack of permission, busy or a non-sent attempt is a network UNKNOWN.
    throw new DeliveryError('M0_PORT_HOLD_'+(result.denialCode || final.state));
  };
}

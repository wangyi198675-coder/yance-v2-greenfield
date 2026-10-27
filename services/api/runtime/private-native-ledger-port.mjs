// W47 transport shim ONLY: the authoritative ledger is W43 original
// NativePrivateRequestLedger in the SAME native Agno SQLite DB.
export function createW43NativeLedgerAdapter(port){
 if(!port||['claim','finish','markUnknown','reconcile'].some(k=>typeof port[k]!=='function'))
  throw Error('W43_ORIGINAL_DURABLE_LEDGER_PORT_REQUIRED');
 const args=x=>{
  if(typeof x?.context?.checkCurrent!=='function'||
     typeof x.threadId!=='string'||typeof x.requestId!=='string'||
     typeof x.text!=='string')
   throw Error('W47_VERIFIED_LEDGER_CONTEXT_REQUIRED');
  return [x.context,x.threadId,x.requestId,x.text];
 };
 return Object.freeze({
  claim:x=>port.claim(...args(x)),
  finish:x=>port.finish(...args(x),x.receipt),
  markUnknown:x=>port.markUnknown(...args(x)),
  reconcile:x=>port.reconcile(...args(x))
 });
}

// Operator-only local terminal pairing authority for a personal single-user install.
// A "pair" command must be entered on the owning application's terminal.
// No unauthenticated HTTP endpoint can issue, view or rotate a pairing grant.
// Threat model: malicious code with control of the same OS user/process/console
// remains in scope for a separately approved native app review.
import {randomBytes,createHash} from 'node:crypto';
import {createInterface} from 'node:readline';

const MAX_GRANT_AGE_MS=90_000;
const hash=text=>createHash('sha256').update(text).digest('hex');
const output=(stream,value)=>stream.write(value+'\n');

export function createOperatorConsoleIssuer({
  input=process.stdin, outputStream=process.stderr, clock=()=>Date.now(),
  grantTtlMs=MAX_GRANT_AGE_MS, revokeSessions=()=>{}
}={}){
  if(!input||typeof input.on!=='function'||!outputStream||typeof outputStream.write!=='function')
    throw Error('TRUSTED_LOCAL_OPERATOR_INPUT_REQUIRED');
  if(!Number.isSafeInteger(grantTtlMs)||grantTtlMs<=0||grantTtlMs>MAX_GRANT_AGE_MS)
    throw Error('LOCAL_PAIRING_TTL_INVALID');
  let pending=null,closed=false;
  const rl=createInterface({input,crlfDelay:Infinity,terminal:!!input.isTTY});
  const clear=()=>{pending=null};
  const approvePairing=async code=>{
    if(closed||typeof code!=='string'||!/^[a-f0-9]{64}$/.test(code))return false;
    const record=pending;
    if(!record||clock()>=record.expiresAt){clear();return false}
    const actual=hash(code);
    if(actual!==record.digest)return false;
    clear(); // atomic consume before caller creates the Session; exactly once
    return true;
  };
  rl.on('line',line=>{
    if(closed)return;
    const command=line.trim().toLowerCase();
    if(command==='pair'){
      // Explicit local console input, not a browser/HTTP request.
      const code=randomBytes(32).toString('hex');
      pending={digest:hash(code),expiresAt:clock()+grantTtlMs};
      output(outputStream,'W47_OPERATOR_PAIRING_APPROVED_ON_LOCAL_TERMINAL');
      output(outputStream,'PAIRING_CODE='+code);
      output(outputStream,'PAIRING_VALID_SECONDS='+Math.ceil(grantTtlMs/1000));
      return;
    }
    if(command==='revoke'){
      clear();
      revokeSessions(); // invalidates already redeemed local sessions too
      output(outputStream,'W47_OPERATOR_LOCAL_SESSIONS_REVOKED');
      return;
    }
    if(command==='cancel'){
      clear();
      output(outputStream,'W47_OPERATOR_PENDING_PAIRING_CANCELLED');
      return;
    }
    if(command==='help'){
      output(outputStream,'W47_OPERATOR_COMMANDS=pair|cancel|revoke|help');
      return;
    }
    if(command!=='')output(outputStream,'W47_OPERATOR_UNKNOWN_COMMAND');
  });
  const close=()=>{
    if(closed)return;
    closed=true;clear();revokeSessions();rl.close();
  };
  rl.once('close',()=>{if(!closed){closed=true;clear();revokeSessions()}});
  return Object.freeze({approvePairing,close,get active(){return !closed},
    get pending(){return !!pending&&clock()<pending.expiresAt}});
}

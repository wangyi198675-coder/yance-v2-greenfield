// Issue #7 last intermittent RED: 6 independent Windows Node processes open
// the SAME absent SQLite file exactly after one shared barrier release.
// Entire test is synthetic-only and checks the *existing* Outbox/recipient fence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MessageDelivery, SyntheticConnectorSink } from './index.mjs';

const execAsync = promisify(execFile);
const workerFile = fileURLToPath(new URL('./worker.synthetic.mjs', import.meta.url));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const K = {tenantId:'tenant-cold',accountId:'account-cold',channel:'FB_PERSONAL',
  peerId:'one-physical-recipient',bindingRevision:'1'};

async function cleanRoot(root) {
  for(let retry=0;retry<20;retry++) {
    try { rmSync(root,{recursive:true,force:true}); return; }
    catch(error) {
      if(!['EPERM','EBUSY','ENOTEMPTY'].includes(error.code)) throw error;
      if(retry===19) throw error;
      await pause(150);
    }
  }
}

test('12 cold SQLite first-open rounds with six synchronized OS workers: exactly one recipient attempt each',async()=>{
  let successfulRounds=0;
  for(let round=1;round<=12;round++) {
    const root=mkdtempSync(join(tmpdir(),'w25-cold-wal-'));
    const ready=join(root,'ready');
    const barrier=join(root,'release');
    const sqlite=join(root,'fresh-outbox.sqlite');
    mkdirSync(ready);
    let db;
    try {
      assert.equal(existsSync(sqlite),false,'cold database must not yet exist');
      const subprocesses=Array.from({length:6},()=>execAsync(process.execPath,[
        workerFile,sqlite,JSON.stringify(K),barrier,ready
      ],{timeout:25000,windowsHide:true}));
      const until=Date.now()+15000;
      while (readdirSync(ready).length<6) {
        if(Date.now()>until) throw Error('SIX_WORKERS_NOT_READY_AT_BARRIER_ROUND_'+round);
        await pause(10);
      }
      writeFileSync(barrier,'go','utf8');
      const executions=await Promise.all(subprocesses);
      const results=executions.map(({stdout})=>JSON.parse(stdout.trim()));
      assert.equal(new Set(results.map(x=>x.intentId)).size,1,
        'all six workers must share ONE canonical SendIntent');
      assert.equal(results.filter(x=>x.dispatched).length,1,
        'only one worker may pass per-recipient send claim');
      db=new MessageDelivery({
        databasePath:sqlite,eligibility:{check:async()=>({allowed:false})},
        sink:new SyntheticConnectorSink(),receiptVerifier:async()=>({verified:false})
      });
      const intentId=results[0].intentId;
      assert.equal(db.getIntent(intentId).state,'ACKED_SYNTHETIC');
      assert.equal(db.db.prepare('SELECT count(*) n FROM outbox_attempts').get().n,1,
        'durable Outbox contains exactly one attempt');
      assert.equal(db.db.prepare('SELECT count(*) n FROM recipient_fence_counters').get().n,1,
        'single physical-recipient fence allocated');
      assert.equal(db.db.prepare('SELECT count(*) n FROM recipient_leases').get().n,0);
      successfulRounds++;
    } finally {
      db?.close();
      await cleanRoot(root);
    }
  }
  assert.equal(successfulRounds,12);
});

test('UNKNOWN persisted on disk: two restarted OS workers never replay the original attempt', async()=>{
  const root=mkdtempSync(join(tmpdir(),'w25-cold-unknown-'));
  const sqlite=join(root,'unknown-outbox.sqlite');
  const authority={async check({k,mode}) {
    return {allowed:true,k,accountActive:true,accountEpoch:'acct-1',
      custodyEpoch:'custody-1',routeRevision:'route-1',custodyMode:mode,
      agentActive:true,agentRevision:'agent-1',grantActive:true,grantRevision:'grant-1',
      expiresAt:Date.now()+60000,budget:{reserved:true,reservationId:'budget-1'}};
  }};
  let svc;
  try {
    const syntheticSink=new SyntheticConnectorSink(async()=>({kind:'UNKNOWN'}));
    svc=new MessageDelivery({databasePath:sqlite,eligibility:authority,
      sink:syntheticSink,receiptVerifier:async()=>({verified:false})});
    const row=await svc.submitIntent({k:K,businessMessageId:'multiprocess-business',
      payload:{text:'synthetic-only'},mode:'AUTO',actorId:'first-process',sessionId:'original'});
    assert.equal((await svc.dispatchOne(row.id)).state,'UNKNOWN');
    assert.equal(syntheticSink.calls.length,1);
    svc.close();svc=null;
    const execute=()=>execAsync(process.execPath,[workerFile,sqlite,JSON.stringify(K)],{
      timeout:25000,windowsHide:true
    }).then(({stdout})=>JSON.parse(stdout.trim()));
    const results=await Promise.all([execute(),execute()]);
    assert.equal(results.every(x=>x.intentId===row.id && x.state==='UNKNOWN' && x.dispatched===false),true);
    svc=new MessageDelivery({databasePath:sqlite,eligibility:authority,
      sink:new SyntheticConnectorSink(),receiptVerifier:async()=>({verified:false})});
    assert.equal(svc.getIntent(row.id).state,'UNKNOWN');
    assert.equal(svc.db.prepare('SELECT count(*) n FROM outbox_attempts').get().n,1);
    assert.equal(svc.getAudit(row.id).filter(x=>x.event_type==='SYNTHETIC_RESULT').length,1);
  } finally {
    svc?.close();
    await cleanRoot(root);
  }
});

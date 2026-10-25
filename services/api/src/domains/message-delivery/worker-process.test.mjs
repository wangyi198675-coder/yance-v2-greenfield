import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MessageDelivery, SyntheticConnectorSink } from './index.mjs';
const execAsync = promisify(execFile);
const workerFile = fileURLToPath(new URL('./worker.synthetic.mjs', import.meta.url));

test('two isolated OS processes share durable SQL intent/recipient fence; only one sink attempt', async() => {
  const root = mkdtempSync(join(tmpdir(),'yance-w25-process-'));
  const dbPath = join(root,'two-workers.sqlite');
  const k = {tenantId:'tenant-A',accountId:'account-A',channel:'FB_PERSONAL',
    peerId:'physical-A',bindingRevision:'binding-A'};
  try {
    const run = () => execAsync(process.execPath,[workerFile,dbPath,JSON.stringify(k)],{
      timeout:15000,windowsHide:true
    }).then(({stdout})=>JSON.parse(stdout.trim()));
    const [a,b] = await Promise.all([run(),run()]);
    assert.equal(a.intentId,b.intentId);
    assert.equal([a,b].filter((x)=>x.dispatched).length,1);
    const svc = new MessageDelivery({
      databasePath:dbPath,eligibility:{check:async()=>({})},
      sink:new SyntheticConnectorSink(),receiptVerifier:()=>({verified:false})
    });
    try {
      assert.equal(svc.getIntent(a.intentId).state,'ACKED_SYNTHETIC');
      const attempted=svc.db.prepare('SELECT count(*) count FROM outbox_attempts').get().count;
      assert.equal(attempted,1);
      const lease=svc.db.prepare('SELECT count(*) count FROM recipient_leases').get().count;
      assert.equal(lease,0);
      assert.ok(svc.getAudit(a.intentId).some((x)=>x.event_type==='DEDUPLICATED'));
    } finally { svc.close(); }
  } finally {
    for (let retry = 0; retry < 20; retry++) {
      try { rmSync(root, { recursive:true, force:true }); break; }
      catch (error) {
        if (!['EPERM','EBUSY','ENOTEMPTY'].includes(error.code)) throw error;
        if (retry === 19) console.warn('Synthetic Windows test temp cleanup deferred:',root,error.code);
        else await new Promise((resolve)=>setTimeout(resolve,200));
      }
    }
  }
});

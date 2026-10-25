// Subprocess fixture invoked by worker-process.test.mjs; no external network provider.
import { MessageDelivery, SyntheticConnectorSink } from './index.mjs';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [databasePath, kJson, barrierFile, readyDirectory] = process.argv.slice(2);
if (!databasePath || !kJson) throw new Error('SYNTHETIC_WORKER_ARGS_REQUIRED');
const k = JSON.parse(kJson);
const eligibility = { async check({ k: incomingK, mode }) {
  return {
    allowed: true, k: incomingK, accountActive: true, accountEpoch: 'acct-1',
    custodyEpoch: 'custody-1', routeRevision: 'route-1', custodyMode: mode,
    agentActive: true, agentRevision: 'agent-1', grantActive: true,
    grantRevision: 'grant-1', expiresAt: Date.now() + 60000,
    budget: { reserved: true, reservationId: 'budget-1' }
  };
}};
// Test-only barrier synchronizes independent processes BEFORE cold SQLite open.
if (barrierFile && readyDirectory) {
  writeFileSync(join(readyDirectory, process.pid + '.ready'), '1');
  const cutoff = Date.now() + 15000;
  const waitCell = new Int32Array(new SharedArrayBuffer(4));
  while (!existsSync(barrierFile)) {
    if (Date.now() > cutoff) throw Error('COLD_START_TEST_BARRIER_TIMEOUT');
    Atomics.wait(waitCell, 0, 0, 10);
  }
}
const svc = new MessageDelivery({
  databasePath, eligibility, sink: new SyntheticConnectorSink(),
  receiptVerifier: () => ({ verified: false })
});
try {
  const intent = await svc.submitIntent({
    k, businessMessageId: 'multiprocess-business', payload: { text: 'synthetic-only' },
    mode:'AUTO',actorId:process.pid.toString(),sessionId:'worker-'+process.pid
  });
  const result = await svc.dispatchOne(intent.id);
  process.stdout.write(JSON.stringify({intentId:intent.id,reused:intent.reused, ...result})+'\n');
} finally { svc.close(); }

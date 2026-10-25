#!/usr/bin/env node
// Evidence only: no account data, credentials, provider calls or send capability.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const SHA = /^[0-9a-f]{40}$/;
const mandatory = ['contracts-security', 'native-node', 'agno-python', 'synthetic-m0', 'frontend-browser'];
export function makeReport(input) {
  const event = input.event === 'pull_request' ? 'pull_request' : input.event === 'workflow_dispatch' ? 'workflow_dispatch' : null;
  if (!event) throw Error('Unsupported workflow event');
  const head = event === 'pull_request' ? input.prHead : (input.targetSha || input.checkoutSha);
  if (!SHA.test(head || '') || !SHA.test(input.checkoutSha || '')) throw Error('Exact 40-hex source SHA required');
  if (input.checkoutSha !== head) throw Error('CHECKOUT_SHA_MISMATCH: test checkout was not the intended exact PR/source SHA');
  if (input.baseSha && !SHA.test(input.baseSha)) throw Error('Invalid base SHA');
  if (event === 'workflow_dispatch' && input.prNumber && !input.targetSha) throw Error('Dispatch PR label without target SHA');
  const results = Object.fromEntries(mandatory.map(name => [name, input.needs?.[name]?.result || 'missing']));
  const success = Object.values(results).every(v => v === 'success');
  return {
    schema: 'yance-v2-ci-evidence/v1',
    purpose: 'NONPRODUCTION_SCOPED_CHECKS_ONLY',
    event,
    prNumber: /^\d+$/.test(String(input.prNumber || '')) ? Number(input.prNumber) : null,
    intendedSourceSha: head,
    testedCheckoutSha: input.checkoutSha,
    baselineSha: input.baseSha || null,
    workflowRunUrl: input.runUrl || null,
    checkAttribution: event === 'pull_request' ? 'PR_HEAD_CHECKS' : 'DISPATCH_RUN_ONLY_NOT_PR_HEAD_CHECKS',
    checks: results,
    gate: success ? 'SCOPED_CI_GREEN' : 'SCOPED_CI_RED',
    realM1NativeEndToEnd: 'NOT_ATTESTED',
    realProviderAck: 'NOT_ATTESTED',
    localWindowsModel: 'NOT_RUN_ON_GITHUB',
    notes: 'Success means only the committed scoped CI checks succeeded. NOT_APPLICABLE and synthetic tests are not business M1 PASS.'
  };
}
export function writeReport(input, directory, summaryFile) {
  const report = makeReport(input);
  fs.mkdirSync(directory, {recursive:true});
  const file = path.join(directory, 'pr-head-evidence.json');
  fs.writeFileSync(file, JSON.stringify(report,null,2) + '\n');
  const lines = [
    '### YANCE V2 exact-source CI evidence',
    '',
    '| Field | Value |', '| --- | --- |',
    '| Event | '+report.event+' |',
    '| PR | '+(report.prNumber ?? 'none')+' |',
    '| Intended source SHA | `'+report.intendedSourceSha+'` |',
    '| Actual tested checkout SHA | `'+report.testedCheckoutSha+'` |',
    '| Attribution | '+report.checkAttribution+' |',
    '| Scope | '+report.gate+'; real native M1, provider ACK and local Windows model NOT_ATTESTED |',
    '', '| CI job | Outcome |', '| --- | --- |',
    ...Object.entries(report.checks).map(([k,v])=>'| '+k+' | '+v+' |'),
    '', 'Never interpret a main-branch workflow_dispatch result as attached PR-head checks.'
  ];
  if(summaryFile) fs.appendFileSync(summaryFile, lines.join('\n')+'\n');
  console.log(JSON.stringify(report,null,2));
  return report;
}
const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  const root = process.cwd();
  let checkoutSha;
  try {checkoutSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(); }
  catch { console.error('Cannot verify checkout SHA'); process.exit(2); }
  let needs;
  try {needs=JSON.parse(process.env.CI_NEEDS || '{}'); }
  catch {console.error('Invalid CI_NEEDS JSON');process.exit(2);}
  try {
    const result=writeReport({
      event:process.env.CI_EVENT_NAME,
      prHead:process.env.CI_PR_HEAD_SHA,
      targetSha:process.env.CI_TARGET_SHA,
      checkoutSha,
      prNumber:process.env.CI_PR_NUMBER,
      baseSha:process.env.CI_BASE_SHA,
      needs,
      runUrl:process.env.CI_RUN_URL
    },path.join(root,'ci-artifacts'),process.env.GITHUB_STEP_SUMMARY);
    if(result.gate==='SCOPED_CI_RED')process.exitCode=1;
  } catch(e) {
    console.error('::error::'+String(e.message).replace(/[\r\n]/g,' '));
    process.exitCode=2;
  }
}

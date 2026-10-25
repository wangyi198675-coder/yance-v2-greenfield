'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const files=[
  '.github/CODEOWNERS',
  'docs/EXECUTION_AUTHORITY_20261025.md',
  'docs/SOURCE_OWNER_DISPATCH_AND_ACCEPTANCE_20261025.md',
  'docs/OWNER_ACK_TEMPLATE_20261025.md',
  'docs/SYNTHETIC_VERTICAL_SLICE_ONE_20261025.md'
];
const errors=files.filter(f=>!fs.existsSync(path.join(root,f))).map(f=>'MISSING '+f);
const ownersPath=path.join(root,'.github/CODEOWNERS');
if(fs.existsSync(ownersPath)){
  const contents=fs.readFileSync(ownersPath,'utf8');
  const effective=contents.split(/\r?\n/).filter(line=>line.trim()&&!line.trim().startsWith('#'));
  if(!contents.includes('NOT ENFORCED'))errors.push('Owner approval state not declared NOT ENFORCED');
  if(effective.length)errors.push('Effective CODEOWNERS rules require separate verified principal ACK and policy review');
}
if(fs.existsSync(path.join(root,'.github/workflows/greenfield-contract-ci.yml')))
  errors.push('Obsolete greenfield-contract-ci.yml duplicates trusted All-Domain workflow');
const branch=cp.execFileSync('git',['rev-parse','--abbrev-ref','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const result={
  result:errors.length?'RED':'LOCAL_GOVERNANCE_PREPARED_ONLY',
  branch,
  requiredFiles:files.length,
  ownerAck:'HOLD_NOT_VERIFIED',
  branchRuleset:'EXTERNAL_GITHUB_RECHECK_REQUIRED',
  sevenJobCi:'EXTERNAL_EXACT_HEAD_GITHUB_RUN_REQUIRED',
  mergeApproved:false,
  errors
};
console.log(JSON.stringify(result,null,2));
if(errors.length)process.exitCode=1;

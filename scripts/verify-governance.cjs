const fs=require('fs'),path=require('path'),cp=require('child_process');
const root=path.resolve(__dirname,'..');
const files=['docs/EXECUTION_AUTHORITY_20261025.md','docs/SOURCE_OWNER_DISPATCH_AND_ACCEPTANCE_20261025.md','docs/OWNER_ACK_TEMPLATE_20261025.md','docs/SYNTHETIC_VERTICAL_SLICE_ONE_20261025.md','.github/CODEOWNERS','.github/workflows/greenfield-contract-ci.yml'];
const missing=files.filter(p=>!fs.existsSync(path.join(root,p)));
const contents=fs.existsSync(path.join(root,'.github/CODEOWNERS'))?fs.readFileSync(path.join(root,'.github/CODEOWNERS'),'utf8'):'';
const errors=[...missing.map(p=>'Missing '+p)];
if(contents&&!contents.includes('NOT ENFORCED'))errors.push('CODEOWNERS claims unverified protection');
const branch=cp.execFileSync('git',['rev-parse','--abbrev-ref','HEAD'],{cwd:root,encoding:'utf8'}).trim();
console.log(JSON.stringify({result:errors.length?'RED':'LOCAL_GOVERNANCE_GUARD_PASS',branch,files:files.length,protection:'NOT ENFORCED: missing private Git host and real self-ACK principals',errors},null,2));if(errors.length)process.exitCode=1;

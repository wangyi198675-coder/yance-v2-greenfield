#!/usr/bin/env node
// W30 trusted CI controller. Read-only source testing; write permissions only in a separate publisher job.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const SHA=/^[a-f0-9]{40}$/;
const REQUIRED=['source','contract','security','native','agno','m0','frontend','browserInstall','browser'];
const only=(v)=>String(v||'').slice(0,220);
export function validatePlan(items){
  if(!Array.isArray(items)||items.length===0||items.length>100)throw Error('PR plan must contain 1-100 entries');
  const seen=new Set();
  return items.map(p=>{
    if(!Number.isInteger(p.number)||p.number<=0||seen.has(p.number))throw Error('duplicate/invalid PR');
    seen.add(p.number);
    if(!SHA.test(p.sha)||!SHA.test(p.base))throw Error('invalid full source/base SHA');
    return {number:p.number,sha:p.sha,base:p.base,ref:p.ref||''};
  });
}
export function alreadyAttestedAtExactHead(item,checkRuns){
  if(!SHA.test(item?.sha) || !Array.isArray(checkRuns))return false;
  return checkRuns.some(x=>
    x.name==='w30/exact-head-backfill'&&
    x.head_sha===item.sha&&
    x.status==='completed'&&
    x.conclusion==='success'&&
    x.app?.slug==='github-actions'&&
    typeof x.details_url==='string'&&x.details_url.startsWith('https://github.com/')
  );
}
// A PR event owns only its triggering PR. Full incremental sweeps remain on schedule/dispatch/push.
// This prevents an unrelated existing RED Owner PR from contaminating another PR's new run.
export function eventScopedPrs(prs,{eventName,targetNumber}={}){
  if(!Array.isArray(prs))throw Error('open PR list required');
  if(eventName==='pull_request_target'){
    const raw=String(targetNumber??'');
    if(!/^[1-9][0-9]*$/.test(raw)||!Number.isSafeInteger(Number(raw)))throw Error('PULL_REQUEST_EVENT_NUMBER_REQUIRED');
    return prs.filter(p=>p.number===Number(raw));
  }
  if(!['push','schedule','workflow_dispatch'].includes(eventName))throw Error('UNRECOGNIZED_BACKFILL_EVENT');
  return prs;
}
export function classify(item,actualSha,outcomes,applicability={}){
  if(!SHA.test(actualSha)||actualSha!==item.sha)throw Error('CHECKOUT_SHA_MISMATCH');
  const states={};
  for(const name of REQUIRED){
    const v=outcomes[name]||'missing';
    if(!['success','failure','skipped','cancelled','missing'].includes(v))throw Error('invalid step outcome '+name);
    states[name]=v;
  }
  // A workflow step can be skipped only when that source-backed check truly is not applicable.
  const optional={agno:!applicability.agno,m0:!applicability.m0,browserInstall:!applicability.browser,browser:!applicability.browser};
  const failures=REQUIRED.filter(k=>states[k]!=='success'&&!(states[k]==='skipped'&&optional[k]));
  if(applicability.agno&&states.agno==='skipped')failures.push('agno-required');
  if(applicability.browser&&(states.browser==='skipped'||states.browserInstall==='skipped'))failures.push('browser-required');
  return {
    schema:'yance-v2-w30-exact-pr-backfill/v1',prNumber:item.number,
    intendedSourceSha:item.sha,testedCheckoutSha:actualSha,
    baseSha:item.base,checks:states,applicability,
    conclusion:failures.length?'failure':'success',failures,
    claim:'NONPRODUCTION_SCOPED_TESTS_ONLY',
    notAttested:['M1_OR_M2_NATIVE_END_TO_END','REAL_PROVIDER_ACK','WINDOWS_LOCAL_MODEL','QWEN3_8B_INFERENCE','SECURITY_RELEASE_APPROVAL'],
  };
}
async function api(method,endpoint,body){
  const repo=process.env.GITHUB_REPOSITORY;
  if(!/^[-\w.]+\/[-\w.]+$/.test(repo||''))throw Error('github repo unset');
  const token=process.env.GITHUB_TOKEN;
  if(!token)throw Error('GitHub Actions token not provided');
  const u='https://api.github.com/repos/'+repo+endpoint;
  const res=await fetch(u,{method,headers:{
    Accept:'application/vnd.github+json',Authorization:'Bearer '+token,
    'X-GitHub-Api-Version':'2022-11-28',
    ...(body?{'Content-Type':'application/json'}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  if(!res.ok)throw Error('GitHub API '+method+' '+endpoint.split('?')[0]+' HTTP '+res.status);
  return res.status===204?null:res.json();
}
async function discover(){
  let page=1,prs=[];
  for(;;){
    const batch=await api('GET','/pulls?state=open&per_page=100&page='+page);
    prs.push(...batch);if(batch.length<100)break;if(++page>5)throw Error('PR pagination limit');
  }
  const [owner,name]=process.env.GITHUB_REPOSITORY.split('/');
  const scoped=eventScopedPrs(prs,{eventName:process.env.GITHUB_EVENT_NAME,targetNumber:process.env.W30_TARGET_PR_NUMBER});
  const chosen=scoped.filter(p=>p.head?.repo?.full_name===owner+'/'+name && !p.head?.ref?.startsWith('ci/w30-'))
    .map(p=>({number:p.number,sha:p.head.sha,base:p.base.sha,ref:p.head.ref}));
  const pending=(await Promise.all(chosen.map(async p=>{
    const response=await api('GET','/commits/'+p.sha+'/check-runs?check_name=w30%2Fexact-head-backfill&per_page=100');
    if(alreadyAttestedAtExactHead(p,response.check_runs||[]))return null;
    return p;
  }))).filter(Boolean);
  const plan=pending.length?validatePlan(pending):[];
  const matrix=JSON.stringify({include:plan});
  const out=process.env.GITHUB_OUTPUT;
  if(out)fs.appendFileSync(out,'matrix='+matrix+'\ncount='+plan.length+'\n');
  console.log('W30_PR_HEAD_PLAN '+JSON.stringify(plan));
  console.log('W30_ALREADY_ATTESTED_SKIPPED '+(chosen.length-plan.length));
}
function record(){
  const item=JSON.parse(process.env.CI_ITEM||'{}');
  validatePlan([item]);
  const actual=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const states=JSON.parse(process.env.CI_STEPS_JSON||'{}');
  const a=JSON.parse(process.env.CI_APPLICABILITY||'{}');
  const result=classify(item,actual,states,a);
  const dest=path.resolve(process.env.CI_EVIDENCE_DIR||'ci-artifacts');
  fs.mkdirSync(dest,{recursive:true});
  fs.writeFileSync(path.join(dest,'pr-head.json'),JSON.stringify(result,null,2)+'\n');
  console.log('W30_HEAD_TEST_RESULT '+JSON.stringify(result));
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    '### PR #'+item.number+' exact '+item.sha+'\n'+
    '| Scope | Outcome |\n| --- | --- |\n'+Object.entries(result.checks).map(([k,v])=>'| '+k+' | '+v+' |').join('\n')+
    '\nM1/provider ACK/Windows model not attested.\n');
  if(result.conclusion!=='success')process.exitCode=1;
}
async function publish(){
  const plan=validatePlan(JSON.parse(process.env.CI_MATRIX||'{}').include);
  const id=Number(process.env.GITHUB_RUN_ID);
  if(!Number.isInteger(id)||id<1)throw Error('Invalid workflow run');
  const jobs=await api('GET','/actions/runs/'+id+'/jobs?per_page=100');
  const byName=new Map(jobs.jobs.map(j=>[j.name,j]));
  const base=path.resolve(process.env.CI_ARTIFACT_DIR||'ci-artifacts/backfill');
  const statuses=[];
  for(const p of plan){
    // A move during the workflow never gets attributed to the now-current PR HEAD.
    const live=await api('GET','/pulls/'+p.number);
    if(live.head?.sha!==p.sha){statuses.push({pr:p.number,status:'STALE_HEAD_HOLD'});continue;}
    let evidence=null;
    const file=path.join(base,'w30-pr-'+p.number+'-'+p.sha,'pr-head.json');
    if(fs.existsSync(file)){try{evidence=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}}
    const job=byName.get('audit-pr-'+p.number);
    const valid= evidence &&
      evidence.schema==='yance-v2-w30-exact-pr-backfill/v1' &&
      evidence.prNumber===p.number &&
      evidence.intendedSourceSha===p.sha&&evidence.testedCheckoutSha===p.sha &&
      evidence.baseSha===p.base&&evidence.conclusion==='success' &&
      job?.conclusion==='success' &&
      Array.isArray(evidence.notAttested) && evidence.notAttested.includes('M1_OR_M2_NATIVE_END_TO_END');
    const conclusion=valid?'success':'failure';
    const summary=[
      'Exact tested PR source SHA: '+p.sha,
      'Current PR HEAD was revalidated at publication.',
      'Hosted matrix job conclusion: '+(job?.conclusion||'missing'),
      'Verified step report: '+(evidence?.conclusion||'MISSING_OR_UNTRUSTED'),
      'Scopes: '+Object.entries(evidence?.checks||{}).map(([k,v])=>k+'='+v).join(', '),
      'This does not replace nonproduction-merge-gate; M1/M2, real provider ACK, Windows local model, and Qwen3 inference remain separate HOLD.'
    ].join('\n').slice(0,5500);
    const created=await api('POST','/check-runs',{
      name:'w30/exact-head-backfill',head_sha:p.sha,status:'completed',conclusion,
      details_url:'https://github.com/'+process.env.GITHUB_REPOSITORY+'/actions/runs/'+id,
      external_id:'w30-'+id+'-pr-'+p.number,
      output:{title:'W30 scoped exact HEAD: '+conclusion.toUpperCase(),summary}
    });
    statuses.push({pr:p.number,sha:p.sha,conclusion,checkRunId:created.id});
  }
  console.log('W30_PUBLISHED_EXACT_HEAD_RESULTS '+JSON.stringify(statuses));
  if(statuses.some(x=>x.conclusion==='failure'||x.status))process.exitCode=1;
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const command=process.argv[2];
  if(command==='discover')await discover();
  else if(command==='record')record();
  else if(command==='publish')await publish();
  else throw Error('Use discover | record | publish');
}

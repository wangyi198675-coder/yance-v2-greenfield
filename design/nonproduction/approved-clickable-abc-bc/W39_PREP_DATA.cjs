const fs=require('fs'),p=require('path'),c=require('crypto'); const root=__dirname;
const targets=[
 ['fixture','../../fixtures/synthetic_120_contacts.json','5b9a05df788fe5fab41b6b2033fb895cd3650fb573345856650cfeb24ef9c99c'],
 ['overlay','../VIEW34_ABC_BC_PREP_20261024/W34_SCENARIO_OVERLAY_SPEC.json','4ed9607d0d65833ab9a5ead3513fdb3b9d03c27e85959997f0125b759071c824'],
 ['sidecar','C:/Users/1/Documents/YanceV2/Phase3_OSS_Worktrees_20261024/DISPATCH/P2_AUDIT_ONLY_20261024/INDEPENDENT_REVIEW_RECEIPTS/P3-W37-SYNTHETIC-FREEZE/ADDITIVE_SYNTHETIC_SCENARIOS.json','deed37219749242ef853418103fbad902c547089e723233671ed04a7e90af4dc'],
 ['tasks','C:/Users/1/Documents/YanceV2/Phase3_OSS_Worktrees_20261024/DISPATCH/P2_AUDIT_ONLY_20261024/INDEPENDENT_REVIEW_RECEIPTS/P3-W37-SYNTHETIC-FREEZE/FOUR_ARM_EXPECTED_OUTCOMES.csv','824f1073065ee0a7f726fd878433fb52cc1f81f212db926175c1d00946a5fe29']
];
fs.mkdirSync(p.join(root,'src/data'),{recursive:true});
for(const [name,src,expected] of targets){const b=fs.readFileSync(p.resolve(root,src)),sha=c.createHash('sha256').update(b).digest('hex');if(sha!==expected)throw Error(name+' sha changed '+sha);const out=p.join(root,'src/data/'+name+(name==='tasks'?'.csv':'.json'));fs.writeFileSync(out,b);console.log(name,sha,b.length)}

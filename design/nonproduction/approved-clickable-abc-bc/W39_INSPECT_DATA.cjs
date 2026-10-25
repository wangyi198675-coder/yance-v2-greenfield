const fs=require('fs'),p=require('path');
const root=__dirname,r=p.resolve(root,'../..'), d='C:/Users/1/Documents/YanceV2/Phase3_OSS_Worktrees_20261024/DISPATCH/P2_AUDIT_ONLY_20261024/INDEPENDENT_REVIEW_RECEIPTS/P3-W37-SYNTHETIC-FREEZE';
for(const [name,filepath] of [['fixture',p.join(r,'fixtures','synthetic_120_contacts.json')],['overlay',p.join(r,'nonproduction','VIEW34_ABC_BC_PREP_20261024','W34_SCENARIO_OVERLAY_SPEC.json')],['sidecar',p.join(d,'ADDITIVE_SYNTHETIC_SCENARIOS.json')]]){
 const obj=JSON.parse(fs.readFileSync(filepath,'utf8'));console.log('DATA',name,'keys',Object.keys(obj));for(const [k,v] of Object.entries(obj)){console.log(' '+k,Array.isArray(v)?('Array len '+v.length+' sample '+JSON.stringify(v[0]).slice(0,1500)):typeof v==='object'&&v?('Keys '+Object.keys(v).join(',').slice(0,600)):String(v).slice(0,120));}
 if(name==='overlay'){console.log('OVERLAY partial',JSON.stringify(obj).slice(0,10000))}
}

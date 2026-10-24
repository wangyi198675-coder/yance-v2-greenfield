const fs=require('fs'),p=require('path'),root=__dirname; const s=fs.readFileSync(p.join(root,'test-output/CHROME_UAT_DOM.html'),'utf8');
const m=s.match(/<pre id="W39_BROWSER_UAT_RESULTS"[^>]*>([\s\S]*?)<\/pre>/);if(!m)throw Error('BROWSER RESULTS NOT IN DOM');
const raw=m[1].replace(/&quot;/g,'"').replace(/&#39;|&#x27;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const v=JSON.parse(raw);if(v.rows.length!==44)throw Error('incomplete '+v.rows.length);
fs.writeFileSync(p.join(root,'test-output/W39_CHROME_UAT_RESULTS.json'),JSON.stringify(v,null,2));
const csv=([['case_id','task_id','arm','result','proof','error'].join(',')].concat(v.rows.map(x=>['case_id','task_id','arm','result','proof','error'].map(k=>'"'+String(x[k]||'').replace(/"/g,'""').replace(/[\r\n]/g,' ')+'"').join(',')))).join('\n')+'\n';
fs.writeFileSync(p.join(root,'RUNTIME_44_TASK_EXECUTION_ROWS.csv'),csv);
console.log('Chrome executed',v.rows.length,'pass',v.pass,'fail',v.fail);
for(const v1 of v.rows.filter(x=>x.result==='FAIL'))console.log('FAIL',v1.case_id,v1.error);

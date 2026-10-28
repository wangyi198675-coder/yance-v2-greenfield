'use strict';
// New clean Git checkout test, NO historical W39 browser result dependency.
// Checks committed contract/vendor sources. Actual GUI is separately tested by real CI Chromium.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const raw=(p)=>fs.readFileSync(path.join(root,p));
const json=p=>JSON.parse(raw(p).toString('utf8'));
const sha=p=>crypto.createHash('sha256').update(raw(p)).digest('hex');
const expected=Object.freeze({
 fixture:'5b9a05df788fe5fab41b6b2033fb895cd3650fb573345856650cfeb24ef9c99c',
 overlay:'4ed9607d0d65833ab9a5ead3513fdb3b9d03c27e85959997f0125b759071c824',
 sidecar:'deed37219749242ef853418103fbad902c547089e723233671ed04a7e90af4dc',
 tasks:'824f1073065ee0a7f726fd878433fb52cc1f81f212db926175c1d00946a5fe29'
});
for(const [k,value] of Object.entries(expected)){
 const file='src/data/'+k+(k==='tasks'?'.csv':'.json');
 test('immutable W37 '+k+' committed SHA',()=>assert.equal(sha(file),value));
}
test('120 fictional identities have unique canonical K and fake MIDs',()=>{
 const a=json('src/data/fixture.json').contacts;
 assert.equal(a.length,120);
 const k=c=>[c.tenant,c.account,c.channel,c.peer_id,c.binding_revision].join('|');
 assert.equal(new Set(a.map(k)).size,120);
 assert.equal(new Set(a.map(c=>c.last_message.provider_mid)).size,120);
 assert.ok(a.every(c=>c.tenant==='SYNTHETIC_TEST_ONLY'||c.tenant==='synthetic-tenant'),'Unexpected real tenant');
});
test('original and Chinese translation preserved explicitly as synthetic fixtures',()=>{
 const rows=json('src/data/fixture.json').contacts;
 rows.forEach((c,i)=>{
  const n=i+1;
  assert.equal(c.last_message.original,'Test message #'+n);
  assert.equal(c.last_message.zh,'模拟译文 #'+n);
  assert.equal(c.last_message.provider_mid,'fake-mid-'+n);
 });
});
test('candidate fixture allows real 0/1/2/3 counts without forced three',()=>{
 const r=json('src/data/overlay.json').reply_cases;
 assert.deepEqual(r.map(x=>x.candidates.length),[0,1,2,3]);
 assert.ok(r.every(x=>x.candidates.every(c=>c.id.startsWith('offline-'))));
});
test('four frozen arms, 5 themes light/dark and 8 additional fake events',()=>{
 const s=json('src/data/sidecar.json');
 assert.equal(s.arm_registry.length,4);
 assert.ok(s.arm_registry.some(x=>x.id==='CHAT-BC-FUSION'));
 assert.equal(s.theme_states.length,10);
 assert.equal(s.added_synthetic_events.length,8);
});
test('effective cross-account synthetic fixture does not modify immutable source',()=>{
 const e=json('src/data/effective-fixture.json');
 assert.equal(sha('src/data/effective-fixture.json'),'6198539f936ac636cd24ec812456557e5d9c6509cdf9c6c63856f4f061699af9');
 assert.equal(e.contacts.length,120);
 assert.equal(e.contacts[116].account,'fixture-account-2');
 assert.equal(json('src/data/fixture.json').contacts[116].account,'fixture-account-1');
});
test('72 actual imported OSS source bytes match approved vendor SHA manifest',()=>{
 const o=json('W39_VENDOR_MODIFICATIONS.json');
 assert.equal(o.files.length,72);
 assert.equal(o.modifications.length,5);
 for(const item of o.files) assert.equal(sha(item.vendorPath),item.finalVendorSha,item.vendorPath);
});
test('SBOM 74 components and existing OSS Notice are committed',()=>{
 const bom=json('evidence/CYCLONEDX_1_5_SBOM.json');
 assert.equal(bom.components.length,74);
 assert.match(raw('THIRD_PARTY_NOTICES.txt').toString('utf8'),/SHADCN-VUE MIT/);
});
test('14 direct OSS dependencies pinned with reproducible committed lockfile',()=>{
 const p=json('package.json'),lock=json('package-lock.json');
 const dep={...p.dependencies,...p.devDependencies};
 assert.equal(Object.keys(dep).length,14);
 assert.equal(p.overrides.esbuild,'0.28.1');
 assert.equal(dep.vite,'7.3.7');
 assert.ok(lock.packages?.['']);
});
test('selected B+C default is chat-first, no automatic private or Autopilot mode',()=>{
 const s=raw('src/store.ts').toString('utf8');
 assert.match(s,/arm:ARMS\[3\]\.id/);
 assert.match(s,/pulseOpen:false,privateOpen:false/);
 assert.match(s,/id:'CHAT-BC-FUSION'/);
});
test('single CONTACT Composer remains distinct from PRIVATE workspace',()=>{
 const app=raw('src/App.vue').toString('utf8');
 assert.equal((app.match(/data-test="composer"/g)||[]).length,1);
 assert.match(app,/data-test="autopilot-center"/);
 assert.match(app,/openPrivateWorkspace/);
});
test('the old W39 browser receipt is NOT a source prerequisite or claimed CI PASS',()=>{
 const pkg=json('package.json');
 assert.equal(pkg.scripts.test,'node --test ./tests/reproducible.cjs');
 assert.ok(!pkg.scripts.test.includes('W39_CHROME_UAT_RESULTS'));
 // This suite doesn't claim 44 historical real-Chrome cases. Separate hosted Chromium tests do.
});

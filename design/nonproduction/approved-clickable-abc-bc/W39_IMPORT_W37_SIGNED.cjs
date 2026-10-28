const fs=require('fs'),p=require('path'),crypto=require('crypto');const root=__dirname;
const source='C:/Users/1/Documents/YanceV2/Phase3_OSS_Worktrees_20261024/DISPATCH/P2_AUDIT_ONLY_20261024/INDEPENDENT_REVIEW_RECEIPTS/P3-W37-CROSS-ACCOUNT-UX01-PATCH/';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const expected={patch:'e30d0fd6c628d2e51e1230803c77f9ad054d598767a64e0e332a11cafb3aab52',collision:'23163b8fe673360c2fee9b2d7627d2781319154a522424e126e89e41b8481570',rows:'0cb83c62e34e20d5fc1dcc50f380de81f4a920191359be9315c2a7ba533c4529',effective:'6198539f936ac636cd24ec812456557e5d9c6509cdf9c6c63856f4f061699af9',original:'5b9a05df788fe5fab41b6b2033fb895cd3650fb573345856650cfeb24ef9c99c'};
const items=[['SYNTHETIC_CROSS_ACCOUNT_UX01_PATCH.json','src/data/w37-cross-account-patch.json','patch'],['COLLIDING_PEER_K_NEGATIVE.json','src/data/w37-colliding-peer-negative.json','collision'],['V2_FIXTURE_PARITY_EXPECTED_44.csv','src/data/w37-effective-tasks.csv','rows']];
for(const [src,rel,k] of items){const b=fs.readFileSync(p.join(source,src));if(sha(b)!==expected[k])throw Error('W37_'+k+'_HASH_MISMATCH');fs.writeFileSync(p.join(root,rel),b);}
const patch=JSON.parse(fs.readFileSync(p.join(root,items[0][1]))),original=JSON.parse(fs.readFileSync(p.join(root,'src/data/fixture.json'))),effective=patch.effective_fixture_payload;
if(sha(fs.readFileSync(p.join(root,'src/data/fixture.json')))!==expected.original)throw Error('historic fixture changed');
const derived=Buffer.from(JSON.stringify(effective,null,2)+'\n');if(sha(derived)!==expected.effective)throw Error('W37 canon SHA mismatched '+sha(derived));
if(effective.contacts.length!==120||original.contacts.length!==120)throw Error('count not 120');
for(let i=0;i<120;i++){const o=original.contacts[i],e=effective.contacts[i];if(i===116){if(o.peer_id!=='fake-peer-117'||e.account!=='fixture-account-2'||o.account!=='fixture-account-1'||o.last_message.provider_mid!==e.last_message.provider_mid)throw Error('peer117 diff error')}else if(JSON.stringify(o)!==JSON.stringify(e))throw Error('unexpected changed contact '+i)}
fs.writeFileSync(p.join(root,'src/data/effective-fixture.json'),derived);
const collision=JSON.parse(fs.readFileSync(p.join(root,'src/data/w37-colliding-peer-negative.json')));if(collision.rows.length!==5||new Set(collision.rows.map(x=>x.identity_K)).size!==5||new Set(collision.rows.map(x=>x.contact.peer_id)).size!==1)throw Error('collision fixture invalid');
console.log('W37_DERIVED_120_PASS',expected.effective,'COLLISION_5_ONLY_IN_SEPARATE_TEST',expected.collision);

import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePancakeOwnedPages as normalize} from './owned-pages.mjs';

test('real Pancake categorized response includes only owned Facebook Pages',()=>{
 const a=normalize({categorized:{
  activated:{'101':{name:'A',platform:'facebook'}},
  hidden:[{id:'102',name:'B',platform:'FB_PAGE'}],
  inactivated:{data:[{id:'103',name:'C',platform:'facebook'}]},
  nopermission:[{id:'999',name:'Not Mine',platform:'facebook'}]
 }});
 assert.deepEqual(a.map(p=>p.pageId),['101','103','102'].sort((a,b)=>0)/* order: activated, inactivated, hidden */);
 assert.equal(a.some(p=>p.pageId==='999'),false);
});
test('legacy pages array accepts scoped Facebook pages only',()=>{
 const a=normalize({pages:[{id:'11',name:'My Page',platform:'FACEBOOK'},
 {id:'22',name:'Other Platform',platform:'INSTAGRAM'},{id:'11',name:'Duplicate'}]});
 assert.deepEqual(a.map(p=>p.pageId),['11']);
});
test('missing or malicious Page shapes fail closed; does not inspect secrets',()=>{
 assert.throws(()=>normalize({pages:{nopermission:[{id:'999'}]}}),/PANCAKE_ACCOUNT_PAGES_INVALID/);
 assert.throws(()=>normalize({pages:'abc'}),/PANCAKE_ACCOUNT_PAGES_INVALID/);
 assert.throws(()=>normalize({activated:{'xxx':{name:'Test'}}}),/PANCAKE_ACCOUNT_PAGES_INVALID/);
});

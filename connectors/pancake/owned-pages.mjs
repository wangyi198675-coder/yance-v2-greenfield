// Original W27 official Pancake User Page inventory shape normalization.
// Shared by the existing onboarding entry and the original W27 Page action.
// Never promote nopermission, another platform, an unverified Peer or sender.
const validId=value=>/^[0-9]{1,40}$/.test(String(value));
const groups=['activated','inactivated','hidden'];
const fail=()=>Object.assign(new Error('PANCAKE_ACCOUNT_PAGES_INVALID'),
  {code:'PANCAKE_ACCOUNT_PAGES_INVALID',status:502});
function records(value,depth=0){
 if(depth>5)return null;
 if(value===null)return [];
 if(Array.isArray(value))return value;
 if(!value||typeof value!=='object')return null;
 if(validId(value.id??''))return [value];
 for(const key of ['data','pages','items','list','results']){
  if(Object.hasOwn(value,key))return records(value[key],depth+1);
 }
 const pairs=Object.entries(value);
 if(!pairs.length)return [];
 if(pairs.length>500||pairs.some(([key,p])=>
  !validId(key)||!p||typeof p!=='object'||Array.isArray(p)))return null;
 return pairs.map(([id,p])=>({...p,id:p.id??id}));
}
export function normalizePancakeOwnedPages(reply,{onInvalidSchema}={}){
 const options=[
  reply?.pages,reply?.categorized,reply?.page_list,
  reply?.data?.pages,reply?.data?.categorized,reply?.data?.page_list,
  reply?.result?.pages,reply?.result?.categorized,reply?.result?.page_list,
  reply?.payload?.pages,reply?.payload?.categorized,reply
 ];
 const raw=options.find(x=>Array.isArray(x)||
  x&&typeof x==='object'&&groups.some(k=>Object.hasOwn(x,k)));
 const invalid=()=>{
  // Opt-in structural diagnostics only; caller may log this fixed DTO.
  if(typeof onInvalidSchema==='function'){
   const type=x=>Array.isArray(x)?'array':x===null?'null':typeof x;
   onInvalidSchema({hasPages:reply?.pages!==undefined,
    hasData:reply?.data!==undefined,
    hasCategorized:reply?.categorized!==undefined,pagesKind:type(raw),
    groups:groups.map(k=>[k,type(raw?.[k])])});
  }
  throw fail();
 };
 let pageRows;
 if(Array.isArray(raw))pageRows=raw;
 else if(raw&&typeof raw==='object'){
  const collections=groups.filter(k=>Object.hasOwn(raw,k)).map(k=>records(raw[k]));
  if(!collections.length||collections.some(x=>!Array.isArray(x)))invalid();
  pageRows=collections.flat();
 }else invalid();
 if(pageRows.length>500)invalid();
 const out=[],seen=new Set();
 for(const p of pageRows){
  const id=String(p?.id??'');
  if(!validId(id)||seen.has(id))continue;
  const platform=String(p?.platform??'').toUpperCase();
  if(platform&&!['FACEBOOK','FB_PAGE','FACEBOOK_PAGE'].includes(platform))continue;
  seen.add(id);
  out.push(Object.freeze({pageId:id,
   name:typeof p?.name==='string'?p.name.slice(0,180):'Facebook Page',
   platform:'FB_PAGE'}));
 }
 return Object.freeze(out);
}

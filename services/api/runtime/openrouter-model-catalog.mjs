// W47: original OpenRouter public model discovery only.
// Does NOT send user credentials, create chat completions or assert account quota.
// Actual paid execution remains original W55->W43 with explicit authorization.
const ENDPOINT='https://openrouter.ai/api/v1/models';
const VALID=/^[A-Za-z0-9][A-Za-z0-9._:/-]{1,127}$/;
const finitePrice=x=>typeof x==='string'&&/^\d+(?:\.\d+)?$/.test(x)&&x.length<30?x:null;
const pageLimit=1000,totalLimit=3000,ttlMs=180_000;
function validRecord(x){
 return x&&typeof x==='object'&&VALID.test(x.id)&&typeof x.name==='string'&&
  x.name.length<220&&Array.isArray(x.architecture?.output_modalities)&&
  x.architecture.output_modalities.includes('text') &&
  Array.isArray(x.architecture.input_modalities)&&x.architecture.input_modalities.includes('text');
}
export function createOpenRouterModelCatalog({fetchImpl=globalThis.fetch,clock=()=>Date.now()}={}){
 if(typeof fetchImpl!=='function')throw Error('OPENROUTER_FETCH_REQUIRED');
 let last=0,cache=null,pending=null;
 async function discover(){
  const discovered=new Map();
  for(let offset=0;offset<totalLimit;offset+=pageLimit){
   const url=ENDPOINT+'?output_modalities=text&limit='+pageLimit+'&offset='+offset;
   const response=await fetchImpl(url,{method:'GET',redirect:'error',cache:'no-store',
     headers:{accept:'application/json'},signal:AbortSignal.timeout(10000)});
   if(!response?.ok||!String(response.headers?.get('content-type')||'').includes('json'))
    throw Error('OPENROUTER_CATALOG_UNAVAILABLE');
   const doc=await response.json();
   if(!Array.isArray(doc?.data)||doc.data.length>pageLimit)
    throw Error('OPENROUTER_CATALOG_FORMAT_INVALID');
   for(const row of doc.data){
    if(!validRecord(row)||discovered.has(row.id))continue;
    discovered.set(row.id,Object.freeze({
      provider:'OPENROUTER_USER_API',modelId:row.id,
      name:row.name.slice(0,120),configured:true,available:true,
      origin:'OPENROUTER_PUBLIC_CATALOG',
      runtimeAvailability:'UNVERIFIED_UNTIL_ACTUAL_W43_RUN',
      pricing:{prompt:finitePrice(row.pricing?.prompt),
        completion:finitePrice(row.pricing?.completion)},
      capabilities:{
        text:true,vision:row.architecture.input_modalities.includes('image'),
        toolCalling:Array.isArray(row.supported_parameters)&&row.supported_parameters.includes('tools')
      }
    }));
   }
   if(doc.data.length<pageLimit)break;
  }
  if(discovered.size===0)throw Error('OPENROUTER_CATALOG_EMPTY_OR_UNAVAILABLE');
  return [...discovered.values()].sort((a,b)=>a.name.localeCompare(b.name));
 }
 const all=async()=>{
  if(cache&&clock()-last<ttlMs)return cache;
  if(!pending)pending=discover().then(x=>{cache=x;last=clock();return x}).finally(()=>{pending=null});
  return pending;
 };
 const list=async({query='',offset=0,limit=60}={})=>{
  if(typeof query!=='string'||query.length>96||
   !Number.isSafeInteger(offset)||offset<0||offset>3000||
   !Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('OPENROUTER_CATALOG_QUERY_INVALID');
  const records=await all();
  const q=query.trim().toLocaleLowerCase();
  const matches=q?records.filter(x=>x.name.toLocaleLowerCase().includes(q)||x.modelId.toLocaleLowerCase().includes(q)):records;
  return {provider:'OPENROUTER_USER_API',total:matches.length,offset,
   models:matches.slice(offset,offset+limit)};
 };
 const contains=async id=>{
  if(!VALID.test(id))return false;
  return (await all()).some(m=>m.modelId===id);
 };
 return Object.freeze({list,contains,all});
}

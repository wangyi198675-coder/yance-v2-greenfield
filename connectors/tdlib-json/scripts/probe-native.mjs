// Nonproduction native offline TDLib ABI proof; never creates a client account.
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {probeTDJson} from '../src/native-tdjson.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..','runtime');
try{
  const receipt=await probeTDJson(root);
  console.log(JSON.stringify({status:'OFFICIAL_TDJSON_NATIVE_ABI_PASS',...receipt}));
}catch(e){
  console.error(JSON.stringify({status:'OFFICIAL_TDJSON_NATIVE_ABI_HOLD',code:e.code||'UNKNOWN_NATIVE_FAILURE'}));
  process.exitCode=1;
}

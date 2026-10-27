import test from 'node:test';import assert from 'node:assert/strict';
import {createOpenRouterModelCatalog} from './openrouter-model-catalog.mjs';
const sample=(id,name,mod=['text'])=>({id,name,architecture:{input_modalities:['text'],output_modalities:mod},
 pricing:{prompt:'0.000003',completion:'0.000006'},supported_parameters:['tools']});
test('official OpenRouter catalog only GET read, normalize live canonical IDs and capabilities',async()=>{
 const requests=[];
 const api=createOpenRouterModelCatalog({fetchImpl:async(url,opt)=>{
  requests.push({url,opt});
  return {ok:true,headers:{get:()=> 'application/json'},json:async()=>({data:[
   sample('anthropic/claude-example','Claude test'),sample('openai/model-example','OpenAI test'),
   sample('fake/visual-only','image model',['image'])
  ]})};
 }});
 const one=await api.list({query:'claude'});
 assert.equal(one.total,1);assert.equal(one.models[0].modelId,'anthropic/claude-example');
 assert.equal(one.models[0].capabilities.toolCalling,true);
 assert.equal(one.models[0].pricing.prompt,'0.000003');
 assert.equal(await api.contains('openai/model-example'),true);
 assert.equal(await api.contains('unknown/model'),false);
 assert.equal(requests.length,1);
 assert.equal(requests[0].opt.method,'GET');
 assert.equal(requests[0].opt.headers.authorization,undefined);
});
test('catalog unavailable or malicious malformed data cannot become selected option',async()=>{
 const api=createOpenRouterModelCatalog({fetchImpl:async()=>({ok:false})});
 await assert.rejects(api.all());
 const bad=createOpenRouterModelCatalog({fetchImpl:async()=>({ok:true,headers:{get:()=> 'application/json'},json:async()=>({data:[
  sample('invalid model name','bad'),sample('a/b','valid')
 ]})})});
 const r=await bad.list();assert.equal(r.total,1);assert.equal(r.models[0].modelId,'a/b');
 await assert.rejects(bad.list({query:'a'.repeat(97)}));
});

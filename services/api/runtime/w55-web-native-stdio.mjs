// W47 thin private stdio client to W55's ORIGINAL native WinCred host.
// The W55 Owner implements "stdio-v1" using its existing NativeKeyCustody.
// No key in argv, URL, browser result, localStorage or Node disk.
import {spawn} from 'node:child_process';
import {isAbsolute} from 'node:path';
import {lstatSync} from 'node:fs';
const MAX=16*1024;
export function createW55WebNativeStdioPort({executable,timeoutMs=12000}={}){
 if(typeof executable!=='string'||!isAbsolute(executable)||
  executable.includes('..')||!lstatSync(executable).isFile()||
  lstatSync(executable).isSymbolicLink()||
  !Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>30000)
  throw Error('W55_ORIGINAL_WIN_CRED_WEB_NATIVE_EXE_REQUIRED');
 const call=message=>new Promise((resolve,reject)=>{
  const child=spawn(executable,[],{
   windowsHide:true,shell:false,stdio:['pipe','pipe','ignore']
  });
  let done=false,data='';
  const finish=(e,result)=>{
   if(done)return;done=true;clearTimeout(timer);
   child.stdout.destroy();child.stdin.destroy();
   if(child.exitCode===null)child.kill();
   e?reject(e):resolve(result);
  };
  const timer=setTimeout(()=>finish({code:'UNAVAILABLE'}),timeoutMs);
  child.on('error',()=>finish({code:'UNAVAILABLE'}));
  child.stdout.on('data',bytes=>{
   data+=bytes.toString('utf8');
   if(data.length>MAX){finish({code:'UNAVAILABLE'});return}
   const newline=data.indexOf('\n');
   if(newline===-1)return;
   let r;try{r=JSON.parse(data.slice(0,newline))}catch{
    finish({code:'UNAVAILABLE'});return
   }
   if(!r||r.ok!==true){
    finish({code:'UNAVAILABLE'});return
   }
   finish(null,r);
  });
  child.on('exit',()=>finish({code:'UNAVAILABLE'}));
  // W55 native host decides its own current-Windows-user WinCred scope;
  // never accept a browser-supplied SID, vault target or storage path.
  child.stdin.end(JSON.stringify(message)+'\n');
 });
 return Object.freeze({
  withPancake:async({expectedRevision},using)=>{
   if(typeof using!=='function'||!Number.isSafeInteger(expectedRevision)||
      expectedRevision<1)throw {code:'UNAVAILABLE'};
   const r=await call({op:'lease_for_pancake',provider:'PANCAKE_PAIR',expectedRevision});
   if(typeof r.privateKey!=='string'||r.privateKey.length>2000||
      r.privateKey.length<35)throw {code:'UNAVAILABLE'};
   let value;try{value=JSON.parse(r.privateKey)}catch{throw {code:'UNAVAILABLE'}}
   if(!value||typeof value.userAccessToken!=='string'||
      !value.pages||typeof value.pages!=='object')throw {code:'UNAVAILABLE'};
   // Never serialize this callback's token-bearing argument to a Web response.
   return using(value);
  },
  status:async({provider})=>{
   const r=await call({op:'status',provider});
   return r;
  },
  store:async({provider,secret,expectedRevision})=>{
   const r=await call({op:'store',provider,secret,
    expectedRevision});
   return r;
  },
  revoke:async({provider,expectedRevision})=>{
   const r=await call({op:'revoke',provider,expectedRevision});
   return r;
  },
  withSecret:async({provider,expectedRevision,modelId,selectionEpoch},using)=>{
   if(typeof using!=='function')throw {code:'UNAVAILABLE'};
   // W55 may release a transient Key only with its native OS-user check.
   // Key is consumed synchronously by existing W43 Python private executor.
   const r=await call({op:'lease_for_agno',provider,expectedRevision});
   if(typeof r.privateKey!=='string'||r.privateKey.length<16||
    r.privateKey.length>512)throw {code:'UNAVAILABLE'};
   return using(r.privateKey);
  }
 });
}

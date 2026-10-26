// W46 nonproduction R4 candidate shell: only existing W47 authoritative read routes.
// No login, W24/W44 mutations, Agno Run, W25 delivery, or local fixture success.
export const WORKSPACES=Object.freeze([
 Object.freeze({id:'CHAT',label:'聊天',section:'CONTACT',hint:'唯一 B+C CONTACT Composer'}),
 Object.freeze({id:'BRAIN',label:'闺蜜大脑',section:'SELF_PRIVATE',hint:'唯一 Agno，授权后才能执行'}),
 Object.freeze({id:'AUTOPILOT',label:'托管中心',section:'CUSTODY',hint:'授权、预算、撤销与回执'}),
 Object.freeze({id:'ACCOUNTS',label:'渠道账号',section:'CHANNELS',hint:'四渠道与多账号绑定'}),
 Object.freeze({id:'PEOPLE',label:'联系人',section:'PEOPLE',hint:'身份 K 与账户隔离'}),
 Object.freeze({id:'PERSONA',label:'人格',section:'PERSONA',hint:'版本、审批与学习控制'}),
 Object.freeze({id:'TASKS',label:'工具任务',section:'TOOLS',hint:'Agno Tools、Trace 与任务'}),
 Object.freeze({id:'MEDIA',label:'媒体',section:'MEDIA',hint:'图片、视频、音频与素材'}),
 Object.freeze({id:'SETTINGS',label:'设置诊断',section:'SYSTEM',hint:'权限、版本与连接诊断'})
]);
export const CHANNELS=Object.freeze([
 Object.freeze({id:'FB_PERSONAL',label:'Facebook'}),
 Object.freeze({id:'FB_PAGE',label:'Page'}),
 Object.freeze({id:'WHATSAPP_PERSONAL',label:'WhatsApp'}),
 Object.freeze({id:'TELEGRAM_PERSONAL',label:'Telegram'})
]);
export const CAPABILITY_KEYS=Object.freeze({
 BRAIN:'agentRuntime', AUTOPILOT:'managedStop', ACCOUNTS:'inbound',
 PEOPLE:'inbound', PERSONA:'agentRuntime', TASKS:'agentRuntime',
 MEDIA:'inbound', SETTINGS:'translation'
});
const fail=x=>{throw Error(x)};
export function validateWorkspaceSnapshot(health,capabilities,contacts){
 if(health?.ok!==true||health.service!=='Yance V2 local API'||
    typeof health.runtimeSha!=='string'||!health.runtimeSha||
    health.canSend!==false||health.externalEffects!==false||
    capabilities?.ok!==true||capabilities.authoritative!==true||
    capabilities.canSend!==false||!capabilities.capabilities||
    (contacts?.denied!==true&&
      (contacts?.ok!==true||contacts.authoritative!==true||
       contacts.canSend!==false||!Array.isArray(contacts.contacts)||
       !Number.isSafeInteger(contacts.connectedAccountCount))))
   fail('WORKSPACE_AUTHORITY_INVALID');
 if(health.trustedSession!==true && contacts.denied!==true && contacts.contacts.length)
   fail('UNAUTHENTICATED_CONTACT_LEAK');
 if(!Object.keys(CAPABILITY_KEYS).every(k=>
   typeof capabilities.capabilities[CAPABILITY_KEYS[k]]==='object'))
   fail('WORKSPACE_CAPABILITY_SCHEMA_INVALID');
 return Object.freeze({
   status:health.trustedSession===true?'AUTHENTICATED':'NOT_AUTHENTICATED',
   trustedSession:health.trustedSession===true,
   runtimeSha:health.runtimeSha,
   connectedAccountCount:contacts.denied===true?0:contacts.connectedAccountCount,
   realContacts:contacts.denied===true?0:contacts.contacts.length,
   contactsAccess:contacts.denied===true?'WAITING_USER_AUTH':'SIGNED_NATIVE_READ',
   canSend:false,
   capabilities:capabilities.capabilities,
   contacts:contacts.denied===true?[]:contacts.contacts
 });
}
const read=async(fetchImpl,path)=>{
 const response=await fetchImpl(path,{cache:'no-store',credentials:'same-origin',redirect:'error'});
 if(!response?.ok){
  if(path==='/api/v2/contacts'&&response?.status===401)
   return Object.freeze({denied:true,reason:'TRUSTED_LOCAL_SESSION_REQUIRED'});
  fail('WORKSPACE_HTTP_'+response?.status);
 }
 return response.json();
};
export async function readWorkspaceSnapshot({fetchImpl=globalThis.fetch}={}){
 if(typeof fetchImpl!=='function')fail('WORKSPACE_FETCH_MISSING');
 const [health,capabilities,contacts]=await Promise.all([
 read(fetchImpl,'/api/v2/runtime/health'),
 read(fetchImpl,'/api/v2/runtime/capabilities'),
 read(fetchImpl,'/api/v2/contacts')
 ]);
 return validateWorkspaceSnapshot(health,capabilities,contacts);
}
export const explainCapability=(snapshot,id)=>{
 if(id==='CHAT')return snapshot?.trustedSession?'就绪状态待联系人签署':'聊天平台尚未授权';
 if(!snapshot)return '服务端不可用，操作已禁用';
 const cap=snapshot.capabilities?.[CAPABILITY_KEYS[id]];
 if(!snapshot.trustedSession||snapshot.contactsAccess==='WAITING_USER_AUTH')return '当前平台未授权，等待可信本机会话与账号绑定';
 if(!cap)return '原生 Owner 接口尚未接入';
 if(cap.connected===true && cap.enabled===true)return '接口已连接，仍需独立权限核验';
 return cap.reason||'当前接口未连接，操作不可用';
};


// Exact R4 settings menu IDs from the signed HTML; actual rows stay disabled
// until W47 Owner installs an authenticated settings/authorization endpoint.
export const R4_SETTINGS_CATEGORIES=Object.freeze([
 Object.freeze({id:'general',label:'常规'}),
 Object.freeze({id:'accounts',label:'账号与授权'}),
 Object.freeze({id:'model',label:'模型 AI'}),
 Object.freeze({id:'translate',label:'翻译'}),
 Object.freeze({id:'media',label:'媒体'}),
 Object.freeze({id:'theme',label:'主题'}),
 Object.freeze({id:'notify',label:'通知'}),
 Object.freeze({id:'privacy',label:'隐私'}),
 Object.freeze({id:'diagnostics',label:'诊断'})
]);
export const R4_STOP_FAILURE_STATES=Object.freeze([
 Object.freeze({id:'REVOKED',label:'授权已撤销',effect:'禁止自动托管及消息发送',action:'重新授权与服务端权限回读'}),
 Object.freeze({id:'AUTH_EXPIRED',label:'授权已过期',effect:'旧凭据不能恢复自动托管',action:'完成新授权并校验有效期'}),
 Object.freeze({id:'BUDGET_INSUFFICIENT',label:'预算不足',effect:'冻结费用与正式模型调用',action:'重新确认费用预算，服务端回读才可恢复'})
]);

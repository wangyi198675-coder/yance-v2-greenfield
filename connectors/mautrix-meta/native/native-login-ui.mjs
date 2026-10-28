// W56 original product login view of upstream mautrix BridgeV2 LoginStep data.
// Never persists passwords, codes, native Matrix bearer or Facebook cookies.
const BASE='/api/v2/providers/fb-personal';
const byId=id=>document.getElementById(id);
const ticket=byId('ticket').value;
let handle=null,step=null,busy=false;
function element(tag,text='',className=''){
 const e=document.createElement(tag);
 if(text)e.textContent=text;
 if(className)e.className=className;
 return e;
}
function state(message){byId('status').textContent=message}
function error(message){byId('error').textContent=message||''}
function clear(node){node.replaceChildren()}
async function api(route,body={}){
 const r=await fetch(BASE+route,{method:'POST',redirect:'error',cache:'no-store',
  credentials:'omit',headers:{'Content-Type':'application/json','X-Yance-Native-Login-Ticket':ticket},
  body:JSON.stringify(body)});
 const value=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(value.error||'MESSENGER_LOGIN_UNAVAILABLE');
 return value;
}
const isAuthenticatorStep=s=>s?.type==='user_input'&&(
 /(?:six[- ]digit|authenticator|two[- ]factor|6\s*位|身份验证器)/i.test(s.instructions||'')||
 (s.fields||[]).some(f=>/^(?:2fa_code|two_factor_code|totp|authenticator_code)$/.test(f.id)));
const withBusy=async f=>{
 if(busy)return;busy=true;error('');
 try{await f()}catch(e){
  const code=String(e?.message||'');
  let message='Messenger 验证尚未完成。请检查输入内容；如果无法继续，可重新开始登录。';
  if(code==='LOGIN_PROCESS_EXPIRED_OR_MISSING'||code==='LOGIN_PROCESS_HANDLE_INVALID')
   message='本次验证会话已失效，请重新开始登录。';
  else if(code==='LOGIN_STEP_REJECTED_RESTART_REQUIRED')
   message='Messenger 拒绝了本次验证步骤，此次流程已结束。可能是验证码不匹配或登录状态变化；请先检查账号设置，不要连续重试。';
  else if(code==='LOGIN_RATE_LIMITED')
   message='Messenger 暂时限制了登录验证。请停止重复提交，稍后通过 Facebook 本身的安全设置确认验证方式。';
  else if(code==='UPSTREAM_LOGIN_TIMEOUT_STATUS_UNKNOWN')
   message='Messenger 验证响应超时，暂时无法判断验证码是否已被接受。请先确认账户登录状态，不要连续重试。';
  else if(code==='UPSTREAM_LOGIN_STEP_FAILED'||code==='UPSTREAM_LOGIN_NETWORK_UNAVAILABLE')
   message='Messenger 上游暂时未完成验证，本次状态无法确认，请不要重复提交相同验证码。';
  else if(isAuthenticatorStep(step))
   message='6 位动态验证码未完成验证。请核对账号、验证器及设备时间，避免重复尝试。';
  else if((step?.fields||[]).some(f=>f.optional===true&&/pin|recovery/i.test(f.id)))
   message='安全存储 PIN 只用于恢复加密聊天记录；如果不恢复历史，可留空继续。如仍失败，请重新开始登录。';
  error(message);
  if(code==='LOGIN_STEP_REJECTED_RESTART_REQUIRED'||code==='LOGIN_PROCESS_EXPIRED_OR_MISSING'||
     code==='LOGIN_RATE_LIMITED'||code==='LOGIN_PROCESS_HANDLE_INVALID')handle=null;
  byId('retry').textContent='重新开始登录';
  byId('retry').classList.remove('hidden');
 }
 finally{busy=false}
};
async function loadFlows(){
 await withBusy(async()=>{
  clear(byId('step'));clear(byId('flows'));handle=null;step=null;
  const info=await api('/native-login/flows');
  if(!Array.isArray(info.flows)||info.flows.length===0)throw Error('UPSTREAM_NO_FLOWS');
  state('准备连接 Facebook Messenger');
  const b=element('button','登录 Facebook Messenger');
  b.type='button';b.id='messenger-login';
  b.onclick=()=>withBusy(async()=>{
   state('正在打开 Messenger 登录…');
   const response=await api('/native-login/start');
   handle=response.handle;clear(byId('flows'));showStep(response.step);
  });
  byId('flows').append(b);
 });
 if(!byId('flows').children.length){state('Messenger 连接服务尚未准备好');byId('retry').classList.remove('hidden')}
}
function showStep(s){
 step=s;const target=byId('step');clear(target);
 if(!s||typeof s!=='object'){error('登录步骤不可用');return}
 const hasOptionalRecoveryPin=Array.isArray(s.fields)&&s.fields.some(f=>
   f.optional===true&&/pin|recovery|secure.storage/i.test([f.id,f.name].join(' ')));
 if(hasOptionalRecoveryPin)target.append(element('p',
   '安全存储 PIN 仅用于恢复已加密的聊天记录。不需要恢复历史时，可以留空直接继续。'));
 else if(isAuthenticatorStep(s))target.append(element('p',
   '请输入身份验证器 App 中当前显示的 6 位动态验证码。这是 Facebook 双重身份验证，不能使用聊天记录恢复 PIN，也不能留空跳过。'));
 else if(s.instructions)target.append(element('p',s.instructions));
 if(s.type==='complete'){
  state('Messenger 已完成原生登录，等待言策核验账号授权');
  target.append(element('p','登录步骤已完成。账号和联系人仍需通过言策现有授权验证，尚不能自动发送消息。'));
  return;
 }
 state('等待本人完成 Messenger 验证');
 if(s.type==='user_input'&&Array.isArray(s.fields)){
  const form=element('form');
  for(const f of s.fields){
   const friendly={username:'Facebook 账号（邮箱或手机号）',password:'密码',email:'邮箱',phone_number:'手机号',two_factor_code:'验证码','2fa_code':'验证码',code:'验证码'};
   const lab=element('label',isAuthenticatorStep(s)?'身份验证器 6 位动态验证码':(friendly[f.id]||f.name||f.id));
   const field=f.type==='select'?element('select'):element('input');
   field.name=f.id;field.required=true;
   if(field.tagName==='INPUT'){
    field.type=['password','2fa_code','token'].includes(f.type)?'password':
      f.type==='email'?'email':'text';field.autocomplete='off';
    if(isAuthenticatorStep(s)){field.inputMode='numeric';field.maxLength=6;field.pattern='[0-9]{6}';}
   }else for(const v of f.options||[]){
    const option=element('option',v);option.value=v;field.append(option);
   }
   field.required=f.optional!==true;
   if(f.optional===true)lab.append(element('small','可选，可留空继续'));
   lab.append(field);form.append(lab);
   if(f.description)form.append(element('small',f.description));
  }
  const submit=element('button',hasOptionalRecoveryPin?'继续（可跳过历史恢复）':'继续验证');submit.type='submit';form.append(submit);
  form.onsubmit=ev=>{
   ev.preventDefault();
   if(busy)return;
   const fields=Object.fromEntries(new FormData(form).entries());
   withBusy(async()=>{
     const result=await api('/native-login/step',{handle,fields});
     form.reset();handle=result.handle;showStep(result.step);
   });
  };
  target.append(form);return;
 }
 if(s.type==='display_and_wait'){
  if(s.displayData)target.append(element('p',s.displayData));
  const b=element('button','继续');
  b.onclick=()=>withBusy(async()=>{const result=await api('/native-login/step',{handle});
    handle=result.handle;showStep(result.step)});
  target.append(b);return;
 }
 target.append(element('p','此验证步骤需要上游原生客户端支持，当前无法安全继续。'));
 const retry=element('button','重新选择方式','secondary');retry.onclick=loadFlows;target.append(retry);
}
byId('retry').onclick=()=>{byId('retry').classList.add('hidden');loadFlows()};
loadFlows();

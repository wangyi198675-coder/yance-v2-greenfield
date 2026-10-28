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
const withBusy=async f=>{
 if(busy)return;busy=true;error('');
 try{await f()}catch{error('Messenger 连接暂时不可用，请重新尝试。本机内部技术设置无需填写。')}
 finally{busy=false}
};
async function loadFlows(){
 await withBusy(async()=>{
  clear(byId('step'));clear(byId('flows'));handle=null;step=null;
  const info=await api('/native-login/flows');
  if(!Array.isArray(info.flows)||info.flows.length===0)throw Error('UPSTREAM_NO_FLOWS');
  state('等待本人选择登录方式');
  const label=element('p','请选择 Messenger 登录方式：');
  byId('flows').append(label);
  for(const f of info.flows){
   const b=element('button',f.id==='messenger-lite-android'?'Messenger Android':'Messenger iPhone');
   b.type='button';b.onclick=()=>withBusy(async()=>{
    state('正在取得 Messenger 原生登录步骤…');
    const response=await api('/native-login/start',{flowId:f.id});
    handle=response.handle;clear(byId('flows'));showStep(response.step);
   });
   byId('flows').append(b);
  }
 });
 if(!byId('flows').children.length){state('Messenger 连接服务尚未准备好');byId('retry').classList.remove('hidden')}
}
function showStep(s){
 step=s;const target=byId('step');clear(target);
 if(!s||typeof s!=='object'){error('登录步骤不可用');return}
 if(s.instructions)target.append(element('p',s.instructions));
 if(s.type==='complete'){
  state('Messenger 已完成原生登录，等待言策核验账号授权');
  target.append(element('p','登录步骤已完成。账号和联系人仍需通过言策现有授权验证，尚不能自动发送消息。'));
  return;
 }
 state('等待本人完成 Messenger 验证');
 if(s.type==='user_input'&&Array.isArray(s.fields)){
  const form=element('form');
  for(const f of s.fields){
   const lab=element('label',f.name||f.id);
   const field=f.type==='select'?element('select'):element('input');
   field.name=f.id;field.required=true;
   if(field.tagName==='INPUT'){
    field.type=['password','2fa_code','token'].includes(f.type)?'password':
      f.type==='email'?'email':'text';field.autocomplete='off';
   }else for(const v of f.options||[]){
    const option=element('option',v);option.value=v;field.append(option);
   }
   lab.append(field);form.append(lab);
   if(f.description)form.append(element('small',f.description));
  }
  const submit=element('button','继续验证');submit.type='submit';form.append(submit);
  form.onsubmit=ev=>{
   ev.preventDefault();
   const fields=Object.fromEntries(new FormData(form).entries());
   form.reset();
   withBusy(async()=>{const result=await api('/native-login/step',{handle,fields});
     handle=result.handle;showStep(result.step)});
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

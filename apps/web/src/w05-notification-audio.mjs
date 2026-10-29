// W05 notification sound supplement. Device-level playback controls ONLY.
// It does not replace the original W05 user_notification_settings row or grant
// notification/provider/recipient authority. No sound is played on import.
const KEY='yance.w05.notification-audio.v1';
const DEFAULT=Object.freeze({enabled:true,volume:65});
const validVolume=v=>Number.isInteger(v)&&v>=0&&v<=100;
const clean=x=>x&&typeof x==='object'&&typeof x.enabled==='boolean'&&validVolume(x.volume)?
 {enabled:x.enabled,volume:x.volume}:null;
export function readW05AudioPreference({storage=globalThis.localStorage}={}){
 try{return clean(JSON.parse(storage.getItem(KEY)))||{...DEFAULT}}
 catch{return {...DEFAULT}}
}
export function writeW05AudioPreference(next,{storage=globalThis.localStorage}={}){
 const p=clean(next);
 if(!p||!storage||typeof storage.setItem!=='function')return false;
 try{storage.setItem(KEY,JSON.stringify(p));
  return JSON.stringify(readW05AudioPreference({storage}))===JSON.stringify(p);
 }catch{return false}
}
let lastPlay=-Infinity;
export async function playW05DoubleTone({
 preference=readW05AudioPreference(),AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext,
 now=()=>Date.now(),cooldownMs=240
}={}){
 const p=clean(preference);
 if(!p)return {played:false,reason:'INVALID_PREFERENCE'};
 if(!p.enabled||p.volume===0)return {played:false,reason:'MUTED'};
 if(typeof AudioContext!=='function')return {played:false,reason:'AUDIO_UNAVAILABLE'};
 const current=now();
 if(current-lastPlay<cooldownMs)return {played:false,reason:'THROTTLED'};
 let ctx;
 try{
  ctx=new AudioContext();
  if(ctx.state==='suspended'&&typeof ctx.resume==='function')await ctx.resume();
  if(ctx.state==='suspended'){await ctx.close?.();return {played:false,reason:'AUDIO_BLOCKED'}}
  const amplitude=(p.volume/100)*0.16; // bounded peak, never amplify above 16%
  const start=ctx.currentTime+0.012;
  for(const [i,freq] of [740,990].entries()){
   const osc=ctx.createOscillator(),gain=ctx.createGain(),t=start+i*0.16;
   osc.type='sine';osc.frequency.setValueAtTime(freq,t);
   gain.gain.setValueAtTime(0,t);
   gain.gain.linearRampToValueAtTime(amplitude,t+0.014);
   gain.gain.exponentialRampToValueAtTime(0.0001,t+0.115);
   osc.connect(gain);gain.connect(ctx.destination);
   osc.start(t);osc.stop(t+0.125);
  }
  lastPlay=current;
  // Let the short scheduled sounds finish before closing.
  if(typeof setTimeout==='function')setTimeout(()=>{void ctx.close?.().catch?.(()=>{})},500);
  return {played:true,scheduled:true,peakGain:amplitude,volume:p.volume};
 }catch{
  try{await ctx?.close?.()}catch{}
  return {played:false,reason:'AUDIO_FAILED'};
 }
}

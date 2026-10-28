const fs=require('node:fs'),p=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=__dirname,dir=p.join(root,'evidence','chrome'),chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';fs.mkdirSync(dir,{recursive:true});
const arms=['CHAT-A-V25_VISUAL_NORMALIZED','CHAT-B-ADAPTIVE_INBOX','CHAT-C-PULSE_MAIN','CHAT-BC-FUSION'];
const modes=['dark','light'],themes=['Obsidian Lime','Cosmic Sunset','Ocean Electric','Amber Ember','Opal Prism'];
const widths=[360,430,720,920,950,1050,1100,1101,1360];let cases=[];
for(let i=0;i<arms.length;i++)cases.push({file:'arm-'+['A','B','C','BC'][i]+'-1360.png',width:1360,height:900,params:{arm:arms[i],pulse:arms[i]==='CHAT-BC-FUSION'?'1':'0'}});
for(let i=0;i<themes.length;i++)for(const mode of modes)cases.push({file:'theme-'+(i+1)+'-'+mode+'-950.png',width:950,height:620,params:{arm:arms[1],theme:themes[i],mode}});
for(const width of widths)cases.push({file:'viewport-BC-'+width+'.png',width,height:width<550?850:width<900?780:850,params:{arm:arms[3],pulse:'1'}});
const rows=[];for(let i=0;i<cases.length;i++){
 const t=cases[i],url='http://127.0.0.1:4174/?'+new URLSearchParams(t.params).toString(),output=p.join(dir,t.file),userData=p.join(root,'test-output','screenshot-profile');
 const args=['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--no-default-browser-check','--disable-extensions','--user-data-dir='+userData,'--hide-scrollbars','--window-size='+t.width+','+t.height,'--screenshot='+output,url];
 const res=spawnSync(chrome,args,{timeout:25000,encoding:'utf8'});
 if(res.status!==0||!fs.existsSync(output))throw Error('Chrome screenshot failure '+t.file+' '+String(res.stderr||'').slice(0,400));
 const b=fs.readFileSync(output);if(b.length<500||b.subarray(0,4).toString('hex')!=='89504e47')throw Error('empty PNG '+t.file);
 rows.push({file:'evidence/chrome/'+t.file,url,width:t.width,height:t.height,pngRealWidth:b.readUInt32BE(16),pngRealHeight:b.readUInt32BE(20),sha256:crypto.createHash('sha256').update(b).digest('hex'),bytes:b.length,chromeStatus:'SCREENSHOT_CAPTURED_NOT_INDEPENDENT_QA'});
 console.log((i+1)+'/'+cases.length,t.file,b.length)
}
fs.writeFileSync(p.join(root,'evidence','CHROME_SCREENSHOT_MATRIX.json'),JSON.stringify({device:'DESKTOP-029FH47',browser:'Chrome Headless',localOnly:true,source:'127.0.0.1:4174 preview',screenshots:rows},null,2));
console.log('CHROME_SCREENSHOTS='+rows.length);

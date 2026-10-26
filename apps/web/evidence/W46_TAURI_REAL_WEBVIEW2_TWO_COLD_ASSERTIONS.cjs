'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=__dirname;
const read=x=>JSON.parse(fs.readFileSync(path.join(base,x),'utf8'));
const first=read('W46_REAL_INSTALLED_WEBVIEW2_COLD_1.json');
const second=read('W46_REAL_INSTALLED_WEBVIEW2_UAT.json');
for(const [name,x] of [['cold1',first],['cold2',second]]){
 assert.equal(x.type,'REAL_INSTALLED_TAURI_WEBVIEW2');
 assert.equal(x.entry,'http://tauri.localhost/');
 assert.equal(x.first.appRoot,1);
 assert.equal(x.first.nativeProduct,1);
 assert.equal(x.first.uniqueChat,1);
 assert.equal(x.first.frozenContacts,0);
 assert.equal(x.accounts.nativeProviderControls,4);
 assert.equal(x.setup.qrCount,0);
 assert.equal(x.brain.trueBrain,1);
 assert.equal(x.brain.brainSendDisabled,true);
 assert.equal(x.back.uniqueChat,1);
 assert.equal(x.nativeStatus.nativeOsVerified,true);
 assert.equal(x.nativeStatus.nativeSessionActive,true);
 assert.equal(x.nativeStatus.serverTrusted,false);
 assert.equal(x.nativeStatus.canSend,false);
 const blocked=x.jsEvents.filter(e=>/Content Security Policy|ipc\.localhost|LOOPBACK_ONLY|Refused to connect/i.test(e.content));
 assert.equal(blocked.length,0,name+' native CSP/loopback errors: '+JSON.stringify(blocked).slice(0,1000));
 console.log(name+' WEBVIEW2_PASS root=1 accounts=4 brain=1 returnCHAT=1 no_IPC_CSP=1 errorsRecorded='+x.jsEvents.length+' pid='+x.spawnedInstalledPid);
}
assert.notEqual(first.spawnedInstalledPid,second.spawnedInstalledPid);
fs.copyFileSync(path.join(base,'W46_REAL_INSTALLED_WEBVIEW2_UAT.json'),path.join(base,'W46_REAL_INSTALLED_WEBVIEW2_COLD_2.json'));
for(const name of ['570_CHROMELESS','ACCOUNTS','BRAIN']){
 const src=path.join(base,'W46_REAL_INSTALLED_WEBVIEW2_'+name+'.png');
 assert.ok(fs.statSync(src).size>1000,name+' screenshot');
 fs.copyFileSync(src,path.join(base,'W46_REAL_INSTALLED_WEBVIEW2_COLD_2_'+name+'.png'));
}
console.log('W46_INSTALLED_WEBVIEW2_COLD_START_GATE_2_OF_2_PASS');

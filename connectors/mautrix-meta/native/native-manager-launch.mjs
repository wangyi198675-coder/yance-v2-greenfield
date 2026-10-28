/**
 * W26 Windows-only, explicitly clicked process opener for the genuine upstream
 * mautrix-manager GUI. No Meta protocol, no credential or Matrix account access.
 * This is a fixed official executable location, never from caller input.
 */
import {spawn,execFile} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
const execAsync=promisify(execFile);
const SCRIPT=join(dirname(fileURLToPath(import.meta.url)),'focus-manager.ps1');
export function officialManagerExecutable() {
  if(process.platform!=='win32')return null;
  const root=process.env.LOCALAPPDATA;
  if(!root)return null;
  const app=join(root,'mautrix_manager','app-0.2.1','mautrix-manager.exe');
  return existsSync(app)?app:null;
}
export async function launchInstalledOfficialManager() {
  const executable=officialManagerExecutable();
  if(!executable)throw Error('OFFICIAL_MAUTRIX_MANAGER_NOT_INSTALLED');
  // Official manager already has an isolated localhost Matrix principal and
  // this machine's original BridgeV2 in its own profile. No technical login UI.
  const userHome=process.env.USERPROFILE;
  if(!userHome)throw Error('WINDOWS_USER_PROFILE_REQUIRED');
  const profile=join(userHome,'Documents','YanceV2','W56_MANAGER_FB_PERSONAL_PROFILE');
  if(!existsSync(profile))throw Error('OFFICIAL_MANAGER_PROFILE_NOT_INITIALIZED');
  await new Promise((resolve,reject)=>{
    const child=spawn(executable,['--user-data-dir='+profile],
      {detached:true,windowsHide:false,stdio:'ignore'});
    child.once('error',reject);
    child.once('spawn',()=>{child.unref();resolve();});
  });
  const {stdout}=await execAsync('powershell.exe',
    ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',SCRIPT],
    {windowsHide:true,timeout:8500,maxBuffer:4096});
  const foregroundVerified=stdout.includes('OFFICIAL_MANAGER_FOREGROUND_VERIFIED');
  if(!foregroundVerified&&!stdout.includes('OFFICIAL_MANAGER_RUNNING_BACKGROUND'))
    throw Error('OFFICIAL_MANAGER_GUI_NOT_VERIFIED');
  return {launched:true,foregroundVerified,app:'OFFICIAL_MAUTRIX_MANAGER',
    facebookAuthorized:false,canSend:false};
}

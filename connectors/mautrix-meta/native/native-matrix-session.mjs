// W56: read-only access to the Windows OS DPAPI-protected local Matrix
// technical session. No credentials enter the browser, URL, console or Git.
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ProviderAuthDenied} from './provisioning-auth.mjs';
const PS=fileURLToPath(new URL('./read-protected-matrix-session.ps1',import.meta.url));
const MXID='@w56_internal_fb_bridge:yance-w26.invalid';
export async function getProtectedNativeMatrixSession(){
  if(process.platform!=='win32'||!process.env.LOCALAPPDATA)
    throw new ProviderAuthDenied('WINDOWS_NATIVE_SESSION_NOT_AVAILABLE',503);
  const path=join(process.env.LOCALAPPDATA,'YanceV2','FBPersonal','internal','w56-matrix-session.dpapi');
  if(!existsSync(path))throw new ProviderAuthDenied('MATRIX_TECH_SESSION_NOT_INITIALIZED',503);
  let response;
  try{
    const output=execFileSync('powershell.exe',['-NoProfile','-NonInteractive',
      '-ExecutionPolicy','RemoteSigned','-File',PS],{
      encoding:'utf8',timeout:5000,maxBuffer:8192,stdio:['ignore','pipe','ignore'],
      windowsHide:true});
    response=JSON.parse(output.trim());
  }catch{throw new ProviderAuthDenied('MATRIX_TECH_SESSION_UNSEAL_FAILED',503)}
  if(response?.user_id!==MXID||typeof response.access_token!=='string'||
    !response.access_token||response.access_token.length>4096)
    throw new ProviderAuthDenied('MATRIX_TECH_SESSION_INVALID',503);
  return {principal:response.user_id,token:response.access_token};
}

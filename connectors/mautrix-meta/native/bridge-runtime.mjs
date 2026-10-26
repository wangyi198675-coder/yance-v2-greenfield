/**
 * W26 real upstream mautrix-meta v26.10 process discovery. Windows-only thin
 * adapter to an isolated WSL2 installation, NO Meta protocol client.
 * Does not read bridge configuration, AS tokens, credentials, SQLite, messages,
 * or logs. No login, send, login-retry, W24/W25 bypass or synthetic contacts.
 */
import {execFileSync} from 'node:child_process';
import {connect} from 'node:net';
const DISTRO = 'YANCE_W26_MAUTRIX';
const BINARY = '/opt/yance/mautrix-meta/bin/mautrix-meta';
const EXPECTED_COMMIT = '3c16226686c71af64df294df0803791685064e0b';
const EXPECTED_SHA256 = '17b8fd89ee8bb71796b9406aad37fd871110efbb22ace26801034dab9c5a3843';
export const OFFICIAL = Object.freeze({
  name: 'mautrix-meta',
  release: 'v0.2610.0',
  version: 'v26.10',
  upstreamCommit: EXPECTED_COMMIT,
  binarySha256: EXPECTED_SHA256,
  license: 'AGPL-3.0 (legal review required; exceptions not granted to YANCE)',
});
function linux(script) {
  return execFileSync('wsl.exe',['-d',DISTRO,'--exec','/bin/sh','-c',script],
    {encoding:'utf8',timeout:10000,windowsHide:true,maxBuffer:1024*128}).trim();
}
function portOpen(port) {
  return new Promise(resolve => {
    const socket=connect({host:'127.0.0.1',port});
    let done=false;
    const finish=x=>{if(!done){done=true;socket.destroy();resolve(x)}};
    socket.setTimeout(700);
    socket.once('connect',()=>finish(true));
    socket.once('error',()=>finish(false));
    socket.once('timeout',()=>finish(false));
  });
}
async function inspectMatrixService() {
  let realMatrixServer = null, bridgeBotProfileVerified = false;
  try {
    const options = {signal:AbortSignal.timeout(1800),redirect:'error'};
    const versions=await fetch('http://127.0.0.1:28438/_matrix/client/versions',options);
    const data=versions.ok ? await versions.json() : null;
    if(Array.isArray(data?.versions)) {
      realMatrixServer=data?.['net.zemos.msc4383.server']?.name??'MATRIX_SERVER_UNIDENTIFIED';
      const profile=await fetch('http://127.0.0.1:28438/_matrix/client/v3/profile/%40facebookbot%3Ayance-w26.invalid/displayname',options);
      const details=profile.ok?await profile.json():null;
      bridgeBotProfileVerified=details?.displayname==='Facebook Messenger bridge bot';
    }
  }catch { /* Normal: WSL, homeserver or appservice not ready. */ }
  return {realMatrixServer,bridgeBotProfileVerified};
}
export async function inspectRealBridge() {
  let version=null,pid=null,binaryIntegrity='UNAVAILABLE',runtimeError=null;
  try {
    const output=linux(`test -x ${BINARY} || exit 31; ${BINARY} --version-json; sha256sum ${BINARY}; pidof mautrix-meta 2>/dev/null || true`);
    const lines=output.split(/\r?\n/);
    version=JSON.parse(lines[0]);
    const match=lines[1]?.match(/^([0-9a-f]{64})\s/);
    binaryIntegrity=match?.[1]===EXPECTED_SHA256 && version.Commit===EXPECTED_COMMIT
      ? 'OFFICIAL_SHA_VERIFIED' : 'UNTRUSTED_SHA_MISMATCH';
    const maybePid=lines[2]?.match(/^\d+(?:\s+\d+)*$/);
    pid=maybePid?Number(maybePid[0].split(/\s+/)[0]):null;
  } catch(err) { runtimeError=String(err?.code??err?.message??'WSL_UNAVAILABLE').slice(0,140); }
  const listener = pid && binaryIntegrity==='OFFICIAL_SHA_VERIFIED' ? await portOpen(29319):false;
  const homeserver = await portOpen(28438);
  const matrix=homeserver?await inspectMatrixService():{realMatrixServer:null,bridgeBotProfileVerified:false};
  const verifiedProcess=Boolean(pid && listener && binaryIntegrity==='OFFICIAL_SHA_VERIFIED');
  return Object.freeze({
    channel:'FB_PERSONAL', provider:'mautrix-meta', source:'REAL_OFFICIAL_BINARY',
    upstream:OFFICIAL, binaryIntegrity, runtimeVersion:version?.FormattedVersion??null,
    runtimeCommit:version?.Commit??null, wslDistribution:DISTRO,
    bridgePid:pid, bridgeListenerTcp:listener, homeserverTcp:homeserver,
    matrixServer:matrix.realMatrixServer, bridgeBotProfileVerified:matrix.bridgeBotProfileVerified,
    bridgeState:verifiedProcess?(matrix.bridgeBotProfileVerified?'RUNNING_OFFICIAL_APP_SERVICE_REGISTERED':
      homeserver?'RUNNING_HOMESERVER_PORT_REACHABLE_UNVERIFIED':'RUNNING_WAITING_HOMESERVER'):'NOT_READY',
    realAccountState:'WAITING_USER_AUTH', accountIdentityVerified:false,
    accountCount:null, realContacts:null, realProviderMID:null,
    canSend:false, autoReply:false,
    reason:!verifiedProcess?'OFFICIAL_BRIDGE_NOT_RUNNING_OR_UNVERIFIED'
      :!homeserver?'MATRIX_HOMESERVER_REQUIRED':'REAL_META_USER_AUTH_AND_W24_BINDING_REQUIRED',
    runtimeError,
  });
}
export function assertNoRealAccountElevation(status) {
  if(status.canSend || status.autoReply || status.accountIdentityVerified ||
    status.realContacts!==null || status.realProviderMID!==null)
    throw new Error('REAL_ACCOUNT_CANNOT_BE_ASSERTED_FROM_PROCESS_STATUS');
  return true;
}

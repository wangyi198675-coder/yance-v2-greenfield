// Real npm-installed Baileys native SDK startup: NO SOCKET or user account.
import {createRequire} from 'node:module';
import makeWASocket, {DisconnectReason,initAuthCreds,jidNormalizedUser} from 'baileys';
import QRCode from 'qrcode';
import {createNativeBaileysWorker,NATIVE_BAILEYS} from './native-worker.mjs';
const require=createRequire(import.meta.url);
const pkg=require('./package.json'),lock=require('./package-lock.json');
if(typeof makeWASocket!=='function'||typeof initAuthCreds!=='function'||
 typeof jidNormalizedUser!=='function'||typeof QRCode.toDataURL!=='function'||
 typeof DisconnectReason.loggedOut!=='number'||typeof createNativeBaileysWorker!=='function'||
 lock.packages['node_modules/baileys'].version!==pkg.dependencies.baileys)process.exitCode=4;
const state=Object.freeze({pid:process.pid,provider:'BAILEYS_NATIVE',
 sdkVersion:NATIVE_BAILEYS.version,realSdkModuleLoaded:true,
 exactLock:lock.packages['node_modules/baileys'].integrity,
 realSocketOpened:false,realAccountConnected:false,contacts:0,realProviderAck:false,
 canSend:false,licenseGate:'HOLD',state:'WAITING_USER_AUTH'});
console.log(JSON.stringify(state));

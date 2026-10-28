// W28 adapter to W46's EXISTING Accounts UI. Official QR payload comes
// ONLY from a previously authorized live Baileys connection.update event.
import QRCode from 'qrcode';
const deny=c=>{throw Object.assign(new Error(c),{code:c})};
export function createBaileysPairingViewPort({assertAuthorizedLocalViewer,showImage,clearImage}={}){
  if(typeof assertAuthorizedLocalViewer!=='function'||typeof showImage!=='function'||
    typeof clearImage!=='function')deny('SIGNED_LOCAL_VIEW_PORT_REQUIRED');
  let generation=0,disposed=false;
  async function onQr({rawQr,generation:next,expiresAt}={}){
    if(disposed)deny('QR_VIEW_DISPOSED');
    if(typeof rawQr!=='string'||!rawQr.length||!Number.isSafeInteger(next)||
      !Number.isSafeInteger(expiresAt)||expiresAt<=Date.now())deny('QR_EXPIRED_OR_INVALID');
    const allowed=await assertAuthorizedLocalViewer({operation:'WHATSAPP_PAIRING_QR_VIEW'});
    if(allowed!==true||disposed)deny('LOCAL_VIEWER_NOT_AUTHORIZED');
    const imageDataUrl=await QRCode.toDataURL(rawQr,{errorCorrectionLevel:'M',margin:2,width:300});
    if(disposed||Date.now()>=expiresAt||next<generation)deny('QR_EXPIRED_OR_SUPERSEDED');
    generation=next;
    await showImage({imageDataUrl,expiresAt,generation:next});
    // Never retain QR token or dataURL after delivering to existing protected UI.
    return Object.freeze({shown:true,generation:next,expiresAt});
  }
  async function dispose(){
    disposed=true; generation++;await clearImage();
  }
  return Object.freeze({onQr,dispose});
}

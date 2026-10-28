// W47 original same-listener routing seam. Only genuine W54/W24/W55
// provisioned, process-private ports may start original W28 Baileys.
// Missing original port = 503. Never import QR/SDK dependencies on normal
// W47 startup when WhatsApp is not enrolled (PRIVATE remains independent).
export function createW47WhatsAppNativeRoute({
  createWorker,verifyNativeSession,resolveSignedNativeSession
}={}){
 if([createWorker,verifyNativeSession,resolveSignedNativeSession]
   .some(x=>typeof x!=='function'))return null;
 let handlerPromise=null;
 return async(req,res,url)=>{
  if(!handlerPromise)handlerPromise=Promise.all([
    import('../../../connectors/baileys/native-authorization-setup.mjs'),
    import('../../../connectors/baileys/native-authorization-http.mjs')
  ]).then(([setup,http])=>{
    const controller=setup.createBaileysNativeSetupController({createWorker,verifyNativeSession});
    return http.createBaileysNativeSetupHttpHandler({controller,resolveSignedNativeSession});
  });
  const handler=await handlerPromise;
  return handler(req,res,url);
 };
}

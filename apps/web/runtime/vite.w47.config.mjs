// W47 composition ONLY: preserve W46 original B+C renderer and unique Composer.
// Suppress frozen W37 fixtures in the actual runtime build; real data comes only from local API.
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const root=resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
// W09 portable integration: import the exact W46 Owner files cherry-picked into this checkout.
const original=resolve(root,'apps/web/vite.w46.config.mjs');
const owner=(await import(pathToFileURL(original).href)).default;
// Owner-controlled nonproduction preview only. Never touch the signed 4399 stage.
const r4IsolatedPreview=process.env.W47_R4_ISOLATED_PREVIEW==='1';
// An uncommitted or unacknowledged W46 moving tree must never enter W47's R4 preview.
if(r4IsolatedPreview){
 // W09 portable join: signed W46 Owner blobs MUST match this checkout; never
 // resolve a different developer worktree or trust a browser query as authority.
 const w46Root=root;
 const signedSha=process.env.W47_W46_CANDIDATE_SHA||'';
 const expectedOwnerSha='e51375e584adf5716728fac9540ab3d61ec0dcc7';
 const newestNoPairApprovedSha='7e986ada39a5e6b9fcbbd151af224d6dd16aad5c';
 const previousSettingsBlob='4163cbc90869922956e35e15d1be94cca8c8fcaf';
 const signedUnionSha='c28b8bd58260b8e0dbb5c0c01cb895e4c7ecb85a';
 const priorExpertOwnerSha='cdfea6313c0b17cb1a641f2b376f51fd586b49d2';
 const priorVueOwnerSha='2765a7600e1562df658cad67faab371fee243ea2';
 const w47ExpertBridgeFixSha='dba877b30c56235dd849980f282701ef78817d5a';
 const previousSignedSha='376277cbc61fe8946e0d26aac163eea04cb50e05';
 // Original W42/W46 ACK files are byte-for-byte copies of their actual
 // independent MasterController receipts; their Git blobs are pinned below.
 const canonicalAck='apps/web/evidence/W46_R4_MEDIA_SETTINGS_NATIVE_VUE_OWNER_ACK.md';
 const latestNoPairAck='apps/web/evidence/W46_PR110_7E986AD_NO_TERMINAL_PAIR_SETTINGS_OWNER_REVIEW_ACK.md';
 const priorExpertAck='apps/web/evidence/W46_PR102_PRIVATE_EXPERT_NATIVE_CONSUMER_REVIEW_ACK.md';
 const mediaDesignAck='apps/web/evidence/W42_R4_MEDIA_SETTINGS_COMPACT_IMPLEMENTATION_ACK.md';
 const priorUiAck='apps/web/evidence/W46_PR99_2765A760_CONTEXTUAL_POPOVER_OWNER_REVIEW_ACK.md';
 const previousOwnerAck='apps/web/evidence/W46_PR97_376277C_FIVE_VUE_OWNER_REVIEW_ACK.md';
 const visualAck='apps/web/evidence/W42_PR97_376277C_QR_VISUAL_DELTA_ACK.md';
 const legacyAck='apps/web/evidence/TO_W09_2_W46_R4_CANDIDATE_OWNER_HANDOFF.md';
 const ownerFiles={
  'apps/web/src/BCProductWorkspaceCandidate.vue':'cdac151c5f762c6f0e45e69f7610a704ce50abb4',
  'apps/web/src/BCMediaWorkspace.vue':'9e159e989dc3fb96a85e6c1b3fcd2426d38ff554',
  'apps/web/src/BCSettingsWorkspace.vue':'d470a9c38df937bbe3dbe170e6d628671e43fc99',
  'apps/web/src/w23-media-browser-consumer.mjs':'1c298ee1af52339b54a3de44141ebc4c48be9a52',
  'apps/web/src/BCLiveChatWorkspace.vue':'bfeebb453976939b59635d01cbba9db0b3ae8dd7',
  'apps/web/src/live-chat-source.mjs':'77e1c8947371b826b5a8fc3ca00bb12764fea02c',
  'apps/web/src/BCChannelAccountSetup.vue':'f8fbfea417a9293d48fb10fc3976c0f1d38424f6',
  'apps/web/src/BCNativeHostSession.vue':'613b9b761cf1b8325da03677b4051c2807d29a9b',
  'apps/web/src/channel-setup-contract.mjs':'308400756e9363972310fc6c059fa7df96ff985a',
  'apps/web/src/native-host-status-port.mjs':'339f78a5ea0c81db23875b479ffa1cf627e1f70f',
  'apps/web/src/BCNativeComposer.vue':'965a384780d8341c2a7bd9bbbdb80c92a72cc5ca',
  'apps/web/src/BCPrivateBrainWorkspace.vue':'b89129629899dd110a1c6c9d1b0560207696f477',
  'apps/web/src/BCNativeCloudKeySettings.vue':'93788ef4abf859bfb470223dad49a8a5e57905b0',
  'apps/web/src/private-brain-ui-contract.mjs':'674307159167361edf9f769408e0c399764aaff5',
  'apps/web/evidence/TO_W09_2_W46_SINGLE_BRAIN_NO_PAIR_MODEL_UI_20261026.md':'2aedb0b4673117999575273079ffc2b5c542de5c',
  'apps/web/evidence/TO_W09_2_W47_W46_MODEL_DTO_NATIVE_JOIN_20261026.md':'c42830240483a4ac553513b7202d7d41136719c8',
  'apps/web/src/BCLocalSessionConnector.vue':'7f62421e0e3410f7e343820be2a17351c4b11139',
  'apps/web/src/local-session-ui-contract.mjs':'07ce57478fd70bc41cc6c219811d24ac9fb8771e',
  'apps/web/evidence/TO_W09_2_W46_LOCAL_SESSION_OWNER_SECURITY_ACK_20261026.md':'de158fd6c5861a88a0ffe95e2a5899077624688c',
  'apps/web/src/BCBrandIcon.vue':'d99edca93a61f0464349cd515a6fee1a0580bb11',
  'apps/web/src/r4-brand-paths.mjs':'d8000f36dabcc5041c858c6c0c2f03a33345e103',
  'apps/web/src/product-workspace-contract.mjs':'594442c0f6f1e2a249cd67423a68bbd4e0940afa',
  'apps/web/vite.w46.config.mjs':'c4d79e2cb25f60dc0eedf1f355bc936ef2ac915b',
  [legacyAck]:'45893dca88309c678bc7b232f12809d879890c9e',
  [previousOwnerAck]:'bc95c1a2232bad01bd9f818c1d148e3aee53c5c6',
  [priorUiAck]:'495aa0ac679239f299b1aa3ae9c4f708730a0ba2',
  [priorExpertAck]:'5e5bfff0edb584a838772e671a3a501e4754c976',
  [canonicalAck]:'4f3e3a63c71abfe39efc8b3c577e0c59690b9f8d',
  [latestNoPairAck]:'05bd98bf738105372cce67f47f607a9339167dbc',
  [mediaDesignAck]:'9cac61dd626dc6153305fead1aa7a7b719d7fd4d',
  [visualAck]:'08cf4de4d9229ff396c58e01bc4cdf9fcfdce472'
 };
 const git=(...args)=>execFileSync('git',args,{cwd:w46Root,encoding:'utf8'}).trim();
 const readAck=path=>existsSync(join(w46Root,path))?
   readFileSync(join(w46Root,path),'utf8'):'';
 const ownerAck=readAck(canonicalAck);
 const visualOwnerAck=readAck(visualAck);
 const oldOwnerAck=readAck(legacyAck);
 const previousOwnerReview=readAck(previousOwnerAck);
 const priorUiReview=readAck(priorUiAck);
 const priorExpertReview=readAck(priorExpertAck);
 const mediaDesignReview=readAck(mediaDesignAck);
 const noPairReview=readAck(latestNoPairAck);
 // A descendant W47 config-signing commit must retain the EXACT reviewed
 // original W46 review and the merged W09 PR102; no unrelated source can reuse these ACKs.
 const signedAncestor=(()=>{
   try{
    git('merge-base','--is-ancestor',previousSignedSha,'HEAD');
    // PR105 cherry-picked W46's original commit; do not require the
    // original owner SHA to be an ancestor of the integration branch.
    // Its exact five original Git blobs are checked below instead.
    git('merge-base','--is-ancestor',priorVueOwnerSha,'HEAD');
    git('merge-base','--is-ancestor',w47ExpertBridgeFixSha,'HEAD');
    git('merge-base','--is-ancestor',signedUnionSha,'HEAD');
    return true
   }
   catch{return false}
 })();
 const receiptTracked=[canonicalAck,latestNoPairAck,priorExpertAck,mediaDesignAck,priorUiAck,previousOwnerAck,visualAck,legacyAck].every(path=>
   git('ls-tree','-r','--name-only','HEAD','--',path)===path);
 // Vite 7 writes a transient bundled config beside this file WHILE it
 // imports the config. It is not a source edit; its exact generated filename
 // is the sole exclusion. Any other tracked/untracked change remains RED.
 const dirtySource=git('status','--porcelain','--untracked-files=all')
   .split('\n').filter(line=>line&&
     !/^\?\? apps\/web\/runtime\/vite\.w47\.config\.mjs\.timestamp-[0-9]+-[a-f0-9]+\.mjs$/.test(line))
   .join('\n');
 // R4 local release: retain both exact, reviewed media 4e8545 and expert a9cc670 deltas.
 // Neither delta confers account, contact, provider-send, or cloud authorization.
 const galleryCommit='4e8545b82e87afc3104c96115f18c8da3f7f9467';
 const expertCommit='a9cc670583138785f0fd65896420bdd32408ecc7';
 const galleryPath='apps/web/src/BCMediaWorkspace.vue';
 const galleryTest='apps/web/tests/w46-r4-immersive-media-gallery.test.mjs';
 const gallerySettingsTest='apps/web/tests/w46-r4-media-settings-native.test.mjs';
 const expertPins=Object.freeze({
  'apps/web/src/BCLiveChatWorkspace.vue':'a2cf591ebf9eaca8b6e5326de8b283f41bb2b539',
  'apps/web/src/BCNativeComposer.vue':'de41bf5de2eb7737330296366c8ead361e76923e',
  'apps/web/src/BCNativeExpertPicker.vue':'175997ee7c538d09789be59d4814e2b339abe148',
  'apps/web/tests/w46-pr99-contextual-popover.test.mjs':'cc4ebfce062058fdda1a429288829d63c462662d'
 });
 // Narrow user-directed chat UI delta on the existing W09-3 baseline.
 // Preserve the independently reviewed W46/W47 parent blobs and all API authority checks.
 const chatUiBase='a27138f2bdecf2a5565f13970ae2c86ee4b63237';
 // Narrow source-only tools UI and its test, preserving the installed WOW parent.
 const toolsUiTest='apps/web/tests/w46-r4-compact-v1.test.mjs';
 const toolsUiTestBlob='0a3f7190a3d148c9ca116d56e318e4d4ba60aec4';
 const toolsUiTestValid=(()=>{
  try{return git('rev-parse','HEAD:'+toolsUiTest)===toolsUiTestBlob&&
   git('hash-object','--',toolsUiTest)===toolsUiTestBlob}
  catch{return false}
 })();
 const chatUiFiles=Object.freeze({
  'apps/web/src/BCLiveChatWorkspace.vue':'8af50eae07986b9561ad4aad392addafba4e8243',
  'apps/web/src/BCProductWorkspaceCandidate.vue':'1054dbc15558d537c99479479d7a81ea4ec54087',
  'apps/web/src/BCPrivateBrainWorkspace.vue':'8584acc60a34917fd45afbd6860650aef588687c'
 });
 // Reuse the exact already-running 6b0118d multi-account UI: no new authority.
 const multiAccountBase='6b0118de6fed027fb3785ad425c98aeaec11e402';
 const multiUiFiles=Object.freeze({
  'apps/web/src/BCChannelAccountSetup.vue':'c19e339d4152a54d02726e8049ad339e439da0fd',
  'apps/web/src/channel-setup-contract.mjs':'d03954f29d951d406a26f671e8b64bd700e7de00',
  'apps/web/tests/w46-personal-multi-account.test.mjs':'cdf3f0da475afadcde27285d6b94d2059e02b1c3',
  'apps/web/tests/w46-r4-channel-compact.test.mjs':'113fd98e48a08f4e8b82ee37d5487560adf20f0a'
 });
 // User-authorized LOCAL UI-only Page choice. Original W24/W44 grants and W55 credential
 // API remain untouched and deny by default; this is NOT an original Owner authorization.
 const pageUiSource='6a01deb568f4033080c68e7410d925115a494d38';
 const pageUiFiles=Object.freeze({"apps/web/src/BCChannelAccountSetup.vue":"b6753e25a57524dbb11a75bc29590416a2c71810","apps/web/src/BCPancakeMultiPageSetup.vue":"391c1c7980651de3e53c84ebff2c595792f272cc","apps/web/src/pancake-multi-browser.mjs":"5801bb2690297c0f8a5e8e7e8193a105aa86e980","apps/web/tests/pancake-multi-browser.test.mjs":"05a5a3130a4da6bd6c770db45f2dd60e2fb840f9"});
 // Exact W46 native WhatsApp source already delivered at 44751. The user
 // requested only popup/layout UX; original Page/WA owner blobs stay attested.
 const waBase='53536380b7ce517cc4733c6966a7a549942f363d';
 const waOwnerFiles=Object.freeze({
  'apps/web/src/BCChannelAccountSetup.vue':'0c337cfebf4065a2de9443b440f84d5f049619a6',
  'apps/web/src/whatsapp-native-user-flow.mjs':'8741b16c1ff5307ae335865c67800105b7101176',
  'apps/web/src/whatsapp-native-user-flow.test.mjs':'f48dad357bf4946847d32b6404f69780ef187dd7'
 });
 const channelUxFile='apps/web/src/BCChannelAccountSetup.vue';
 const channelUxSha='158d8af25152e7821c21c938d0c2cf9c1d399d45';
 // P0 WhatsApp single-flight source is already on the live 44751 version.
 // Verify its EXACT parent and two changed blobs instead of rejecting a valid
 // owner delta or weakening the original Baileys/channel security checks.
 const waP0Source='19c030838071d9df6ae069f7f109bd5ac18cfeea';
 const waP0Files=Object.freeze({
  'apps/web/src/whatsapp-native-user-flow.mjs':'a92cfbf423b1b499977394896426dc15e16a012d',
  'apps/web/src/whatsapp-native-user-flow.test.mjs':'6bdc67f6f9db5343362d2909a1635f571c97de16'
 });
 const waP0Verified=(()=>{try{
  git('merge-base','--is-ancestor',waP0Source,'HEAD');
  return Object.entries(waP0Files).every(([p,h])=>
   git('rev-parse',waP0Source+':'+p)===h&&
   git('rev-parse',waBase+':'+p)===waOwnerFiles[p]&&
   git('rev-parse','HEAD:'+p)===h&&git('hash-object','--',p)===h);
 }catch{return false}})();
 const waUxVerified=(()=>{try{
  git('merge-base','--is-ancestor',waBase,'HEAD');
  return Object.entries(waOwnerFiles).every(([p,h])=>
    git('rev-parse',waBase+':'+p)===h&&
    existsSync(join(w46Root,p))&&
    git('rev-parse','HEAD:'+p)===(p===channelUxFile?channelUxSha:(waP0Files[p]||h))&&
    git('hash-object','--',p)===(p===channelUxFile?channelUxSha:(waP0Files[p]||h)));
 }catch{return false}})();
 const pageUiScope=(()=>{try{
  return Object.entries(pageUiFiles).every(([p,h])=>
   existsSync(join(w46Root,p))&&
   git('hash-object','--',p)===(p===channelUxFile?channelUxSha:h)&&
   git('rev-parse','HEAD:'+p)===(p===channelUxFile?channelUxSha:h)&&
   git('rev-parse',pageUiSource+':'+p)===h);
 }catch{return false}})();
 const pageUiOriginalBase='96535d5bde1945ebdfec10b303fd3b0227519f38';
 const multiScope=(()=>{
  try{
   git('merge-base','--is-ancestor',multiAccountBase,'HEAD');
   return Object.entries(multiUiFiles).every(([path,sha])=>
    git('rev-parse',multiAccountBase+':'+path)===sha&&
    git('rev-parse','HEAD:'+path)===(path===channelUxFile?channelUxSha:(pageUiFiles[path]||sha))&&
    git('hash-object','--',path)===(path===channelUxFile?channelUxSha:(pageUiFiles[path]||sha)));
  }catch{return false}
 })();
 // Preserve original R4 signed parent and the exact two review deltas for browser-only appearance.
 const themeUiFiles=Object.freeze({
  'apps/web/src/BCSettingsWorkspace.vue':'77c1bcc6728fa17a548fbcbf92da710438bd2464',
  'apps/web/src/BCThemeChooser.vue':'6cfd5c572e82b9663e14d93a05af847f37180b02',
  'apps/web/tests/w46-r4-media-settings-native.test.mjs':'592708bc0484a4b164ddb6ad106021f7d4d53142'
 });
 const themeEvidence=new Set([
  'apps/web/evidence/THEME_WEB_FIRST_1360.png',
  'apps/web/evidence/THEME_WEB_FIRST_430.png',
  'apps/web/evidence/THEME_WEB_FIRST_CHROME_20261028.json',
  'apps/web/evidence/W09_THEME_WEB_FIRST_REVIEW_20261028.md',
  'apps/web/evidence/THEME_PERSISTENCE_CDP_20261028.json',
  'apps/web/evidence/W09_THEME_PERSIST_REUSE_NATIVE_BROWSER_STORE_20261028.md'
 ]);
 // Current notification Owner supersedes only the two original settings blobs.
 // The existing notifyDeltaValid further proves both against its signed source.
 const notifyThemePins=Object.freeze({
  'apps/web/src/BCSettingsWorkspace.vue':'77c1bcc6728fa17a548fbcbf92da710438bd2464',
  'apps/web/tests/w46-r4-media-settings-native.test.mjs':'592708bc0484a4b164ddb6ad106021f7d4d53142'
 });
 // Exact user-authorized General-settings presentation delta.
 // Preserve original de3 owner-verified Settings, W05 and notification blobs.
 // Reviewed additional presentation-only delta; previous exact W46/W05
 // signer evidence and original W47 auth boundary remain independently checked.
 const modelCenterBase="b7b08b2230290154617e26e2bd17ac4e4cc24480";
 const modelCenterFiles=Object.freeze({"apps/web/src/BCModelCenter.vue":"e83ee6c95e4acc910c01faeea78a2e63d9fd7df0","apps/web/src/BCSettingsWorkspace.vue":"ef0945c9a9ce652e9b3f613e085a92144f5b0352","apps/web/src/BCNativeCloudKeySettings.vue":"350c76aa447cd8e03683830756b7a7d6d842551b","apps/web/tests/w09-ai-model-center-vclaw.test.mjs":"654997832d0d6906dee1f581fb8b4c1f69f52795"});
 const modelCenterScope=(()=>{try{
  git("merge-base","--is-ancestor",modelCenterBase,"HEAD");
  const changed=git("diff","--name-only",modelCenterBase,"HEAD").split("\n").filter(Boolean);
  return changed.length===5&&changed.every(p=>Object.hasOwn(modelCenterFiles,p)||p==="apps/web/runtime/vite.w47.config.mjs")
   &&Object.entries(modelCenterFiles).every(([p,sha])=>existsSync(join(w46Root,p))&&
      git("rev-parse","HEAD:"+p)===sha&&git("hash-object","--",p)===sha)
   &&git("rev-parse",modelCenterBase+":apps/web/src/BCSettingsWorkspace.vue")==="27f30e231d2a6d2c27eb213fe5e03718fbbac728";
 }catch{return false}})();
 const settingsGeneralPath='apps/web/src/BCSettingsWorkspace.vue';
 const settingsGeneralSha=modelCenterFiles['apps/web/src/BCSettingsWorkspace.vue'];
 const settingsGeneralBase='de3c6b843449006b7a073ff58c2a7e5f033f7ac2';
 const settingsGeneralValid=(()=>{
  try{
   git('merge-base','--is-ancestor',settingsGeneralBase,'HEAD');
   return git('rev-parse',settingsGeneralBase+':'+settingsGeneralPath)===
    notifyThemePins[settingsGeneralPath]&&
    git('rev-parse','HEAD:'+settingsGeneralPath)===settingsGeneralSha&&
    git('hash-object','--',settingsGeneralPath)===settingsGeneralSha;
  }catch{return false}
 })();
 const themeScope=Object.entries(themeUiFiles).every(([path,sha])=>{
  const expected=path===settingsGeneralPath?settingsGeneralSha:(notifyThemePins[path]||sha);
  return existsSync(join(w46Root,path))&&git('hash-object','--',path)===expected&&git('rev-parse','HEAD:'+path)===expected;
 })
  &&[...themeEvidence].every(path=>existsSync(join(w46Root,path))&&
     git('hash-object','--',path)===git('rev-parse','HEAD:'+path))
  &&git('rev-parse','HEAD:apps/web/src/BCProductWorkspaceCandidate.vue')===
    chatUiFiles['apps/web/src/BCProductWorkspaceCandidate.vue'];
 // Only user-approved MIT visual layer on top of fixed-44751 Persona SHA; zero business rewrites.
 const wowBase='02764244af7ae329085c4bb0c1cec939780d5a20';
 const wowFiles=Object.freeze({"apps/web/src/BCProductWorkspaceCandidate.vue":"34a02c2b9a42940e0a3174de633c8ae095e07475","apps/web/src/BCVisualAurora.vue":"0b2a805c9dee236a02cd9c7954146eb7c6ee5056","apps/web/src/BCVisualThemeSystem.css":"4b700fa0e41f1c2ee25210017bb42563195ba1a6","apps/web/tests/w09-wow-visual-themes.test.mjs":"d5d8b6997f3595dc9e11c0144cfb031f6e4328a4"});
 const wowEvidence=new Set(["apps/web/evidence/INSPIRA_UI_AURORA_LICENSE.md","apps/web/evidence/WOW_THEMES_20261028/THEME_0.png","apps/web/evidence/WOW_THEMES_20261028/THEME_1.png","apps/web/evidence/WOW_THEMES_20261028/THEME_2.png","apps/web/evidence/WOW_THEMES_20261028/THEME_3.png","apps/web/evidence/WOW_THEMES_20261028/THEME_4.png","apps/web/evidence/WOW_THEMES_20261028/CHAT.png","apps/web/evidence/WOW_THEMES_20261028/BRAIN.png","apps/web/evidence/WOW_THEMES_20261028/WOW_VISUAL_QA_20261028.json","apps/web/evidence/WOW_THEMES_20261028/W09_VISUAL_REVIEW.md"]);
 // W09-3: Native W05/Agno event owner retained; only UI display and browser permission.
 const notifyBase='b32f8790c066c72756b7283b27f6127204bed50e';
 const notifyFiles=Object.freeze({"apps/web/src/BCSettingsWorkspace.vue":"77c1bcc6728fa17a548fbcbf92da710438bd2464","apps/web/src/BCNotificationCenter.vue":"f645e278987be088f286a06c2a692e3f63e441a7","apps/web/tests/w46-r4-media-settings-native.test.mjs":"592708bc0484a4b164ddb6ad106021f7d4d53142","apps/web/tests/w09-notification-center-native-reuse.test.mjs":"3dd8b07dbc3048235e6046dedd132d0dcb136c54"});
 const notifyEvidence=new Set(["apps/web/evidence/NOTIFICATION_CENTER_WEBFIRST_20261028/NOTIFY_CENTER_REAL_1360.png","apps/web/evidence/NOTIFICATION_CENTER_WEBFIRST_20261028/NOTIFY_CENTER_REAL_430.png","apps/web/evidence/NOTIFICATION_CENTER_WEBFIRST_20261028/NOTIFY_CENTER_QA_20261028.json","apps/web/evidence/NOTIFICATION_CENTER_WEBFIRST_20261028/W09_NOTIFICATION_CENTER_REVIEW.md","apps/web/evidence/NOTIFICATION_COMPACT_20261028/NOTIFY_COMPACT_REAL_1360.png","apps/web/evidence/NOTIFICATION_COMPACT_20261028/NOTIFY_COMPACT_REAL_430.png","apps/web/evidence/NOTIFICATION_COMPACT_20261028/NOTIFY_COMPACT_REAL_QA.json","apps/web/evidence/NOTIFICATION_COMPACT_20261028/W09_NOTIFY_COMPACT_REAL_CONTROLS_REVIEW.md"]);
 // Exact W05 native Tauri 2.6.0 + W43 verified Agno completion, no second event engine.
 // This already user-approved ChatGPT connection is built with the official
 // @siwc/local SDK. Preserve exact native/UI source blobs on this fixed site.
 const siwcFiles=Object.freeze({
  'apps/web/src/BCProductWorkspaceCandidate.vue':'1054dbc15558d537c99479479d7a81ea4ec54087',
  'apps/web/src/BCSettingsWorkspace.vue':'27f30e231d2a6d2c27eb213fe5e03718fbbac728',
  'apps/web/src/BCOfficialChatGPTConnect.vue':'8495834386b45f26cad1bcf41eead8742dbef60c',
  'services/api/runtime/server.mjs':'e221cbd80640f3af84056498093822794d21edaf',
  'services/api/runtime/w47-official-siwc.mjs':'4b81d31cdbcbcc7a50efd1fda007c49e0ecd1b33'
 });
 const siwcExactValid=Object.entries(siwcFiles).every(([path,sha])=>
   existsSync(join(w46Root,path))&&git('rev-parse','HEAD:'+path)===(modelCenterFiles[path]||sha)&&
   git('hash-object','--',path)===(modelCenterFiles[path]||sha));
 const w05Base='ffdd62dd8b9e5a512f322adeb5819b595dddc5f5';
 const w05Files=Object.freeze({"apps/web/src/BCNotificationCenter.vue":"f645e278987be088f286a06c2a692e3f63e441a7","apps/web/src/BCPrivateBrainWorkspace.vue":"8584acc60a34917fd45afbd6860650aef588687c","apps/web/src/w05-native-notification-port.mjs":"a10eb38128c39d7ddaf3f5d1a5881190223a3daf","apps/web/tests/w09-w05-native-notification.test.mjs":"8f07f4969815179ae865c6fce828b5f5f34a0906","apps/windows/src-tauri/Cargo.toml":"624b745b73f514fdcfb0f168064546ce1c55f864","apps/windows/src-tauri/Cargo.lock":"cc0bb05412250f404872fc438d23b88ad62fcd5a","apps/windows/src-tauri/src/main.rs":"2fd2fdad1e4e6de1e41c224efe8252ff5c9b1031","apps/windows/src-tauri/capabilities/main.json":"8aefc72b1a3ce83a83b147c485a807a4eb060833"});
 const w05Evidence=new Set(["apps/web/evidence/W05_AGNO_NATIVE_NOTIFY_20261028/NOTIFY_W05_NATIVE_QA_20261028.json","apps/web/evidence/W05_AGNO_NATIVE_NOTIFY_20261028/NOTIFY_W05_NATIVE_REAL_1360.png","apps/web/evidence/W05_AGNO_NATIVE_NOTIFY_20261028/NOTIFY_W05_NATIVE_REAL_430.png","apps/web/evidence/W05_AGNO_NATIVE_NOTIFY_20261028/W09_W05_AGNO_DELTA_REVIEW.md"]);
 const w05Scope=(()=>{
  try{
   git('merge-base','--is-ancestor',w05Base,'HEAD');
   const delta=git('diff','--name-only',w05Base,'HEAD').split('\n').filter(Boolean);
   if(delta.length<8||!delta.every(p=>Object.hasOwn(w05Files,p)||w05Evidence.has(p)||Object.hasOwn(notifyFiles,p)||Object.hasOwn(waP0Files,p)||Object.hasOwn(siwcFiles,p)||notifyEvidence.has(p)||p==='apps/web/runtime/vite.w47.config.mjs'))return false;
   return Object.entries(w05Files).every(([p,h])=>existsSync(join(w46Root,p))&&
    git('hash-object','--',p)===h&&git('rev-parse','HEAD:'+p)===h)
    &&[...w05Evidence].every(p=>existsSync(join(w46Root,p))&&
      git('hash-object','--',p)===git('rev-parse','HEAD:'+p));
  }catch{return false}
 })();
 const notifyDeltaValid=(()=>{
  try{
   git('merge-base','--is-ancestor',notifyBase,'HEAD');
   const delta=git('diff','--name-only',notifyBase,'HEAD').split('\n').filter(Boolean);
   if(delta.length<4||!delta.every(p=>Object.hasOwn(notifyFiles,p)||Object.hasOwn(modelCenterFiles,p)||Object.hasOwn(waOwnerFiles,p)||Object.hasOwn(pageUiFiles,p)||Object.hasOwn(chatUiFiles,p)||Object.hasOwn(siwcFiles,p)||notifyEvidence.has(p)||Object.hasOwn(w05Files,p)||w05Evidence.has(p)||Object.hasOwn(modelCenterFiles,p)||p==='apps/web/runtime/vite.w47.config.mjs'))return false;
   return Object.entries(notifyFiles).every(([p,h])=>{
     const expected=p===settingsGeneralPath?settingsGeneralSha:h;
     return existsSync(join(w46Root,p))&&
       git('rev-parse',settingsGeneralBase+':'+p)===h&&
       git('hash-object','--',p)===expected&&
       git('rev-parse','HEAD:'+p)===expected;
   })
     &&[...notifyEvidence].every(p=>existsSync(join(w46Root,p))&&
       git('hash-object','--',p)===git('rev-parse','HEAD:'+p));
  }catch{return false}
 })();
 const wowDeltaValid=(()=>{
  try{
   const wowRelease='b96161c14a93399c7033333ce1ee6ee33f83f991';
   git('merge-base','--is-ancestor',wowBase,'HEAD');
   git('merge-base','--is-ancestor',wowRelease,'HEAD');
   const delta=git('diff','--name-only',wowBase,'HEAD').split('\n').filter(Boolean);
   if(delta.length<5||!delta.every(p=>p===toolsUiTest||Object.hasOwn(siwcFiles,p)||Object.hasOwn(modelCenterFiles,p)||Object.hasOwn(waOwnerFiles,p)||Object.hasOwn(pageUiFiles,p)||Object.hasOwn(wowFiles,p)||wowEvidence.has(p)||Object.hasOwn(notifyFiles,p)||notifyEvidence.has(p)||Object.hasOwn(w05Files,p)||w05Evidence.has(p)||Object.hasOwn(modelCenterFiles,p)||p==='apps/web/runtime/vite.w47.config.mjs'))return false;
   return Object.entries(wowFiles).every(([p,h])=>{
    const expected=p==='apps/web/src/BCProductWorkspaceCandidate.vue'?chatUiFiles[p]:h;
    return git('rev-parse',wowRelease+':'+p)===h&&existsSync(join(w46Root,p))&&
     git('hash-object','--',p)===expected&&git('rev-parse','HEAD:'+p)===expected;
   })&&[...wowEvidence].every(p=>existsSync(join(w46Root,p))&&
       git('hash-object','--',p)===git('rev-parse','HEAD:'+p));
  }catch{return false}
 })();
 const chatUiDeltaValid=(()=>{
  try{
   git('merge-base','--is-ancestor',chatUiBase,'HEAD');
   const changed=git('diff','--name-only',chatUiBase,'HEAD').split('\n').filter(Boolean);
   if(!changed.every(p=>p===toolsUiTest||Object.hasOwn(modelCenterFiles,p)||Object.hasOwn(waOwnerFiles,p)||Object.hasOwn(pageUiFiles,p)||Object.hasOwn(chatUiFiles,p)||Object.hasOwn(multiUiFiles,p)||Object.hasOwn(themeUiFiles,p)||themeEvidence.has(p)||Object.hasOwn(siwcFiles,p)||Object.hasOwn(wowFiles,p)||wowEvidence.has(p)||Object.hasOwn(notifyFiles,p)||notifyEvidence.has(p)||Object.hasOwn(w05Files,p)||w05Evidence.has(p)||Object.hasOwn(modelCenterFiles,p)||p==='apps/web/runtime/vite.w47.config.mjs'))return false;
   return Object.entries(chatUiFiles).every(([p,sha])=>
    git('rev-parse','HEAD:'+p)===sha&&git('hash-object','--',p)===sha&&
    git('rev-parse',chatUiBase+':'+p)===(expertPins[p]||ownerFiles[p]));
  }catch{return false}
 })();
 const galleryScope=(()=>{try{
   git('merge-base','--is-ancestor',galleryCommit,'HEAD');
   return [galleryPath,galleryTest,gallerySettingsTest].every(path=>
     git('rev-parse','HEAD:'+path)===(notifyThemePins[path]||(path===gallerySettingsTest&&themeScope?
       themeUiFiles[path]:git('rev-parse',galleryCommit+':'+path))));
 }catch{return false}})();
 const expertScope=Object.entries(expertPins).every(([path,sha])=>{try{
   return existsSync(join(w46Root,path))&&git('rev-parse',expertCommit+':'+path)===sha&&
     git('rev-parse','HEAD:'+path)===(chatUiFiles[path]||sha)&&
     git('hash-object','--',path)===(chatUiFiles[path]||sha);
 }catch{return false}});
 const validSignedBlobs=siwcExactValid&&w05Scope&&notifyDeltaValid&&wowDeltaValid&&galleryScope&&expertScope&&Object.entries(ownerFiles).every(([path,sha])=>{
   const expected=path===settingsGeneralPath?settingsGeneralSha:
     (modelCenterFiles[path]||(path===channelUxFile?channelUxSha:(notifyFiles[path]||pageUiFiles[path]||chatUiFiles[path]||multiUiFiles[path]||themeUiFiles[path]||(path===galleryPath?git('rev-parse',galleryCommit+':'+path):(expertPins[path]||sha)))));
    return existsSync(join(w46Root,path))&&git('hash-object','--',path)===expected&&
     git('rev-parse','HEAD:'+path)===expected;
 });
 // Old five original Vue files remain protected, including ChannelSetup.
 // W46 R4 introduced TWO Vue components and its one authentic W23 browser
 // binary port. Exact Git content must match both the merged HEAD and W46's
 // independent signed original commit, even when W09 cherry-picks that commit.
 const fiveW46Vue=[
  'apps/web/src/BCProductWorkspaceCandidate.vue',
  'apps/web/src/BCLiveChatWorkspace.vue',
  'apps/web/src/BCChannelAccountSetup.vue',
  'apps/web/src/BCNativeComposer.vue',
  'apps/web/src/BCPrivateBrainWorkspace.vue'
 ];
 const mediaSourceFiles=[
  'apps/web/src/BCMediaWorkspace.vue',
  // Previous R4 media ACK covers the original Settings blob, not the
  // two-file PR110 no-pair delta. Check the original blob separately.
  'apps/web/src/BCProductWorkspaceCandidate.vue',
  'apps/web/src/BCLiveChatWorkspace.vue',
  'apps/web/src/BCNativeComposer.vue',
  // PRIVATE Brain itself is unchanged in this W46 delta; it remains protected
  // by its prior independent expert Owner ACK and the original five-blob pin.
  'apps/web/src/w23-media-browser-consumer.mjs'
 ];
 const originalW46BlobsValid=[...new Set([...fiveW46Vue,...mediaSourceFiles])].every(path=>{
   try{return git('rev-parse',expectedOwnerSha+':'+path)===ownerFiles[path]}
   catch{return false}
 });
 const mediaDesignValid=mediaDesignReview.includes('DESIGN_REVIEW_ACK')&&
   mediaDesignReview.includes('R4_MEDIA_SETTINGS_COMPACT_SPEC_READY');
 const w46ReviewValid=ownerAck.includes('W46_OWNER_REVIEW_ACK_PASS')&&
   ownerAck.includes(expectedOwnerSha)&&
   priorExpertReview.includes('W46_UI_NATIVE_DIRECTORY_OWNER_REVIEW_ACK_PASS')&&
   priorExpertReview.includes(priorExpertOwnerSha)&&
   priorUiReview.includes('W46_POPOVER_UI_AND_PRIVATE_NATIVE_INSPECTION_OWNER_REVIEW_ACK_PASS')&&
   priorUiReview.includes(priorVueOwnerSha)&&
   previousOwnerReview.includes('OWNER_REVIEW_ACK_PASS')&&
   previousOwnerReview.includes(previousSignedSha)&&
   originalW46BlobsValid&&
   mediaSourceFiles.every(path=>ownerAck.includes(path.slice('apps/web/src/'.length))&&
     ownerAck.includes(ownerFiles[path]));
 // W46 original media Owner still attests the unchanged previous Settings
 // blob, and the new PR110 independently attests ONLY the genuine two
 // settings/test deltas. Keep both ACKs and both Git provenance checks.
 const settingsPath='apps/web/src/BCSettingsWorkspace.vue';
 const settingsTestPath='apps/web/tests/w46-r4-media-settings-native.test.mjs';
 const noPairReviewValid=
   git('rev-parse',expectedOwnerSha+':'+settingsPath)===previousSettingsBlob&&
   ownerAck.includes(previousSettingsBlob)&&
   git('merge-base','--is-ancestor',newestNoPairApprovedSha,'HEAD')===''&&
   noPairReview.includes('W46_PR110_SETTINGS_UI_OWNER_REVIEW_ACK_PASS')&&
   noPairReview.includes(newestNoPairApprovedSha)&&
   noPairReview.includes('d470a9c38df937bbe3dbe170e6d628671e43fc99')&&
   noPairReview.includes('700fa2d653cd207b54de6f7061083cb5f9826ceb')&&
   git('rev-parse',newestNoPairApprovedSha+':'+settingsPath)===ownerFiles[settingsPath]&&
   git('rev-parse',newestNoPairApprovedSha+':'+settingsTestPath)==='700fa2d653cd207b54de6f7061083cb5f9826ceb'&&
   git('rev-parse','HEAD:'+settingsTestPath)===(notifyFiles[settingsTestPath]||(themeScope?themeUiFiles[settingsTestPath]:(galleryScope?git('rev-parse',galleryCommit+':'+settingsTestPath):'700fa2d653cd207b54de6f7061083cb5f9826ceb')))&&
   !readFileSync(join(w46Root,settingsPath),'utf8').includes('<BCLocalSessionConnector');
 // W42 independently closed only the QR layout/status RED with actual
 // NONSCANNABLE synthetic Chrome DOM, not a real user account authorization.
 const w42VisualValid=visualOwnerAck.includes('W42原R3/R4设计Owner')&&
   visualOwnerAck.includes('DESIGN_DELTA_PASS')&&
   visualOwnerAck.includes('44 PASS / 0 FAIL')&&
   visualOwnerAck.includes(previousSignedSha);
 if(signedSha!==expectedOwnerSha||!signedAncestor||!chatUiDeltaValid||!toolsUiTestValid||!multiScope||!pageUiScope||!waUxVerified||!waP0Verified||!themeScope||!settingsGeneralValid||!siwcExactValid||!wowDeltaValid||!notifyDeltaValid||!w05Scope||!modelCenterScope||dirtySource||
    !receiptTracked||!validSignedBlobs||!w46ReviewValid||!noPairReviewValid||!w42VisualValid||!mediaDesignValid||
    !oldOwnerAck.includes('W46 → W09-2')||!oldOwnerAck.includes('R4 Vue')||
    !readAck('apps/web/evidence/TO_W09_2_W46_LOCAL_SESSION_OWNER_SECURITY_ACK_20261026.md').includes('W46_LOCAL_PAIRING_UI_SECURITY_DELTA_PASS')||
    !readAck('apps/web/evidence/TO_W09_2_W46_SINGLE_BRAIN_NO_PAIR_MODEL_UI_20261026.md').includes('W46_UNIQUE_BRAIN_NO_PAIR_MODEL_UI_SOURCE_BUILD_CHROME_PASS'))
   throw Error('W47_W46_SIGNED_CLEAN_CANDIDATE_AND_OWNER_HANDOFF_REQUIRED '+JSON.stringify({signedAncestor,chatUiDeltaValid,toolsUiTestValid,multiScope,pageUiScope,waUxVerified,waP0Verified,themeScope,settingsGeneralValid,siwcExactValid,wowDeltaValid,notifyDeltaValid,w05Scope,dirtySource,receiptTracked,validSignedBlobs,w46ReviewValid,noPairReviewValid,w42VisualValid,mediaDesignValid}));
}
// This proxy target is a NONPRODUCTION QA-only W47 installed-mode API port.
// Keep 47182 as the default for unchanged signed B_88DED, never accept remote host.
const stageApiTarget=process.env.W09_STAGE_API_TARGET||'http://127.0.0.1:47182';
if(!/^http:\/\/127\.0\.0\.1:(?:[1-9][0-9]{3,4})$/.test(stageApiTarget))
  throw Error('W09_LOCAL_STAGE_API_TARGET_INVALID');
function failUnless(code,text){if(!code.includes(text))throw Error('W47_BC_CONTRACT_DRIFT: '+text)}
function gate(){
  return {name:'w47-runtime-truth-gate',enforce:'pre',
    transformIndexHtml(html){
      return html.replace('言策 V2 · 四方案离线交互实验','言策 V2 · 本地运行')
        .replace('</head>','<link rel="icon" href="data:,">\n</head>');
    },
    transform(code,id){
      const file=id.replaceAll('\\','/');
      if(file.endsWith('/approved-clickable-abc-bc/src/store.ts')){
        const exact='const originalContacts=Object.freeze(effectiveFixture.contacts.map(c=>Object.freeze(c)))';
        failUnless(code,exact);
        code=code.replace(exact,'const originalContacts=reactive([] as Contact[])');
        // B+C is the accepted product view; hide the obsolete A/B/C experiment switch.
        code=code.replace(/export const ARMS:[\s\S]*?\n]\nexport const THEMES/,
          "export const ARMS: {id:Arm;label:string;sub:string}[] = [{id:'CHAT-BC-FUSION',label:'B+C · 融合版',sub:'Inbox + Autopilot'}]\nexport const THEMES");
        code=code.replace('arm:ARMS[3].id as Arm','arm:ARMS[0].id as Arm');
        code=code.replace('selected:key(originalContacts[0])', "selected:originalContacts[0]?key(originalContacts[0]):''");
        code=code.replace('export const allContacts=originalContacts as Contact[]',`export const allContacts=originalContacts as Contact[]
// Server supplied list only; no fixture hydration or fake success on failed reads.
void fetch('/api/v2/contacts',{credentials:'omit',redirect:'error'}).then(async response=>{
 if(!response.ok)throw Error('CONTACT_API_'+response.status);
 const payload=await response.json();
 if(payload.authoritative!==true||!Array.isArray(payload.contacts))throw Error('CONTACT_AUTHORITY_INVALID');
 originalContacts.splice(0,originalContacts.length,...payload.contacts);
 state.selected=originalContacts.length?key(originalContacts[0]):'';
}).catch(()=>{originalContacts.splice(0);state.selected=''})`);
        code=code.replace('export const candidates=(c:Contact)=>overlay.reply_cases.find(x=>x.peer_id===c.peer_id)?.candidates||[]',
          'export const candidates=(_c:Contact)=>[]');
        code=code.replace('export const currentMode=(c:Contact)=>state.mode[key(c)]||c.mode',
          "export const currentMode=(_c:Contact)=>'UNAVAILABLE'");
        code=code.replace(/export function editPublic\([\s\S]*?\n}\nexport function adoptCandidate/,
          "export function editPublic(text:string,_source='TEXT'){const c=active.value;if(c)getDraft(c).text=text}\nexport function adoptCandidate");
        code=code.replace(/export function simulateSend\(\)\{[\s\S]*?\n}\nexport function setException/,
          "export function simulateSend(){state.dialog='没有已认证平台发送资格，消息未发送'}\nexport function setException");
        code=code.replace(/export function askPrivate\(\)\{[\s\S]*?\n}\nexport function note/,
          "export function askPrivate(){state.dialog='闺蜜大脑运行授权尚未连接，未生成回复或调用模型'}\nexport function note");
        return code;
      }
      if(file.endsWith('/approved-clickable-abc-bc/src/App.vue')){
        const w46R4Candidate=code.includes('<BCProductWorkspaceCandidate');
        if(r4IsolatedPreview&&!w46R4Candidate)throw Error('W47_R4_W46_OWNER_COMPONENT_NOT_MOUNTED');
        if(!code.includes('<div class="lab-strip">')&&
           !code.includes('<div v-if="!w46WorkspaceEnabled" class="lab-strip">'))
          throw Error('W47_BC_LAB_STRIP_CONTRACT_CHANGED');
        if(w46R4Candidate&&!r4IsolatedPreview){
          // Exact reviewed W46 R4 source now uses an opt-out predicate.
          // Preserve fail-closed string matching while activating the existing
          // view in this explicit user-authorized LOCAL 44751 candidate.
          const activation="const w46WorkspaceEnabled=new URLSearchParams(window.location.search).get('productDraft')!=='0'||w46InstalledAssetHost";
          failUnless(code,activation);
          code=code.replace(activation,'const w46WorkspaceEnabled=true');
        }
        code=code.replace(/const accounts=\[[^\n]*\]/,"const accounts=['ALL']");
        code=code.replace(/const queue=\[[\s\S]*?\n\]\nconst currentException/,
          'const queue=[]\nconst currentException');
        code=code.replace('查看全部120','查看全部')
          .replace('没有匹配的虚构联系人。可清除筛选','尚未连接社交平台，当前没有真实联系人')
          .replace('V2 LAB','V2 本机');
        code=code.replace('function openPrivateWorkspace(){state.privateOpen=true;state.variantMenuOpen=false}',
          "function openPrivateWorkspace(){state.dialog='闺蜜大脑尚未连接可信运行授权，未执行模型调用'}");
        // Remove remnants of the historical W37 clickable LAB from the real no-provider UI.
        // Every old demo control here would otherwise suggest that a real account existed.
        failUnless(code,'四方案真实交互试验 · 本地离线');
        failUnless(code,'加载更多（25）');
        failUnless(code,'所有账号均为fixture-account-1/2');
        code=code.replace('四方案真实交互试验 · 本地离线','本地运行 · 无需言策账号');
        code=code.replace(/<nav class="arm-switch"[\s\S]*?<\/nav>/,'');
        code=code.replace(/<Button variant="ghost" size="icon-sm" aria-label="重置所有实验状态"[\s\S]*?<\/Button>/,'');
        code=code.replace(/<Button variant="ghost" size="icon-sm" aria-label="查看四平台与虚构账号说明"[\s\S]*?<\/Button>/,'');
        code=code.replace('<div class="account-pills">','<div v-if="allContacts.length" class="account-pills">');
        code=code.replace('<div class="channel-pills"','<div v-if="allContacts.length" class="channel-pills"');
        code=code.replace('<div v-if="isAdaptive" class="inbox-pills"','<div v-if="isAdaptive&&allContacts.length" class="inbox-pills"');
        code=code.replace('按冻结数据未读排序 · 无AI推断','仅按已取得的实际消息状态显示');
        code=code.replace('<div class="page-bottom">','<div v-if="filtered.length>paged.length" class="page-bottom">');
        code=code.replace('加载更多（25）','加载更多');
        code=code.replace('Math.min(120,state.pageSize+25)','Math.min(filtered.length,state.pageSize+25)');
        code=code.replace(/<Button variant="ghost" size="sm" @click="state.pageSize=120">查看全部(?:120)?<\/Button>/,'');
        code=code.replace(/<section v-else class="no-active-pane"[\s\S]*?<\/section>/,
          `<section v-else class="no-active-pane" data-test="no-active">
            <LockKeyhole :size="30"/>
            <h2>尚未连接聊天平台</h2>
            <p>本机 API 已启动，但还没有授权的 Facebook、WhatsApp、Telegram 或 Page 账号。</p>
            <p>连接平台需要你主动授权。当前无法读取真人联系人或消息，闺蜜大脑托管与发送保持关闭。</p>
            <small data-test="w47-empty-authority">当前状态：{{w47ApiStatus}}</small>
          </section>`);
        code=code.replace("if(q.get('private')==='1')state.privateOpen=true;",'')
          .replace("if(q.get('pulse')==='1')state.pulseOpen=true;",'')
          .replace("if(q.get('uat')==='1'){const u=await import('./browser-tests');await u.runBrowserUAT()}",'');
        code=code.replace('本地模拟状态','当前运行状态')
          .replace('以下仅为离线测试反馈，不代表真实授权、发送或工具运行。',
             '平台和联系人尚未授权。这里不会模拟登录、聊天或 AI 成功。');
        code=code.replace('仅127.0.0.1 · 离线合成数据','本机 127.0.0.1 · 无平台授权');
        code=code.replace('{{currentArm.sub}} · {{state.theme}} / {{state.appearance}} · reset {{state.resetCount}}',
          '{{state.theme}} / {{state.appearance}}');
        code=code.replace("VIEW {{active?.peer_id||'NO_SELECTION'}} · 真实发送 0 · P4 HOLD",
          '托管未启用 · 消息发送禁用');
        code=code.replace(/<div(?: v-if="!w46WorkspaceEnabled")? class="lab-strip">[\s\S]*?<\/div>/,
          `<div v-if="${w46R4Candidate?'!w46WorkspaceEnabled':'true'}" class="lab-strip" data-test="w47-api-state">
<ShieldCheck :size="13"/> V2 本机运行 · API：{{w47ApiStatus}} · Web: {{w47WebSha}} · 无平台连接 · 自动发送禁用
</div>`);
        code=code.replace('const filePicker=ref<HTMLInputElement|null>(null)',`const filePicker=ref<HTMLInputElement|null>(null)
const w47ApiStatus=ref('正在查询')
const w47WebSha=ref('待读取')
onMounted(async()=>{
  try {
    const [health,capabilities,version]=await Promise.all([
      fetch('/api/v2/runtime/health',{cache:'no-store'}),
      fetch('/api/v2/runtime/capabilities',{cache:'no-store'}),
      fetch('/version.json',{cache:'no-store'})
    ]);
    if(!health.ok||!capabilities.ok||!version.ok)throw Error('API_NOT_CONNECTED');
    const h=await health.json(), c=await capabilities.json(),v=await version.json();
    if(h.ok!==true||h.canSend!==false||c.authoritative!==true)throw Error('API_AUTHORITY_INVALID');
    w47ApiStatus.value=h.apiVersion+' '+h.runtimeSha.slice(0,8)+' / 无授权';
    w47WebSha.value=(v.source_sha||'未记录').slice(0,8);
  }catch{w47ApiStatus.value='不可用；发送禁用'}
})`);
        code=code.replace("note('REAL CLICKABLE OFFLINE HARNESS / W37 SYNTHETIC DATA LOADED')",
          "note('W47 runtime: API no provider credentials; contact list server-sourced')");
        return code;
      }
    }
  };
}
export default {
 ...owner,
 plugins:[...owner.plugins,gate()],
 server:{...owner.server,proxy:{'/api/v2':stageApiTarget}},

 preview:{...owner.preview,host:'127.0.0.1',port:r4IsolatedPreview?44747:4399,strictPort:true,
  proxy:{'/api/v2':{target:stageApiTarget,changeOrigin:true},
         '/w46-native-test':{target:stageApiTarget,changeOrigin:true}}}
};

const fs=require('fs'),p=require('path'),crypto=require('crypto'),root=__dirname,h=b=>crypto.createHash('sha256').update(b).digest('hex');
const get=n=>JSON.parse(fs.readFileSync(p.join(root,n),'utf8'));
const files=[];
function walk(dir){for(const x of fs.readdirSync(p.join(root,dir),{withFileTypes:true})){const rel=dir+'/'+x.name;if(x.isDirectory())walk(rel);else {const b=fs.readFileSync(p.join(root,rel));files.push({path:rel,bytes:b.length,sha256:h(b)})}}}
walk('dist');files.sort((a,b)=>a.path.localeCompare(b.path));
const m=get('evidence/CHROME_SCREENSHOT_MATRIX.json'),u=get('evidence/W39_CHROME_UAT_FINAL_44PASS.json'),vendor=get('W39_VENDOR_MODIFICATIONS.json'),t=get('evidence/NPM_TARBALL_ACTUAL_SHA512_CHECKS.json'),lic=get('evidence/INSTALLED_PACKAGE_LICENSE_INTEGRITY_REPORT.json'),sidecar=get('src/data/sidecar.json');
const css=[360,430,720,920,950,1050,1100,1101,1360],screens=m.screenshots;
if(screens.length!==23||u.pass!==44||u.fail!==0||vendor.files.length!==72||vendor.modifications.length!==5||t.checked!==74||t.failures!==0||lic.missingLicenseTexts.length)throw Error('evidence matrix inconsistent');
for(const width of css){const x=screens.find(s=>s.kind==='RESPONSIVE'&&s.requestedCSSWidth===width);if(!x||x.actualCSSWidth!==width||x.pngRealWidth!==width||x.cssOverflow||x.nav.some(n=>n.left<0||n.right>width))throw Error('viewport not exactly covered '+width)}
const result={
 scope:'YANCE_V2_P3_1_OFFLINE_NONPRODUCTION',status:'W39_REAL_BUILD_AND_CLICKABLE_CHROME_SELF_PASS_PENDING_INDEPENDENT_W40_W41_W42',
 sourcePreimportGitSHA:'f0b008875a15340a39325549dba3a9c099442405',reproducibleSameCommitBuild:true,
 buildEnvironment:'DESKTOP-029FH47; npm install --ignore-scripts; vite@7.3.1; node 24.18.0',buildCommand:'npm run build',
 bundle:files,lockSHA256:h(fs.readFileSync(p.join(root,'package-lock.json'))),
 screenshotEvidence:{count:screens.length,arms:4,themeStates:10,responsiveExactCSSWidths:css,sha256:h(fs.readFileSync(p.join(root,'evidence/CHROME_SCREENSHOT_MATRIX.json')))},
 uat:{method:'Chrome headless actual DOM click/keyboard/text input + W39 owner-only assertions',cases:44,pass:44,fail:0,sourceSHA256:h(fs.readFileSync(p.join(root,'evidence/W39_CHROME_UAT_FINAL_44PASS.json')))},
 vendor:{approvedCopied:72,approvedDiffs:5,sourceManifestSHA256:h(fs.readFileSync(p.join(root,'W39_VENDOR_ORIGINAL_SHA_MANIFEST.json'))),diffSHA256:h(fs.readFileSync(p.join(root,'evidence/W39_APPROVED_FIVE_VENDOR_DIFFS.patch')))},
 npm:{approvedDirect:14,winMaterialized:74,lockEntries:145,unmaterializedOptionalPlatforms:71,actualDownloadedTarballSRI:74,failedSRI:0,integrityEvidenceSHA256:h(fs.readFileSync(p.join(root,'evidence/NPM_TARBALL_ACTUAL_SHA512_CHECKS.json')))},
 legal:{THIRD_PARTY_NOTICES_SHA256:h(fs.readFileSync(p.join(root,'THIRD_PARTY_NOTICES.txt'))),bomSHA256:h(fs.readFileSync(p.join(root,'evidence/CYCLONEDX_1_5_SBOM.json'))),W42Postbuild:'NOT_RUN'},
 fixture:{contacts:120,sidecarEvents:sidecar.added_synthetic_events.length,themes:10,sourceSHA256:'5b9a05df788fe5fab41b6b2033fb895cd3650fb573345856650cfeb24ef9c99c'},
 notYet:'Windows Tauri/WebView2 UAT; 125/150/200% DPI; W40 independent QA; W41 independent security; W42 postbuild OSS; pixel accurate original historical V2.5 A; P4'
};
fs.writeFileSync(p.join(root,'evidence/W39_BUILD_ARTIFACTS_MANIFEST.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({status:result.status,bundle:files,lockSHA256:result.lockSHA256,uat:result.uat,viewportExact:css,thirdPartySha:result.legal.THIRD_PARTY_NOTICES_SHA256},null,2));

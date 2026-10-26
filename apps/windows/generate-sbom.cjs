// Offline inventory from Cargo.lock and actual current OS user's Cargo registry.
// No developer fallback; absent cache is explicitly unverified, not silently
// substituted with somebody else's C:\\Users directory.
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const root=__dirname,lock=fs.readFileSync(path.join(root,"src-tauri","Cargo.lock"),"utf8");
const packages=lock.split(/^\[\[package\]\]\s*$/m).slice(1);
const explicitCargoHome=process.env.CARGO_HOME;
const cargoHome=explicitCargoHome||path.join(os.homedir(),".cargo");
if(!cargoHome||!path.isAbsolute(cargoHome))
  throw Error("CARGO_HOME_MUST_BE_AN_ABSOLUTE_CURRENT_USER_PATH");
const registrySrc=path.join(cargoHome,"registry","src");
if(!fs.existsSync(registrySrc)||!fs.statSync(registrySrc).isDirectory())
  throw Error("LOCAL_CARGO_REGISTRY_SOURCE_CACHE_MISSING");
const registryIndexes=fs.readdirSync(registrySrc,{withFileTypes:true})
  .filter(x=>x.isDirectory()).map(x=>path.join(registrySrc,x.name));
if(!registryIndexes.length)throw Error("LOCAL_CARGO_REGISTRY_SOURCE_CACHE_EMPTY");
const entries=[];
for(const block of packages){
 const name=block.match(/^name = "([^"]+)"/m)?.[1],version=block.match(/^version = "([^"]+)"/m)?.[1];
 const source=block.match(/^source = "([^"]+)"/m)?.[1]||"WORKTREE";
 if(!name||!version)continue;
 const manifest=registryIndexes.map(r=>path.join(r,name+"-"+version,"Cargo.toml"))
   .find(p=>fs.existsSync(p));
 let license="UNVERIFIED_LOCAL_METADATA_ABSENT";
 if(manifest){
   const txt=fs.readFileSync(manifest,"utf8");
   license=txt.match(/^license = "([^"]+)"/m)?.[1]||
     (txt.match(/^license-file = "([^"]+)"/m)?"LICENSE_FILE_REVIEW_REQUIRED":"UNDECLARED");
 }
 entries.push({name,version,license,source:source==="WORKTREE"?"WORKTREE":"REGISTRY"});
}
entries.sort((a,b)=>a.name.localeCompare(b.name)||a.version.localeCompare(b.version));
const missing=entries.filter(x=>x.license==="UNVERIFIED_LOCAL_METADATA_ABSENT"||x.license==="UNDECLARED"||x.license==="LICENSE_FILE_REVIEW_REQUIRED");
fs.writeFileSync(path.join(root,"DEPENDENCY_LICENSE_INVENTORY.json"),JSON.stringify({scope:"LOCKFILE_OFFLINE_NONPRODUCTION_NOT_LEGAL_SIGNOFF",source:"src-tauri/Cargo.lock + local .cargo registry manifests",packages:entries.length,unverified:missing.length,entries},null,2)+"\n");
console.log("CARGO_LOCK_PACKAGES="+entries.length+" LICENSE_UNVERIFIED="+missing.length);
console.log("PINNED="+entries.filter(x=>["tauri","tauri-build","windows-sys","getrandom"].includes(x.name)).map(x=>x.name+"@"+x.version+"["+x.license+"]").join(" "));

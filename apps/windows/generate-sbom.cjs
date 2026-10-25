// Offline inventory from exact Cargo.lock and locally cached crate manifests.
const fs=require("node:fs"),path=require("node:path");
const root=__dirname,lock=fs.readFileSync(path.join(root,"src-tauri","Cargo.lock"),"utf8");
const packages=lock.split(/^\[\[package\]\]\s*$/m).slice(1);
const cargoHome=path.join(process.env.USERPROFILE||"C:\\Users\\1",".cargo","registry","src","index.crates.io-1949cf8c6b5b557f");
const entries=[];
for(const block of packages){
 const name=block.match(/^name = "([^"]+)"/m)?.[1],version=block.match(/^version = "([^"]+)"/m)?.[1];
 const source=block.match(/^source = "([^"]+)"/m)?.[1]||"WORKTREE";
 if(!name||!version)continue;
 const manifest=path.join(cargoHome,name+"-"+version,"Cargo.toml");
 let license="UNVERIFIED_LOCAL_METADATA_ABSENT";
 if(fs.existsSync(manifest)){
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

//! W55 current-user Windows DPAPI store for original W28 Baileys Signal state.
//! One-shot PRIVATE stdin/stdout child of original W47/W28, never a web service.
//! W24/W54 must independently authorize a real binding before invoking this bin.
//! No old credentials are imported; revoke tombstones permanently block same K.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, fs, io::{self, Read, Write}, path::PathBuf, ptr};
use windows_sys::Win32::{
    Foundation::{CloseHandle, LocalFree, WAIT_OBJECT_0},
    Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    },
    System::Threading::{CreateMutexW, ReleaseMutex, WaitForSingleObject},
    Storage::FileSystem::{MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH},
};
use zeroize::Zeroizing;

const MAX_BYTES: usize = 8 * 1024 * 1024;
const SCHEMA: u8 = 1;
#[derive(Deserialize, Serialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct Scope {
    installation_ref:String,principal_ref:String,tenant_id:String,account_id:String,
    binding_revision:u64,account_revocation_epoch:u64,
}
#[derive(Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct Request {
    op:String,scope:Scope,creds:Option<String>,
    entries:Option<BTreeMap<String,Option<String>>>,
}
#[derive(Serialize,Deserialize)]
#[serde(deny_unknown_fields)]
struct Document {
    schema:u8,scope_digest:String,revoked:bool,revision:u64,
    creds:Option<String>,keys:BTreeMap<String,String>,
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
struct Response {
    ok:bool,found:bool,revoked:bool,revision:u64,
    #[serde(skip_serializing_if="Option::is_none")] creds:Option<String>,
    #[serde(skip_serializing_if="Option::is_none")] keys:Option<BTreeMap<String,String>>,
}
struct MutexGuard(windows_sys::Win32::Foundation::HANDLE);
impl Drop for MutexGuard {
    fn drop(&mut self) { unsafe { ReleaseMutex(self.0); CloseHandle(self.0); } }
}
fn wide(s:&str)->Vec<u16>{s.encode_utf16().chain(Some(0)).collect()}
fn validate(s:&str)->bool{
    (1..=200).contains(&s.len()) && s.bytes().all(|b|
        b.is_ascii_alphanumeric() || matches!(b,b'_'|b'-'|b'.'|b':'|b'@'))
}
fn scoped_hash(scope:&Scope)->Result<String,&'static str>{
    if ![&scope.installation_ref,&scope.principal_ref,&scope.tenant_id,&scope.account_id]
        .iter().all(|s|validate(s)) || scope.binding_revision==0
        {return Err("W55_SCOPE_INVALID")}
    let mut h=Sha256::new();
    h.update(b"YanceV2-W55-WhatsApp-Signal-DPAPI-v1");
    for s in [&scope.installation_ref,&scope.principal_ref,&scope.tenant_id,&scope.account_id] {
        h.update((s.len() as u32).to_le_bytes());
        h.update(s.as_bytes());
    }
    h.update(scope.binding_revision.to_le_bytes());
    h.update(scope.account_revocation_epoch.to_le_bytes());
    Ok(format!("{:x}",h.finalize()))
}
fn lock(name:&str)->Result<MutexGuard,&'static str>{
    let mutex=wide(&format!("Local\\Yance-W55-WA-DPAPI-{name}"));
    let handle=unsafe{CreateMutexW(ptr::null(),0,mutex.as_ptr())};
    if handle.is_null(){return Err("W55_MUTEX_UNAVAILABLE")}
    let result=unsafe{WaitForSingleObject(handle,30_000)};
    if result!=WAIT_OBJECT_0 {
        unsafe{CloseHandle(handle);}
        return Err("W55_MUTEX_TIMEOUT");
    }
    Ok(MutexGuard(handle))
}
fn crypt(protect:bool,bytes:&[u8],entropy:&[u8])->Result<Zeroizing<Vec<u8>>,&'static str>{
    if bytes.is_empty()||bytes.len()>MAX_BYTES||entropy.is_empty(){return Err("W55_BLOB_INVALID")}
    let input=CRYPT_INTEGER_BLOB{cbData:bytes.len() as u32,pbData:bytes.as_ptr() as *mut u8};
    let scope=CRYPT_INTEGER_BLOB{cbData:entropy.len() as u32,pbData:entropy.as_ptr() as *mut u8};
    let mut output=CRYPT_INTEGER_BLOB{cbData:0,pbData:ptr::null_mut()};
    let success=unsafe{
        if protect {
            CryptProtectData(&input,ptr::null(),&scope,ptr::null(),ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,&mut output)
        }else{
            CryptUnprotectData(&input,ptr::null_mut(),&scope,ptr::null(),ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,&mut output)
        }
    };
    if success==0{return Err("W55_DPAPI_FAILED")}
    let result=if output.pbData.is_null()||output.cbData as usize>MAX_BYTES{
        Err("W55_DPAPI_INVALID_OUTPUT")
    }else{
        Ok(Zeroizing::new(unsafe{
            std::slice::from_raw_parts(output.pbData,output.cbData as usize).to_vec()
        }))
    };
    if !output.pbData.is_null(){
        unsafe{
            ptr::write_bytes(output.pbData,0,output.cbData as usize);
            LocalFree(output.pbData.cast());
        }
    }
    result
}
fn dir()->Result<PathBuf,&'static str>{
    #[cfg(debug_assertions)]
    if let Ok(v)=std::env::var("YANCE_W55_SIGNAL_QA_DIR"){
        let root=PathBuf::from(v);
        if root.is_absolute()&&root.to_str().map(|s|s.contains("w55-wa-qa-")).unwrap_or(false){
            return Ok(root);
        }
        return Err("W55_QA_DIR_INVALID");
    }
    let local=std::env::var_os("LOCALAPPDATA").ok_or("W55_LOCALAPPDATA_UNAVAILABLE")?;
    let path=PathBuf::from(local);
    if !path.is_absolute(){return Err("W55_LOCALAPPDATA_INVALID")}
    Ok(path.join("YanceV2").join("WhatsAppSignalV1"))
}
fn load(path:&PathBuf,hash:&str)->Result<Option<Document>,&'static str>{
    let file=match fs::read(path) {
        Ok(bytes)=>bytes, Err(e) if e.kind()==io::ErrorKind::NotFound=>return Ok(None),
        Err(_)=>return Err("W55_PROTECTED_READ_FAILED"),
    };
    if file.is_empty()||file.len()>MAX_BYTES{return Err("W55_RECORD_CORRUPT")}
    let clear=crypt(false,&file,hash.as_bytes())?;
    let doc:Document=serde_json::from_slice(&clear).map_err(|_|"W55_RECORD_CORRUPT")?;
    if doc.schema!=SCHEMA||doc.scope_digest!=hash||doc.revision<1{
        return Err("W55_SCOPE_MISMATCH");
    }
    Ok(Some(doc))
}
fn save(path:&PathBuf,hash:&str,doc:&Document)->Result<(),&'static str>{
    let plain=Zeroizing::new(serde_json::to_vec(doc).map_err(|_|"W55_RECORD_SERIALIZE_FAILED")?);
    let cipher=crypt(true,&plain,hash.as_bytes())?;
    let parent=path.parent().ok_or("W55_PATH_INVALID")?;
    fs::create_dir_all(parent).map_err(|_|"W55_STORE_CREATE_DENIED")?;
    let temp=path.with_extension(format!("tmp-{}",std::process::id()));
    let mut f=fs::OpenOptions::new().create_new(true).write(true).open(&temp)
        .map_err(|_|"W55_WRITE_DENIED")?;
    if f.write_all(&cipher).is_err()||f.sync_all().is_err(){
        let _=fs::remove_file(&temp);
        return Err("W55_DURABLE_WRITE_FAILED");
    }
    drop(f);
    let from=wide(&temp.to_string_lossy());
    let to=wide(&path.to_string_lossy());
    if unsafe{MoveFileExW(from.as_ptr(),to.as_ptr(),
        MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH)}==0{
        let _=fs::remove_file(&temp);
        return Err("W55_DURABLE_REPLACE_FAILED");
    }
    Ok(())
}
fn work(req:Request)->Result<Response,&'static str>{
    let hash=scoped_hash(&req.scope)?;
    if !["read","put","revoke"].contains(&req.op.as_str()){
        return Err("W55_ACTION_INVALID");
    }
    if req.op=="read"&&(req.creds.is_some()||req.entries.is_some()) ||
       req.op=="revoke"&&(req.creds.is_some()||req.entries.is_some()){
        return Err("W55_UNEXPECTED_MATERIAL");
    }
    if let Some(ref creds)=req.creds {
        if creds.is_empty()||creds.len()>MAX_BYTES/2{return Err("W55_CREDS_INVALID")}
    }
    if let Some(ref entries)=req.entries {
        if entries.len()>1000{return Err("W55_ENTRIES_EXCEEDED")}
        for (key,value) in entries {
            if !validate(key)||value.as_ref().is_some_and(|x|x.len()>256_000){
                return Err("W55_ENTRY_INVALID");
            }
        }
    }
    let _guard=lock(&hash)?;
    let path=dir()?.join(format!("{hash}.dat"));
    let found=load(&path,&hash)?;
    if found.as_ref().is_some_and(|x|x.revoked)&&req.op!="revoke"{
        return Err("W55_SIGNAL_ACCOUNT_REVOKED");
    }
    if req.op=="read" {
        return Ok(match found {
            None=>Response{ok:true,found:false,revoked:false,revision:0,creds:None,keys:None},
            Some(doc)=>Response{ok:true,found:true,revoked:false,revision:doc.revision,
                creds:doc.creds,keys:Some(doc.keys)},
        });
    }
    let mut doc=found.unwrap_or(Document{schema:SCHEMA,scope_digest:hash.clone(),
        revoked:false,revision:0,creds:None,keys:BTreeMap::new()});
    doc.revision=doc.revision.checked_add(1).ok_or("W55_REVISION_OVERFLOW")?;
    if req.op=="revoke" {
        doc.revoked=true;
        doc.creds=None;
        doc.keys.clear();
    }else{
        if let Some(creds)=req.creds {doc.creds=Some(creds);}
        if let Some(entries)=req.entries {
            for (key,value) in entries{
                match value{Some(value)=>{doc.keys.insert(key,value);},
                    None=>{doc.keys.remove(&key);}}
            }
        }
    }
    save(&path,&hash,&doc)?;
    Ok(Response{ok:true,found:true,revoked:doc.revoked,revision:doc.revision,
        creds:None,keys:None})
}
fn main(){
    let mut input=Zeroizing::new(Vec::new());
    let result=(||{
        io::stdin().take((MAX_BYTES+1) as u64).read_to_end(&mut input)
            .map_err(|_|"W55_STDIN_FAILED")?;
        if input.is_empty()||input.len()>MAX_BYTES{return Err("W55_INPUT_INVALID")}
        let req:Request=serde_json::from_slice(&input).map_err(|_|"W55_REQUEST_INVALID")?;
        work(req)
    })();
    match result{
        Ok(res)=>{let _=serde_json::to_writer(io::stdout(),&res);
            println!();},
        Err(code)=>{eprintln!("{code}");std::process::exit(2)},
    }
}

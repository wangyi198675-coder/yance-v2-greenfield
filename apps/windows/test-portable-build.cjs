const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const src=fs.readFileSync(path.join(__dirname,'generate-sbom.cjs'),'utf8');
test('SBOM no developer hard-coded C drive profile or device',()=>{
  assert.doesNotMatch(src,/C:\\\\Users\\\\1|DESKTOP-029FH47/i);
  assert.match(src,/CARGO_HOME/);
  assert.match(src,/os\.homedir\(\)/);
});
test('SBOM refuses nonabsolute Cargo home without developer fallback',()=>{
  const result=spawnSync(process.execPath,['generate-sbom.cjs'],{
    cwd:__dirname,encoding:'utf8',env:{...process.env,CARGO_HOME:'relative-cargo-cache'}
  });
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/CARGO_HOME_MUST_BE_AN_ABSOLUTE_CURRENT_USER_PATH/);
});
test('Tauri candidate strictly current Windows user and base packaging disabled',()=>{
  const base=JSON.parse(fs.readFileSync(path.join(__dirname,'src-tauri','tauri.conf.json')));
  const override=JSON.parse(fs.readFileSync(path.join(__dirname,'src-tauri','tauri.installer-candidate.conf.json')));
  assert.equal(base.bundle.active,false);
  assert.equal(override.bundle.windows.nsis.installMode,'currentUser');
  assert.deepEqual(override.bundle.targets,['nsis']);
});

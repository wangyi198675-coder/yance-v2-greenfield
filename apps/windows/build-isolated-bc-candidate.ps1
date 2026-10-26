param(
  [string]$JoinRoot = 'C:\Users\1\Documents\YanceV2\Worktrees\W09_2_ISSUE61_LATEST_OWNER_JOIN_20261026',
  [string]$TauriCli = 'C:\Users\1\AppData\Local\YanceV2_W54_Isolated_Tauri_CLI\node_modules\.bin\tauri.cmd'
)
$ErrorActionPreference='Stop'
$Expected='894c25643cdde8af2307c8d8396dad96c39471eb'
$AppRoot=Split-Path -Parent $MyInvocation.MyCommand.Path
if(!(Test-Path $JoinRoot)){throw 'W09_JOIN_NOT_FOUND'}
$Head=(& git -C $JoinRoot rev-parse HEAD).Trim()
if($Head -ne $Expected){throw "W09_JOIN_EXACT_SHA_REQUIRED $Head"}
$Source=Join-Path $JoinRoot 'apps\web\.w46-test-dist'
$Version=Join-Path $Source 'version.json'
if(!(Test-Path $Version)){throw 'W09_BC_BUILT_DIST_MISSING'}
$Meta=Get-Content $Version -Raw|ConvertFrom-Json
if($Meta.source_sha -ne $Expected -or $Meta.api_source_sha -ne $Expected -or $Meta.canSend -ne $false -or $Meta.trustedSession -ne $false){throw 'W09_BC_BUILT_SHA_OR_AUTH_INVALID'}
if(!(Test-Path (Join-Path $Source 'index.html'))){throw 'B_C_INDEX_MISSING'}
$SourceIndex=Get-Content (Join-Path $Source 'index.html') -Raw
if($SourceIndex -notmatch 'assets/index-[A-Za-z0-9_-]+\.js'){throw 'B_C_HASHED_BUNDLE_ENTRY_MISSING'}
$Destination=Join-Path $AppRoot 'renderer-bc'
if(Test-Path $Destination){Remove-Item $Destination -Recurse -Force}
New-Item -Path $Destination -ItemType Directory|Out-Null
Copy-Item (Join-Path $Source '*') $Destination -Recurse -Force
# Preserve signed B+C JS/CSS and W46 guard exactly. Only this W54 packaged
# index gains Tauri's internal IPC destination so existing restricted native
# status/logout calls are not blocked by the original web-only meta CSP.
$IndexPath=Join-Path $Destination 'index.html'
$Index=[IO.File]::ReadAllText($IndexPath)
$BeforeCsp="connect-src 'self';"
if(([regex]::Matches($Index,[regex]::Escape($BeforeCsp))).Count -ne 1){
  throw 'W54_BC_EXPECTED_SINGLE_WEB_ONLY_CSP_REQUIRED'
}
$Index=$Index.Replace($BeforeCsp,"connect-src 'self' http://ipc.localhost;")
[IO.File]::WriteAllText($IndexPath,$Index,(New-Object Text.UTF8Encoding($false)))
$Verified=Get-Content (Join-Path $Destination 'version.json') -Raw|ConvertFrom-Json
if($Verified.source_sha -ne $Expected){throw 'B_C_STAGED_COPY_SHA_MISMATCH'}
$Files=Get-ChildItem $Destination -File -Recurse|Sort-Object FullName
$Manifest=$Files|ForEach-Object {
  $Rel=$_.FullName.Substring($Destination.Length+1).Replace('\','/')
  $Hasher=[Security.Cryptography.SHA256]::Create();try{$Hash=$Hasher.ComputeHash([IO.File]::ReadAllBytes($_.FullName))}finally{$Hasher.Dispose()}
  [pscustomobject]@{path=$Rel;sha256=([BitConverter]::ToString($Hash)).Replace('-','').ToLowerInvariant()}
}
$Manifest|ConvertTo-Json -Depth 4|Set-Content (Join-Path $Destination 'BUNDLED_W09_ASSET_SHA256.json') -Encoding UTF8
if(!(Test-Path $TauriCli)){throw 'OFFICIAL_TAURI_CLI_MISSING'}
$env:PATH="$env:USERPROFILE\.cargo\bin;"+$env:PATH
$env:CARGO_NET_OFFLINE='false'
$env:YANCE_W54_BC_LOOPBACK_ASSETS='1'
Remove-Item Env:\YANCE_W54_SIGNED_W47_SHA256 -ErrorAction SilentlyContinue
Push-Location $AppRoot
try {
  $ErrorActionPreference='Continue'
  & $TauriCli build --config src-tauri/tauri.bc-candidate.conf.json --bundles nsis --ci
  if($LASTEXITCODE -ne 0){throw "TAURI_BC_NSIS_BUILD_FAILED $LASTEXITCODE"}
}finally{Pop-Location;Remove-Item Env:\YANCE_W54_BC_LOOPBACK_ASSETS -ErrorAction SilentlyContinue}
Write-Output ('B_C_NATIVE_BUNDLE_SOURCE='+$Expected)
Write-Output ('B_C_ASSET_COUNT='+$Files.Count)
Write-Output 'SIGNED_W47_NATIVE_CHILD=NOT_BUNDLED_NO_TRUSTED_SESSION'

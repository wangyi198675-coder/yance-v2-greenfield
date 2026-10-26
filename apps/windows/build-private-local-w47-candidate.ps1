param(
 [string]$JoinRoot='C:\Users\1\Documents\YanceV2\Worktrees\W09_2_ISSUE61_NATIVE_WEBVIEW_W47_JOIN_20261026',
 [string]$TauriCli='C:\Users\1\AppData\Local\YanceV2_W54_Isolated_Tauri_CLI\node_modules\.bin\tauri.cmd'
)
$ErrorActionPreference='Stop'
$Expected='e352180cba665b56b35822fa2aff2c7525360016'
$AppRoot=Split-Path -Parent $MyInvocation.MyCommand.Path
if((& git -C $JoinRoot rev-parse HEAD).Trim() -ne $Expected){throw 'JOIN_E352_EXACT_SHA_REQUIRED'}
$WebSrc=Join-Path $JoinRoot 'apps\web\.w46-test-dist'
$v=(Get-Content (Join-Path $WebSrc 'version.json') -Raw|ConvertFrom-Json)
if($v.source_sha -ne $Expected -or $v.api_source_sha -ne $Expected -or
 $v.trustedSession -ne $false -or $v.canSend -ne $false){throw 'SIGNED_E352_WEB_REQUIRED'}
$Root=Join-Path $AppRoot 'runtime-bundle\w47'
if(Test-Path $Root){Remove-Item $Root -Recurse -Force}
$Runtime=Join-Path $Root 'runtime'
$Web=Join-Path $Root 'web'
New-Item $Runtime -ItemType Directory -Force|Out-Null
New-Item $Web -ItemType Directory -Force|Out-Null
$NodeExe=(Get-Command node.exe -ErrorAction Stop).Source
Copy-Item $NodeExe (Join-Path $Root 'node.exe')
# Original W47 owner runtime only. Do not invent API, Agent, or auth.
$ApiSrc=Join-Path $JoinRoot 'services\api\runtime'
Copy-Item (Join-Path $ApiSrc '*.mjs') $Runtime
$build=('{'+ '"format":1,"product":"YanceV2","source_sha":"' + $Expected +'"}')
[IO.File]::WriteAllText((Join-Path $Runtime 'runtime-build.json'),$build,(New-Object Text.UTF8Encoding($false)))
Copy-Item (Join-Path $WebSrc '*') $Web -Recurse
$Files=Get-ChildItem $Web -File -Recurse|Where-Object {
  $_.Name -notmatch '^BUNDLED_W09_ASSET_SHA256'
}|Sort-Object FullName
function Sha256([string]$File){
 $algo=[Security.Cryptography.SHA256]::Create()
 try{ $b=$algo.ComputeHash([IO.File]::ReadAllBytes($File))
   return ([BitConverter]::ToString($b)).Replace('-','').ToLowerInvariant()
 }finally{$algo.Dispose()}
}
$entry=@($Files | ForEach-Object {
 $rel=$_.FullName.Substring($Web.Length+1).Replace('\','/')
 if($rel -ne 'index.html' -and $rel -ne 'version.json' -and
    $rel -notmatch '^assets/[A-Za-z0-9_-]+\.(?:js|css|png|svg|woff2|ico)$'){
    throw ('UNSUPPORTED_W47_NATIVE_WEB_RESOURCE_'+$rel)
 }
 @{path=$rel;sha256=(Sha256 $_.FullName);bytes=[long]$_.Length}
})
$manifest=@{format=1;product='YanceV2NativeWeb';sourceSha=$Expected;files=$entry}|
 ConvertTo-Json -Depth 6 -Compress
$manifestFile=Join-Path $Root 'web-manifest.json'
[IO.File]::WriteAllText($manifestFile,$manifest,(New-Object Text.UTF8Encoding($false)))
$server=Join-Path $Runtime 'server.mjs'
$ServerSha=Sha256 $server
$ManifestSha=Sha256 $manifestFile
$NodeSha=Sha256 (Join-Path $Root 'node.exe')
Write-Output ('W47_ORIGINAL_SHA='+$Expected)
Write-Output ('W47_SERVER_SHA256='+$ServerSha)
Write-Output ('W47_WEB_MANIFEST_SHA256='+$ManifestSha)
Write-Output ('W47_NODE_SHA256='+$NodeSha)
Write-Output ('W47_WEB_ASSET_COUNT='+$entry.Count)
# Preserve original built JS/CSS, do not copy V1.
$Renderer=Join-Path $AppRoot 'renderer-bc'
if(Test-Path $Renderer){Remove-Item $Renderer -Recurse -Force}
New-Item $Renderer -ItemType Directory|Out-Null
Copy-Item (Join-Path $WebSrc '*') $Renderer -Recurse
# Existing e352 W46 CSP is authoritative. No localhost static plugin in
# this W47-backed build: the child itself serves BOTH API and Vue same-origin.
$cfgPath=Join-Path $AppRoot 'src-tauri\tauri.bc-candidate.conf.json'
$cfg=Get-Content $cfgPath -Raw -Encoding UTF8|ConvertFrom-Json
$cfg.bundle|Add-Member -NotePropertyName resources -NotePropertyValue @{
 '../runtime-bundle/w47'='w47'
} -Force
[IO.File]::WriteAllText($cfgPath,($cfg|ConvertTo-Json -Depth 25),
 (New-Object Text.UTF8Encoding($false)))
if(!(Test-Path $TauriCli)){throw 'OFFICIAL_TAURI_CLI_MISSING'}
$env:PATH="$env:USERPROFILE\.cargo\bin;"+$env:PATH
$env:YANCE_W54_BUNDLED_W47_SOURCE_SHA=$Expected
$env:YANCE_W54_BUNDLED_W47_SERVER_SHA256=$ServerSha
$env:YANCE_W54_BUNDLED_W47_MANIFEST_SHA256=$ManifestSha
Remove-Item Env:\YANCE_W54_BC_LOOPBACK_ASSETS -ErrorAction SilentlyContinue
Remove-Item Env:\YANCE_W54_SIGNED_W47_SHA256 -ErrorAction SilentlyContinue
Push-Location $AppRoot
try {
 $ErrorActionPreference='Continue'
 & $TauriCli build --config src-tauri/tauri.bc-candidate.conf.json --bundles nsis --ci
 if($LASTEXITCODE -ne 0){throw ('TAURI_W47_BUILD_FAILED_'+$LASTEXITCODE)}
}finally{
 Pop-Location
 Remove-Item Env:\YANCE_W54_BUNDLED_W47_SOURCE_SHA -ErrorAction SilentlyContinue
 Remove-Item Env:\YANCE_W54_BUNDLED_W47_SERVER_SHA256 -ErrorAction SilentlyContinue
 Remove-Item Env:\YANCE_W54_BUNDLED_W47_MANIFEST_SHA256 -ErrorAction SilentlyContinue
}
Write-Output 'W54_W47_SAME_ORIGIN_BUILDER_DONE_NO_TERMINAL_PAIR'

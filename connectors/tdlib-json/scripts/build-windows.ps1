# Real OFFICIAL TDLib/tdjson.dll build. Isolated W29 nonproduction.
# Prerequisites: MSVC BuildTools 2022, official TDLib source and vcpkg
# already fetched/pinned by W29 setup. NEVER reads any Telegram account.
param([switch]$SkipDependencyInstall)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$buildRoot = Join-Path $root ".native-build"
$td = Join-Path $buildRoot "official-td"
$vcpkg = Join-Path $buildRoot "vcpkg"
$nativeBuild = Join-Path $buildRoot "tdlib-cmake"
$runtime = Join-Path $root "runtime"
$shaSource = "ea3f69ce11aef458bfbb09869b809ede4447486f"
$version = "1.8.69"
$cmake = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$env:VCPKG_DISABLE_METRICS = "1"
$pin = (& git -C $td rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $pin -ne $shaSource) {throw "OFFICIAL_TDLIB_PIN_MISMATCH"}
if (!(Test-Path $cmake)) {throw "OFFICIAL_CMAKE_MISSING"}
if (!(Test-Path $csc)) {throw "WINDOWS_NATIVE_INTEROP_COMPILER_MISSING"}
if (!(Test-Path (Join-Path $vcpkg "scripts\buildsystems\vcpkg.cmake"))) {throw "OFFICIAL_VCPKG_TOOLCHAIN_MISSING"}
New-Item -Force -ItemType Directory -Path $runtime | Out-Null
if (!$SkipDependencyInstall) {
  & (Join-Path $vcpkg "vcpkg.exe") install "openssl:x64-windows" "zlib:x64-windows" "gperf:x64-windows" --triplet x64-windows
  if ($LASTEXITCODE -ne 0) {throw "OFFICIAL_DEPENDENCY_INSTALL_FAILED"}
}
& $cmake -S $td -B $nativeBuild -G "Visual Studio 17 2022" -A x64 "-DCMAKE_TOOLCHAIN_FILE=$vcpkg\scripts\buildsystems\vcpkg.cmake" "-DVCPKG_TARGET_TRIPLET=x64-windows" "-DTD_ENABLE_JNI=OFF" "-DTD_INSTALL_STATIC_LIBRARIES=OFF" "-DTD_INSTALL_SHARED_LIBRARIES=ON" "-DTD_ENABLE_DOTNET=OFF" "-DTD_ENABLE_PCH=ON" "-DTD_ENABLE_MULTI_PROCESSOR_COMPILATION=ON"
if ($LASTEXITCODE -ne 0) {throw "OFFICIAL_TDLIB_CONFIGURE_FAILED"}
& $cmake --build $nativeBuild --config Release --target tdjson --parallel 4
if ($LASTEXITCODE -ne 0) {throw "OFFICIAL_TDLIB_COMPILE_FAILED"}
$found = @(Get-ChildItem -LiteralPath $nativeBuild -Recurse -File -Filter tdjson.dll -ErrorAction SilentlyContinue | Where-Object {$_.FullName -match "[\\/]Release[\\/]"})
if ($found.Count -ne 1) {throw ("EXPECTED_ONE_RELEASE_TDJSON_FOUND_"+$found.Count)}
Copy-Item $found[0].FullName (Join-Path $runtime "tdjson.dll") -Force

# Transitive DLLs are copied beside the TDLib official native host.
$deps = @()
$bin = Join-Path $vcpkg "installed\x64-windows\bin"
foreach ($filename in @("libcrypto-3-x64.dll","libssl-3-x64.dll","z.dll","zlib1.dll")) {
  $from = Join-Path $bin $filename
  if (Test-Path -LiteralPath $from) {
    Copy-Item -LiteralPath $from -Destination (Join-Path $runtime $filename) -Force
    $deps += $filename
  }
}
$exe = Join-Path $runtime "TDJsonHost.exe"
& $csc /nologo /target:exe /platform:x64 /r:System.Web.Extensions.dll ("/out:"+$exe) (Join-Path $root "native\TDJsonHost.cs")
if ($LASTEXITCODE -ne 0) {throw "NATIVE_HOST_BUILD_FAILED"}
function HashFile($path) {
  $hash = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($hash.ComputeHash([IO.File]::ReadAllBytes($path)))).Replace("-","").ToLowerInvariant() }
  finally { $hash.Dispose() }
}
$license = HashFile (Join-Path $td "LICENSE_1_0.txt")
if ($license -ne "beb8e42e9d6b4284e03304d05a81a0755200a965fc8d0a5e0aea1e84cf805d6e") {
  throw "OFFICIAL_BSL_LICENSE_MISMATCH"
}
$manifest = [ordered]@{
  sourceGit = "https://github.com/tdlib/td.git"
  sourceCommit = $pin
  sourceVersion = $version
  license = "BSL-1.0"
  licenseSha256 = $license
  architecture = "x64"
  dllSha256 = HashFile (Join-Path $runtime "tdjson.dll")
  hostSha256 = HashFile $exe
  compiler = "Microsoft Visual Studio 2022 BuildTools, Release x64"
  vcpkgSourceCommit = (& git -C $vcpkg rev-parse HEAD).Trim()
  buildSystem = "CMake/MSVC"
  dependencies = @($deps | ForEach-Object { [ordered]@{ name=$_; sha256=HashFile (Join-Path $runtime $_) } })
  accountAuthenticated = $false
  simulated = $false
  realProviderConnected = $false
  nativeAbiProof = "PENDING_SEPARATE_TD_EXECUTE_CHECK"
}
$manifestPath = Join-Path $runtime "tdjson-native-manifest.json"
[IO.File]::WriteAllText($manifestPath,($manifest|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
Write-Output "TDJSON_NATIVE_MANIFEST_READY"
Write-Output ("OFFICIAL_SOURCE_SHA="+$pin)
Write-Output ("TDJSON_DLL_SHA256="+$manifest.dllSha256)
Write-Output ("HOST_EXE_SHA256="+$manifest.hostSha256)
Write-Output ("MANIFEST="+$manifestPath)
Write-Output "NO_LOGIN_NO_SEND_NO_DEPLOY"

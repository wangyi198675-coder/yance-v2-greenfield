# Read only: sealed current-user DPAPI payload, no logging/console diagnostics.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$path=Join-Path $env:LOCALAPPDATA 'YanceV2\FBPersonal\internal\w56-matrix-session.dpapi'
$blob=[IO.File]::ReadAllBytes($path)
if($blob.Length -gt 16384 -or $blob.Length -lt 32){throw 'Invalid protected session'}
$plain=[Security.Cryptography.ProtectedData]::Unprotect($blob,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
try{
  $text=[Text.Encoding]::UTF8.GetString($plain)
  $data=ConvertFrom-Json $text
  if($data.v -ne 1 -or $data.user_id -ne '@w56_internal_fb_bridge:yance-w26.invalid'){throw 'Wrong protected session'}
  @{user_id=[string]$data.user_id;access_token=[string]$data.access_token}|ConvertTo-Json -Compress
}finally{
  [Array]::Clear($plain,0,$plain.Length)
}

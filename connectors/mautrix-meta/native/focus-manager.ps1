# W26: bring the already installed/upstream mautrix-manager GUI to foreground.
# NO social auth, no token/Matrix credential access, and no direct messenger sends.
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class W26NativeWindow {
 [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd,int nCmdShow);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
$manager = $null
for($i=0;$i -lt 9;$i++){
  $manager = Get-Process -Name 'mautrix-manager' -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } |
    Select-Object -First 1
  if($manager){break}
  Start-Sleep -Milliseconds 200
}
if(-not $manager){Write-Output 'GUI_WINDOW_NOT_READY';exit 3}
[void][W26NativeWindow]::ShowWindowAsync($manager.MainWindowHandle,9)
# Windows often refuses foreground focus to a background local HTTP service.
# This is an OS decision: report it accurately instead of faking GUI focus.
$focused=[W26NativeWindow]::SetForegroundWindow($manager.MainWindowHandle)
Start-Sleep -Milliseconds 120
if($focused -and [W26NativeWindow]::GetForegroundWindow() -eq $manager.MainWindowHandle){
  Write-Output 'OFFICIAL_MANAGER_FOREGROUND_VERIFIED'
}else{
  Write-Output 'OFFICIAL_MANAGER_RUNNING_BACKGROUND'
}

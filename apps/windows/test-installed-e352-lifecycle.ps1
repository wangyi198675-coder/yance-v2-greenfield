param([Parameter(Mandatory=$true)][string]$InstalledExe)
$ErrorActionPreference='Stop'
if(!(Test-Path $InstalledExe)){throw 'W54_INSTALLED_EXE_NOT_FOUND'}
$State=Join-Path $env:LOCALAPPDATA 'com.yance.v2.bc-isolated-candidate\data\w54-native-binding.state'
$InstallDirName=Split-Path -Leaf (Split-Path -Parent $InstalledExe)
function Epoch {
 if(!(Test-Path $State)){return 0L}
 return [long]([IO.File]::ReadAllLines($State))[2]
}
$results=@()
foreach($n in 1..2){
 $before=Epoch
 $app=Start-Process $InstalledExe -PassThru
 $window=0L
 $childId=0
 for($i=0;$i -lt 60;$i++){
  Start-Sleep -Milliseconds 150
  $app.Refresh()
  if($app.HasExited){throw ('W54_INSTALLED_APP_EXITED_EARLY_'+$app.ExitCode)}
  $window=[long]$app.MainWindowHandle
  $children=@(Get-CimInstance Win32_Process -Filter "name='node.exe'" |
    Where-Object {$_.ParentProcessId -eq $app.Id -and $_.ExecutablePath -like "*$InstallDirName*"})
  if($window -ne 0 -and $children.Count -ge 1){$childId=[int]$children[0].ProcessId;break}
 }
 if($window -eq 0 -or $childId -le 0){throw ('W54_NO_REAL_WINDOW_OR_W47_CHILD_PID_'+$app.Id)}
 # Wait for the real WebView2 to reach interactive state. CloseMainWindow
 # immediately on HWND creation can race the native window initialization
 # and produce a false-negative WM_CLOSE observation.
 Start-Sleep -Milliseconds 2400
 $app.Refresh()
 if($app.HasExited){throw 'APP_EXITED_BEFORE_WINDOW_INTERACTIVE'}
 $boot=Epoch
 $closed=$app.CloseMainWindow()
 if(!$closed){throw 'W54_WINDOW_CLOSE_FAILED'}
 if(!$app.WaitForExit(7000)){throw 'W54_APP_EXIT_TIMEOUT'}
 Start-Sleep -Milliseconds 500
 $childStill=Get-Process -Id $childId -ErrorAction SilentlyContinue
 $after=Epoch
 $pass=$boot -eq ($before+1) -and $after -eq ($boot+1) -and !$childStill
 $results+=@{run=$n;appPid=$app.Id;childPid=$childId;nativeWindow=$window;
  beforeEpoch=$before;bootEpoch=$boot;exitEpoch=$after;
  realW47Reaped=(!$childStill);pass=$pass}
 if(!$pass){throw ('W54_LIFECYCLE_FAILED_'+($results|ConvertTo-Json -Compress))}
}
$results|ConvertTo-Json -Depth 4

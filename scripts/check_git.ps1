# Read-only Git diagnostic
$ErrorActionPreference='Continue';$failed=$false
function R($s,$m){Write-Host "$s $m"}
$c=Get-Command git -ErrorAction SilentlyContinue
if($c){R PASS "git command: $($c.Source)";& git --version}else{R FAIL 'git unavailable. Install Git for Windows or add C:\Program Files\Git\cmd to PATH, then reopen PowerShell.';$failed=$true}
$w=& where.exe git 2>$null;if($LASTEXITCODE -eq 0){R PASS "where.exe git: $($w -join '; ')"}else{R WARN 'where.exe did not resolve Git from PATH.'}
$paths=@('C:\Program Files\Git\cmd\git.exe','C:\Program Files\Git\bin\git.exe')
$d=Join-Path $env:LOCALAPPDATA 'GitHubDesktop';if(Test-Path $d){$paths+=Get-ChildItem $d -Recurse -Filter git.exe -ErrorAction SilentlyContinue|Select-Object -Expand FullName}
foreach($p in $paths|Select-Object -Unique){if(Test-Path $p){R PASS "Found: $p"}else{R WARN "Not found: $p"}}
if($failed){exit 1}else{exit 0}

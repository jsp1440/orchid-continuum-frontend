# Read-only diagnostic runner. No installs, deletes, auth changes, or repository writes.
$ErrorActionPreference='Continue'
$failures=0
foreach($name in @('check_git.ps1','check_github_auth.ps1','check_node.ps1','check_python.ps1','check_google_drive.ps1')) {
  Write-Host "`n===== $name ====="
  $path=Join-Path $PSScriptRoot $name
  if(Test-Path $path){ & $path; if($LASTEXITCODE -ne 0){$failures++} } else {Write-Host "FAIL Missing $path";$failures++}
}
if($failures -eq 0){Write-Host "`nPASS Complete environment check finished without material failures.";exit 0}
Write-Host "`nFAIL $failures component check(s) failed. See docs/Troubleshooting_Common_Failures.md.";exit 1

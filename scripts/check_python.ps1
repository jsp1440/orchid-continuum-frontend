# Read-only Python availability check
$ErrorActionPreference='Continue'
$found=$false
$py=Get-Command py -ErrorAction SilentlyContinue
if($py){Write-Host "PASS py $(& py --version 2>&1)";$found=$true}else{Write-Host 'WARN py launcher not found.'}
$python=Get-Command python -ErrorAction SilentlyContinue
if($python){Write-Host "PASS python $(& python --version 2>&1)";$found=$true}else{Write-Host 'WARN python command not found.'}
if($found){exit 0}
Write-Host 'FAIL Python is unavailable. Install Python 3 and open a new PowerShell session.'
exit 1

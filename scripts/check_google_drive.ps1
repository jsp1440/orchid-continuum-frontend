# Read-only Google Drive workflow diagnostic
$ErrorActionPreference='Continue'
$found=$false
$paths=@()
if($env:GoogleDrive){$paths+=$env:GoogleDrive}
$paths+='G:\My Drive';$paths+='G:\Shared drives';$paths+=(Join-Path $env:USERPROFILE 'Google Drive')
foreach($p in $paths|Select-Object -Unique){if(Test-Path $p){Write-Host "PASS Google Drive location found: $p";$found=$true}else{Write-Host "WARN Not found: $p"}}
$edge=Get-Command msedge -ErrorAction SilentlyContinue
if($edge){Write-Host "PASS Browser command available: $($edge.Source)"}else{Write-Host 'WARN Browser command not detected; browser Drive may still be available.'}
if(-not $found){Write-Host 'WARN No common Drive mount detected. Confirm Drive for desktop sign-in or use browser workflow; this cannot verify private-folder permissions.'}
exit 0

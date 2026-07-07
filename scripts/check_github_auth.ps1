# Read-only GitHub authentication diagnostic
$ErrorActionPreference='Continue'
function R($s,$m){Write-Host "$s $m"}
$c=Get-Command gh -ErrorAction SilentlyContinue
if(-not $c){R WARN 'gh unavailable. Install GitHub CLI, or use HTTPS Git plus browser PR creation; see docs/GitHub_Authentication.md.';exit 0}
R PASS "gh command: $($c.Source)";& gh --version
& gh auth status 2>&1|ForEach-Object{Write-Host $_}
if($LASTEXITCODE -eq 0){R PASS 'GitHub CLI authentication active.';exit 0}
R FAIL 'GitHub CLI is not authenticated. Run: gh auth login';exit 1

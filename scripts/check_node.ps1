# Read-only Node/frontend diagnostic
$ErrorActionPreference='Continue';$failed=$false
function R($s,$m){Write-Host "$s $m"}
foreach($t in @('node','npm','pnpm')){$c=Get-Command $t -ErrorAction SilentlyContinue;if($c){R PASS "$t $(& $t --version 2>$null) ($($c.Source))"}elseif($t -eq 'pnpm'){R WARN 'pnpm unavailable. Enable Corepack or install pnpm.'}else{R FAIL "$t unavailable. Install Node LTS and reopen PowerShell.";$failed=$true}}
$root=Split-Path -Parent $PSScriptRoot;if(Test-Path (Join-Path $root 'package.json')){R PASS 'package.json found'}else{R WARN 'package.json not found; run from frontend checkout.'}
$locks=@('pnpm-lock.yaml','package-lock.json','yarn.lock')|ForEach-Object{Join-Path $root $_}|Where-Object{Test-Path $_};if($locks){R PASS "Lockfile(s): $($locks -join '; ')"}else{R WARN 'No lockfile found; do not guess package manager.'}
$bin=Join-Path $root 'node_modules\.bin';foreach($t in @('tsc.cmd','vite.cmd','esbuild.cmd')){if(Test-Path (Join-Path $bin $t)){R PASS "Local $t available"}else{R WARN "Local $t not detected; install approved dependencies before build validation."}}
if($failed){exit 1}else{exit 0}

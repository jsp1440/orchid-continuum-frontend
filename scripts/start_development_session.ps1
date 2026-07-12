Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

function Invoke-CheckScript {
    param([string] $RelativePath)

    $scriptPath = Join-Path $PSScriptRoot $RelativePath
    if (-not (Test-Path $scriptPath)) {
        Write-Output ("WARN missing script - {0}" -f $scriptPath)
        Write-Output "     Manual action: Confirm BUILD-INFRA-002 scripts are present."
        return
    }

    try {
        & $scriptPath
    }
    catch {
        Write-Output ("WARN check failed - {0}" -f $_.Exception.Message)
        Write-Output ("     Manual action: Run {0} directly for detailed diagnostics." -f $scriptPath)
    }
}

Write-Output "ORCHID CONTINUUM DEVELOPMENT WORKSPACE"
Write-Output "======================================"
Write-Output ("Generated: {0}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"))
Write-Output ""

Write-Output "Environment:"
Invoke-CheckScript "check_workspace.ps1"
Write-Output ""

Write-Output "Repositories:"
Invoke-CheckScript "check_repositories.ps1"
Write-Output ""

Write-Output "Branches:"
Invoke-CheckScript "check_branches.ps1"
Write-Output ""

Write-Output "Pull Requests:"
Invoke-CheckScript "check_pull_requests.ps1"
Write-Output ""

Write-Output "Deployments:"
Invoke-CheckScript "check_deployments.ps1"
Write-Output ""

Write-Output "Known Issues:"
Write-Output "- Review docs/Known_Issues.md for current blockers and durable environment limitations."
Write-Output "- Review docs/Build_Registry.md for active builds, PR state, merge state, and deployment notes."
Write-Output "- Review the current PR list before starting overlapping work."
Write-Output "- Treat this session report as the current workspace snapshot and update docs when it reveals new durable issues."
Write-Output ""

Write-Output "Next Actions:"
Write-Output "Recommended next single development action: run this script at the start of each Codex session, then update docs/Build_Registry.md and docs/Known_Issues.md with any newly discovered state before starting feature work."

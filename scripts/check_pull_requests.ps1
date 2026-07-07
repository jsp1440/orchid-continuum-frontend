Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$Repositories = @(
    "jsp1440/orchid-continuum-frontend",
    "jsp1440/orchid-calyx-backend",
    "jsp1440/orchid-continuum-architecture"
)

function Write-CheckStatus {
    param(
        [ValidateSet("PASS", "WARN", "FAIL")]
        [string] $Status,
        [string] $Name,
        [string] $Message,
        [string] $ManualAction = ""
    )

    Write-Output ("{0,-4} {1} - {2}" -f $Status, $Name, $Message)
    if ($ManualAction) {
        Write-Output ("     Manual action: {0}" -f $ManualAction)
    }
}

Write-Output "Pull Requests"
Write-Output "-------------"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-CheckStatus -Status "WARN" -Name "GitHub CLI" -Message "not available; PR checks skipped." -ManualAction "Install gh, run gh auth login, then rerun this script."
    exit 0
}

foreach ($repo in $Repositories) {
    try {
        $json = & gh pr list --repo $repo --state open --limit 20 --json number,title,isDraft,mergeStateStatus,updatedAt,headRefName 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-CheckStatus -Status "WARN" -Name $repo -Message "open PRs could not be read." -ManualAction "Verify repository access and gh authentication."
            continue
        }

        $prs = $json | ConvertFrom-Json
        if (-not $prs -or $prs.Count -eq 0) {
            Write-CheckStatus -Status "PASS" -Name $repo -Message "no open PRs."
            continue
        }

        Write-CheckStatus -Status "WARN" -Name $repo -Message ("{0} open PR(s)." -f $prs.Count) -ManualAction "Review open PRs before starting overlapping work."
        foreach ($pr in $prs) {
            $draft = if ($pr.isDraft) { "draft" } else { "ready" }
            Write-Output ("     #{0} [{1}] {2} ({3}, updated {4})" -f $pr.number, $draft, $pr.title, $pr.mergeStateStatus, $pr.updatedAt)
        }
    }
    catch {
        Write-CheckStatus -Status "WARN" -Name $repo -Message $_.Exception.Message -ManualAction "Check PRs in GitHub manually."
    }
}

Write-Output ""
Write-Output "Recent merged PRs require manual review if gh cannot access the repository timeline."

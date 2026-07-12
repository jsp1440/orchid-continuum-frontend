Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$Repositories = @(
    @{ Name = "frontend"; Remote = "jsp1440/orchid-continuum-frontend"; Required = $true },
    @{ Name = "backend"; Remote = "jsp1440/orchid-calyx-backend"; Required = $false },
    @{ Name = "architecture"; Remote = "jsp1440/orchid-continuum-architecture"; Required = $false }
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

Write-Output "Architecture Repository Access"
Write-Output "------------------------------"

$gh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $gh) {
    Write-CheckStatus -Status "WARN" -Name "GitHub CLI" -Message "gh is not available; repository access checks are limited." -ManualAction "Install gh and run gh auth status, or verify repositories in GitHub manually."
    foreach ($repo in $Repositories) {
        Write-CheckStatus -Status "WARN" -Name $repo.Name -Message ("skipped GitHub access check for {0}." -f $repo.Remote) -ManualAction ("Open https://github.com/{0} in a browser or use an authenticated GitHub connector." -f $repo.Remote)
    }
    exit 0
}

try {
    $authOutput = & gh auth status 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-CheckStatus -Status "PASS" -Name "GitHub authentication" -Message "gh reports an authenticated session."
    }
    else {
        Write-CheckStatus -Status "WARN" -Name "GitHub authentication" -Message "gh is installed but authentication was not confirmed." -ManualAction "Run gh auth status manually; run gh auth login only if Jeff approves authentication changes."
    }
}
catch {
    Write-CheckStatus -Status "WARN" -Name "GitHub authentication" -Message $_.Exception.Message -ManualAction "Run gh auth status manually."
}

foreach ($repo in $Repositories) {
    try {
        $result = & gh repo view $repo.Remote --json nameWithOwner,defaultBranchRef,visibility 2>&1
        if ($LASTEXITCODE -eq 0 -and $result) {
            $info = $result | ConvertFrom-Json
            Write-CheckStatus -Status "PASS" -Name $repo.Name -Message ("{0} visible; default branch {1}; visibility {2}" -f $info.nameWithOwner, $info.defaultBranchRef.name, $info.visibility)
        }
        else {
            $manual = if ($repo.Name -eq "architecture") {
                "Verify repository existence, exact owner/name, and connector or gh permissions. Treat as WARN until resolved."
            }
            else {
                "Verify repository access and exact owner/name in GitHub."
            }
            Write-CheckStatus -Status "WARN" -Name $repo.Name -Message ("could not verify {0}." -f $repo.Remote) -ManualAction $manual
            $result | ForEach-Object { Write-Output ("     {0}" -f $_) }
        }
    }
    catch {
        Write-CheckStatus -Status "WARN" -Name $repo.Name -Message $_.Exception.Message -ManualAction ("Verify {0} manually." -f $repo.Remote)
    }
}

Write-Output ""
Write-Output "This script is read-only. It does not authenticate, clone, push, create repositories, or modify files."

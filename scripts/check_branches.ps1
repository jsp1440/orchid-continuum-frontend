Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$Repositories = @(
    @{ Name = "frontend"; ExpectedDirectory = "orchid-continuum-frontend" },
    @{ Name = "backend"; ExpectedDirectory = "orchid-calyx-backend" },
    @{ Name = "architecture"; ExpectedDirectory = "orchid-continuum-architecture" }
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

function Find-RepositoryPath {
    param([string] $ExpectedDirectory)

    $candidateRoots = @()
    if ($env:ORCHID_CONTINUUM_WORKSPACE) {
        $candidateRoots += $env:ORCHID_CONTINUUM_WORKSPACE
    }

    $candidateRoots += @(
        $PWD.Path,
        (Split-Path -Parent $PWD.Path),
        (Join-Path $env:USERPROFILE "OrchidContinuum"),
        (Join-Path $env:USERPROFILE "source\repos")
    )

    foreach ($root in $candidateRoots | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique) {
        try {
            $direct = Join-Path $root $ExpectedDirectory
            if (Test-Path $direct) {
                return (Resolve-Path $direct).Path
            }

            $oneLevel = Get-ChildItem -Path $root -Directory -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -eq $ExpectedDirectory } |
                Select-Object -First 1
            if ($oneLevel) {
                return $oneLevel.FullName
            }
        }
        catch {
            continue
        }
    }

    return $null
}

Write-Output "Branch State"
Write-Output "------------"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-CheckStatus -Status "WARN" -Name "Git" -Message "not available; branch checks skipped." -ManualAction "Add Git to PATH and rerun this script."
    exit 0
}

foreach ($repo in $Repositories) {
    $path = Find-RepositoryPath -ExpectedDirectory $repo.ExpectedDirectory
    if (-not $path) {
        Write-CheckStatus -Status "WARN" -Name $repo.Name -Message "local checkout not found." -ManualAction "Set ORCHID_CONTINUUM_WORKSPACE or open/clone the repository under a configured workspace root."
        continue
    }

    try {
        $branch = & git -C $path branch --show-current 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $branch) {
            Write-CheckStatus -Status "WARN" -Name $repo.Name -Message "could not determine current branch." -ManualAction "Run git status manually in the repository."
            continue
        }

        $porcelain = & git -C $path status --porcelain 2>$null
        $upstream = & git -C $path rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2>$null
        $aheadBehind = "upstream not configured"
        if ($LASTEXITCODE -eq 0 -and $upstream) {
            $counts = & git -C $path rev-list --left-right --count "$branch...$upstream" 2>$null
            if ($LASTEXITCODE -eq 0 -and $counts) {
                $parts = $counts -split "\s+"
                $aheadBehind = ("ahead {0}, behind {1}" -f $parts[0], $parts[1])
            }
        }

        if ($porcelain) {
            Write-CheckStatus -Status "WARN" -Name $repo.Name -Message ("branch {0}; uncommitted changes present; {1}" -f $branch, $aheadBehind) -ManualAction "Review git status before starting new build work."
        }
        else {
            Write-CheckStatus -Status "PASS" -Name $repo.Name -Message ("branch {0}; working tree clean; {1}" -f $branch, $aheadBehind)
        }
    }
    catch {
        Write-CheckStatus -Status "WARN" -Name $repo.Name -Message $_.Exception.Message -ManualAction "Inspect branch state manually."
    }
}

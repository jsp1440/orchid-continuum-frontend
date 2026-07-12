Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$Repositories = @(
    @{ Name = "frontend"; Remote = "jsp1440/orchid-continuum-frontend"; ExpectedDirectory = "orchid-continuum-frontend" },
    @{ Name = "backend"; Remote = "jsp1440/orchid-calyx-backend"; ExpectedDirectory = "orchid-calyx-backend" },
    @{ Name = "architecture"; Remote = "jsp1440/orchid-continuum-architecture"; ExpectedDirectory = "orchid-continuum-architecture" }
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

Write-Output "Repository Availability"
Write-Output "-----------------------"

$git = Get-Command git -ErrorAction SilentlyContinue
foreach ($repo in $Repositories) {
    $path = Find-RepositoryPath -ExpectedDirectory $repo.ExpectedDirectory
    if (-not $path) {
        Write-CheckStatus -Status "WARN" -Name $repo.Name -Message ("local checkout not found for {0}." -f $repo.Remote) -ManualAction ("Set ORCHID_CONTINUUM_WORKSPACE or open/clone {0} under a configured workspace root." -f $repo.Remote)
        continue
    }

    if (-not $git) {
        Write-CheckStatus -Status "WARN" -Name $repo.Name -Message ("found {0}, but Git is unavailable on PATH." -f $path) -ManualAction "Add Git to PATH, then rerun this script."
        continue
    }

    try {
        $inside = & git -C $path rev-parse --is-inside-work-tree 2>$null
        if ($LASTEXITCODE -ne 0 -or $inside -ne "true") {
            Write-CheckStatus -Status "WARN" -Name $repo.Name -Message ("{0} is not a Git worktree." -f $path) -ManualAction "Use a full clone rather than an exported source folder."
            continue
        }

        $remote = & git -C $path remote get-url origin 2>$null
        if ($LASTEXITCODE -eq 0 -and $remote -match [regex]::Escape($repo.Remote)) {
            Write-CheckStatus -Status "PASS" -Name $repo.Name -Message ("checkout found at {0}" -f $path)
        }
        else {
            Write-CheckStatus -Status "WARN" -Name $repo.Name -Message ("checkout found at {0}, but origin is {1}" -f $path, $remote) -ManualAction ("Verify this is the intended {0} repository." -f $repo.Remote)
        }
    }
    catch {
        Write-CheckStatus -Status "WARN" -Name $repo.Name -Message $_.Exception.Message -ManualAction "Inspect the checkout manually."
    }
}

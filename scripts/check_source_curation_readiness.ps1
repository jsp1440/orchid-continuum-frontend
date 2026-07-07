Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

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

function Get-CandidateSourceRoots {
    $roots = @()
    if ($env:ORCHID_SOURCE_STAGING) {
        $roots += $env:ORCHID_SOURCE_STAGING
    }
    if ($env:ORCHID_CONTINUUM_WORKSPACE) {
        $roots += (Join-Path $env:ORCHID_CONTINUUM_WORKSPACE "sources")
    }
    $roots += @(
        (Join-Path $env:USERPROFILE "OrchidContinuum\sources"),
        (Join-Path $env:USERPROFILE "source\repos\orchid-sources")
    )
    return $roots | Where-Object { $_ } | Select-Object -Unique
}

Write-Output "Source Curation Readiness"
Write-Output "-------------------------"

$candidateRoots = Get-CandidateSourceRoots
$existingRoot = $null
foreach ($root in $candidateRoots) {
    try {
        if (Test-Path $root -ErrorAction Stop) {
            $existingRoot = (Resolve-Path $root).Path
            break
        }
    }
    catch {
        continue
    }
}

if (-not $existingRoot) {
    Write-CheckStatus -Status "WARN" -Name "source staging root" -Message "no source-staging folder detected." -ManualAction "Set ORCHID_SOURCE_STAGING or create a reviewed source-staging folder outside application source directories."
    Write-Output "Checked candidate roots:"
    $candidateRoots | ForEach-Object { Write-Output ("     {0}" -f $_) }
    Write-Output ""
    Write-Output "This script is read-only and will not create folders."
    exit 0
}

Write-CheckStatus -Status "PASS" -Name "source staging root" -Message ("found {0}" -f $existingRoot)

$expectedFolders = @("incoming", "inventory", "curated", "deferred")
foreach ($folder in $expectedFolders) {
    $path = Join-Path $existingRoot $folder
    if (Test-Path $path) {
        Write-CheckStatus -Status "PASS" -Name $folder -Message ("folder exists at {0}" -f $path)
    }
    else {
        Write-CheckStatus -Status "WARN" -Name $folder -Message "folder not found." -ManualAction ("Create {0} when Jeff approves source-staging structure." -f $path)
    }
}

try {
    $sourceFiles = Get-ChildItem -Path $existingRoot -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch "\.git\" } |
        Select-Object -First 25
    if ($sourceFiles) {
        Write-CheckStatus -Status "PASS" -Name "source files" -Message ("found at least {0} file(s) for inventory review." -f $sourceFiles.Count)
        $sourceFiles | ForEach-Object { Write-Output ("     {0}" -f $_.FullName) }
    }
    else {
        Write-CheckStatus -Status "WARN" -Name "source files" -Message "no source files detected under staging root." -ManualAction "Place approved source files in the staging area before curation work begins."
    }
}
catch {
    Write-CheckStatus -Status "WARN" -Name "source files" -Message $_.Exception.Message -ManualAction "Inspect the source-staging folder manually."
}

Write-Output ""
Write-Output "This script is read-only. It does not create, copy, move, rename, edit, or delete source files."

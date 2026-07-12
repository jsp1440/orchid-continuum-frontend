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

    $line = "{0,-4} {1} - {2}" -f $Status, $Name, $Message
    Write-Output $line
    if ($ManualAction) {
        Write-Output ("     Manual action: {0}" -f $ManualAction)
    }
}

function Test-CommandAvailable {
    param(
        [string] $CommandName,
        [string] $DisplayName,
        [string] $ManualAction
    )

    try {
        $command = Get-Command $CommandName -ErrorAction SilentlyContinue
        if ($null -eq $command) {
            Write-CheckStatus -Status "WARN" -Name $DisplayName -Message "not found on PATH." -ManualAction $ManualAction
            return
        }

        Write-CheckStatus -Status "PASS" -Name $DisplayName -Message ("available at {0}" -f $command.Source)
        return
    }
    catch {
        Write-CheckStatus -Status "FAIL" -Name $DisplayName -Message $_.Exception.Message -ManualAction $ManualAction
        return
    }
}

Write-Output "Workspace Tooling"
Write-Output "-----------------"

Test-CommandAvailable -CommandName "git" -DisplayName "Git" -ManualAction "Install Git for Windows or add git.exe to PowerShell PATH."
Test-CommandAvailable -CommandName "gh" -DisplayName "GitHub CLI" -ManualAction "Install GitHub CLI and run gh auth login."
Test-CommandAvailable -CommandName "node" -DisplayName "Node" -ManualAction "Install Node.js or use the project-provided runtime."
Test-CommandAvailable -CommandName "npm" -DisplayName "npm" -ManualAction "Install Node.js with npm or repair PATH."
Test-CommandAvailable -CommandName "pnpm" -DisplayName "pnpm" -ManualAction "Install pnpm or use corepack if the project expects it."
Test-CommandAvailable -CommandName "python" -DisplayName "Python" -ManualAction "Install Python or add python.exe to PATH."

try {
    Write-CheckStatus -Status "PASS" -Name "PowerShell" -Message ("version {0}" -f $PSVersionTable.PSVersion)
}
catch {
    Write-CheckStatus -Status "FAIL" -Name "PowerShell" -Message "could not read PowerShell version." -ManualAction "Run this script in Windows PowerShell 5.1 or PowerShell 7+."
}

if (Get-Command gh -ErrorAction SilentlyContinue) {
    try {
        $authOutput = & gh auth status 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-CheckStatus -Status "PASS" -Name "GitHub authentication" -Message "gh reports an authenticated session."
        }
        else {
            Write-CheckStatus -Status "WARN" -Name "GitHub authentication" -Message "gh is installed but authentication was not confirmed." -ManualAction "Run gh auth login, then rerun this check."
            $authOutput | ForEach-Object { Write-Output ("     {0}" -f $_) }
        }
    }
    catch {
        Write-CheckStatus -Status "WARN" -Name "GitHub authentication" -Message $_.Exception.Message -ManualAction "Run gh auth status manually."
    }
}
else {
    Write-CheckStatus -Status "WARN" -Name "GitHub authentication" -Message "skipped because gh is unavailable." -ManualAction "Install GitHub CLI and authenticate."
}

$driveCandidates = @(
    (Join-Path $env:USERPROFILE "Google Drive"),
    (Join-Path $env:USERPROFILE "My Drive"),
    "G:\My Drive",
    "G:\Shared drives"
)

$visibleDrive = $driveCandidates | Where-Object {
    try {
        Test-Path $_ -ErrorAction Stop
    }
    catch {
        $false
    }
} | Select-Object -First 1
if ($visibleDrive) {
    Write-CheckStatus -Status "PASS" -Name "Google Drive" -Message ("visible at {0}" -f $visibleDrive)
}
else {
    Write-CheckStatus -Status "WARN" -Name "Google Drive" -Message "not detected from common local paths." -ManualAction "Open Google Drive for desktop or verify source documents manually."
}

Write-Output ""
Write-Output "Repository checks are provided by scripts/check_repositories.ps1 and scripts/check_branches.ps1."

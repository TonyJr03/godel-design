[CmdletBinding()]
param(
    [string]$Tag = "godel-design-nginx:ppo-02c1",
    [switch]$NoCache
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$AllowedDirtyPaths = @(
    "Dockerfile.nginx",
    "Dockerfile.nginx.dockerignore",
    "docker/nginx/conf.d/00-upgrade-map.conf",
    "docker/nginx/conf.d/default.conf",
    "docs/PROJECT_STATUS.md",
    "docs/production/PPO_ROADMAP.md",
    "docs/production/PPO_02_CONTAINERIZATION_PLAN.md",
    "docs/production/PPO_02_APP_IMAGE_HARDENING_REPORT.md",
    "docs/production/PPO_02_NGINX_IMAGE_REPORT.md",
    "docs/production/README.md",
    "scripts/preproduction/build-nginx-image.ps1"
)

function Get-RepoRoot {
    $scriptDirectory = Split-Path -Parent $PSCommandPath
    return (Resolve-Path (Join-Path $scriptDirectory "..\..")).Path
}

function ConvertTo-RepoPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    return ($Path -replace "\\", "/").Trim()
}

function Assert-AllowedGitState {
    param([Parameter(Mandatory = $true)][string]$RepoRoot)

    $output = & git -C $RepoRoot status --short --untracked-files=all
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to inspect git status."
    }

    $allowed = @{}
    foreach ($path in $AllowedDirtyPaths) {
        $allowed[(ConvertTo-RepoPath -Path $path)] = $true
    }

    $unexpected = @()
    foreach ($line in @($output)) {
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        $path = $line
        if ($line.Length -ge 4) {
            $path = $line.Substring(3)
        }
        if ($path -match " -> ") {
            $path = ($path -split " -> ")[-1]
        }

        $normalized = ConvertTo-RepoPath -Path $path
        if (-not $allowed.ContainsKey($normalized)) {
            $unexpected += $normalized
        }
    }

    if ($unexpected.Count -gt 0) {
        throw ("Unexpected dirty files: " + ($unexpected -join ", "))
    }
}

function Ensure-Directory {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

function Get-EvidenceRoot {
    $base = $env:LOCALAPPDATA
    if ([string]::IsNullOrWhiteSpace($base)) {
        $base = $env:TEMP
    }
    if ([string]::IsNullOrWhiteSpace($base)) {
        throw "Neither LOCALAPPDATA nor TEMP is available."
    }

    return (Join-Path $base "GodelDesign\PPO-02\builds\nginx")
}

function New-EvidenceDirectory {
    param([Parameter(Mandatory = $true)][string]$EvidenceRoot)

    Ensure-Directory -Path $EvidenceRoot
    for ($attempt = 0; $attempt -lt 5; $attempt++) {
        $timestampUtc = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssfffffffZ")
        $candidate = Join-Path $EvidenceRoot $timestampUtc
        if (-not (Test-Path -LiteralPath $candidate)) {
            New-Item -ItemType Directory -Path $candidate | Out-Null
            return $candidate
        }
        Start-Sleep -Milliseconds 10
    }

    throw "Unable to create evidence directory."
}

function Get-BaseImage {
    param([Parameter(Mandatory = $true)][string]$RepoRoot)

    $dockerfile = Join-Path $RepoRoot "Dockerfile.nginx"
    foreach ($line in Get-Content -LiteralPath $dockerfile) {
        if ($line -match "^\s*FROM\s+(\S+)") {
            return $Matches[1]
        }
    }

    throw "Unable to find FROM instruction in Dockerfile.nginx."
}

function Protect-Text {
    param(
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][string]$RepoRoot
    )

    $protected = $Text
    foreach ($value in @($RepoRoot, $env:USERPROFILE, $env:USERNAME, $env:COMPUTERNAME)) {
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            $protected = [regex]::Replace($protected, [regex]::Escape([string]$value), "[REDACTED_LOCAL_VALUE]", "IgnoreCase")
        }
    }

    return $protected
}

function Get-LogicalEvidencePath {
    param([Parameter(Mandatory = $true)][string]$RunDirectory)

    $root = Get-EvidenceRoot
    $leaf = Split-Path -Leaf $RunDirectory
    if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA) -and $root.StartsWith($env:LOCALAPPDATA, [StringComparison]::OrdinalIgnoreCase)) {
        return "%LOCALAPPDATA%\GodelDesign\PPO-02\builds\nginx\$leaf"
    }

    return "%TEMP%\GodelDesign\PPO-02\builds\nginx\$leaf"
}

function Main {
    $startedAtUtc = (Get-Date).ToUniversalTime()
    $repoRoot = Get-RepoRoot
    Set-Location -LiteralPath $repoRoot
    Assert-AllowedGitState -RepoRoot $repoRoot
    $baseImage = Get-BaseImage -RepoRoot $repoRoot
    $evidenceRoot = Get-EvidenceRoot
    $runDirectory = New-EvidenceDirectory -EvidenceRoot $evidenceRoot
    $rawStdout = Join-Path $runDirectory "build.stdout.raw.log"
    $rawStderr = Join-Path $runDirectory "build.stderr.raw.log"
    $buildLog = Join-Path $runDirectory "build.log"
    $summaryPath = Join-Path $runDirectory "build-summary.json"

    $arguments = @(
        "build",
        "--file", "Dockerfile.nginx",
        "--platform", "linux/amd64",
        "--progress=plain",
        "-t", $Tag
    )

    if ($NoCache.IsPresent) {
        $arguments += "--no-cache"
    }

    $arguments += "."
    $env:DOCKER_BUILDKIT = "1"

    $process = Start-Process -FilePath "docker" -ArgumentList $arguments -WorkingDirectory $repoRoot -RedirectStandardOutput $rawStdout -RedirectStandardError $rawStderr -Wait -PassThru -NoNewWindow
    $finishedAtUtc = (Get-Date).ToUniversalTime()
    $durationSeconds = [math]::Round(($finishedAtUtc - $startedAtUtc).TotalSeconds, 1)

    $combined = New-Object System.Collections.Generic.List[string]
    $combined.Add("# stdout")
    if (Test-Path -LiteralPath $rawStdout) {
        $combined.Add((Get-Content -LiteralPath $rawStdout -Raw))
    }
    $combined.Add("# stderr")
    if (Test-Path -LiteralPath $rawStderr) {
        $combined.Add((Get-Content -LiteralPath $rawStderr -Raw))
    }

    $sanitized = Protect-Text -Text ($combined -join [Environment]::NewLine) -RepoRoot $repoRoot
    Set-Content -LiteralPath $buildLog -Value $sanitized -Encoding UTF8
    Remove-Item -LiteralPath $rawStdout, $rawStderr -Force -ErrorAction SilentlyContinue

    $summary = [ordered]@{
        startedAtUtc = $startedAtUtc.ToString("yyyy-MM-ddTHH:mm:ssZ")
        finishedAtUtc = $finishedAtUtc.ToString("yyyy-MM-ddTHH:mm:ssZ")
        durationSeconds = $durationSeconds
        tag = $Tag
        noCache = [bool]$NoCache.IsPresent
        exitCode = [int]$process.ExitCode
        succeeded = ($process.ExitCode -eq 0)
        baseImage = $baseImage
        dockerfile = "Dockerfile.nginx"
    }

    Set-Content -LiteralPath $summaryPath -Value ($summary | ConvertTo-Json -Depth 4) -Encoding UTF8

    Write-Host ("Build tag: " + $Tag)
    Write-Host ("Exit code: " + $process.ExitCode)
    Write-Host ("Duration seconds: " + $durationSeconds)
    Write-Host ("Evidence: " + (Get-LogicalEvidencePath -RunDirectory $runDirectory))

    exit ([int]$process.ExitCode)
}

try {
    Main
} catch {
    Write-Error ("PPO-02 Nginx image build failed. " + $_.Exception.Message)
    exit 1
}

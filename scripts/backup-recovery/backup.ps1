[CmdletBinding(PositionalBinding = $false)]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$BackupRoot,

  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$ProjectRef
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed."
  }
}

function Get-BackupRelativePath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FullName,

    [Parameter(Mandatory = $true)]
    [string]$BackupDirectory
  )

  $trimCharacters = [char[]]@('\', '/')
  $directoryPrefix = $BackupDirectory.TrimEnd($trimCharacters) + [IO.Path]::DirectorySeparatorChar
  $resolvedName = [IO.Path]::GetFullPath($FullName)

  if (-not $resolvedName.StartsWith($directoryPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "File is outside the backup directory."
  }

  return $resolvedName.Substring($directoryPrefix.Length).Replace("\", "/")
}

$bucketName = "godel-files"
$sourceName = "godel-production"
$currentStep = "PREFLIGHT"
$partialCreated = $false
$locationPushed = $false
$exitCode = 0
$partialDirectory = $null
$finalDirectory = $null
$backupRootPrefix = $null
$backupId = $null

try {
  $repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
  $backupRootPath = [IO.Path]::GetFullPath($BackupRoot)
  if (-not (Test-Path -LiteralPath (Join-Path $repoRoot "package.json") -PathType Leaf)) {
    throw "Repository root could not be resolved."
  }

  if ([string]::IsNullOrWhiteSpace($ProjectRef)) {
    throw "ProjectRef is required."
  }

  foreach ($variableName in @("SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD")) {
    $variableValue = [Environment]::GetEnvironmentVariable($variableName, "Process")
    if ([string]::IsNullOrWhiteSpace($variableValue)) {
      throw "$variableName is required."
    }
    Remove-Variable variableValue
  }

  $gitCommand = Get-Command git -ErrorAction Stop
  $npxCommand = Get-Command npx.cmd -ErrorAction Stop

  Push-Location -LiteralPath $repoRoot
  $locationPushed = $true

  $null = & $npxCommand.Source --no-install supabase --version
  if ($LASTEXITCODE -ne 0) {
    throw "The local Supabase CLI is unavailable."
  }

  $gitShaOutput = @(& $gitCommand.Source -C $repoRoot rev-parse HEAD 2>$null)
  if ($LASTEXITCODE -ne 0 -or $gitShaOutput.Count -ne 1) {
    throw "Git HEAD could not be resolved."
  }

  $gitSha = ([string]$gitShaOutput[0]).Trim()
  if ($gitSha -notmatch "^[0-9a-fA-F]{40}$") {
    throw "Git HEAD is invalid."
  }

  if (Test-Path -LiteralPath $backupRootPath) {
    if (-not (Test-Path -LiteralPath $backupRootPath -PathType Container)) {
      throw "BackupRoot is not a directory."
    }
  } else {
    New-Item -ItemType Directory -Path $backupRootPath | Out-Null
  }

  $createdAt = [DateTimeOffset]::UtcNow
  $backupId = "GDBK-" + $createdAt.UtcDateTime.ToString(
    "yyyyMMdd'T'HHmmss'Z'",
    [Globalization.CultureInfo]::InvariantCulture
  )

  $finalDirectory = [IO.Path]::GetFullPath((Join-Path $backupRootPath $backupId))
  $partialDirectory = [IO.Path]::GetFullPath((Join-Path $backupRootPath ($backupId + ".partial")))
  $trimCharacters = [char[]]@('\', '/')
  $backupRootPrefix = $backupRootPath.TrimEnd($trimCharacters) + [IO.Path]::DirectorySeparatorChar

  foreach ($candidate in @($finalDirectory, $partialDirectory)) {
    if (-not $candidate.StartsWith($backupRootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Backup directory is outside BackupRoot."
    }
    if (Test-Path -LiteralPath $candidate) {
      throw "Backup directory already exists."
    }
  }

  New-Item -ItemType Directory -Path $partialDirectory | Out-Null
  $partialCreated = $true

  $storageRoot = Join-Path $partialDirectory "storage"
  $storageDirectory = Join-Path $storageRoot $bucketName
  New-Item -ItemType Directory -Path $storageDirectory -Force | Out-Null

  $currentStep = "LINK"
  Invoke-CheckedCommand -FilePath $npxCommand.Source -Arguments @(
    "--no-install", "supabase", "link", "--project-ref", $ProjectRef
  )

  $currentStep = "DATABASE"
  $dataPath = Join-Path $partialDirectory "data.sql"
  Invoke-CheckedCommand -FilePath $npxCommand.Source -Arguments @(
    "--no-install", "supabase", "db", "dump",
    "--linked", "--data-only", "--use-copy",
    "-f", $dataPath,
    "-x", "storage.buckets_vectors",
    "-x", "storage.vector_indexes"
  )

  $dataFile = Get-Item -LiteralPath $dataPath -ErrorAction Stop
  if ($dataFile.PSIsContainer -or $dataFile.Length -le 0) {
    throw "Database dump is empty or invalid."
  }

  $currentStep = "STORAGE"
  Invoke-CheckedCommand -FilePath $npxCommand.Source -Arguments @(
    "--no-install", "supabase", "storage", "cp",
    "-r", ("ss:///" + $bucketName), $storageDirectory,
    "--experimental", "--linked"
  )

  if (-not (Test-Path -LiteralPath $storageDirectory -PathType Container)) {
    throw "Storage directory is missing."
  }

  $currentStep = "MANIFEST"
  $manifest = [ordered]@{
    formatVersion = 1
    backupId = $backupId
    createdAtUtc = $createdAt.UtcDateTime.ToString(
      "yyyy-MM-dd'T'HH:mm:ss.fffffff'Z'",
      [Globalization.CultureInfo]::InvariantCulture
    )
    source = $sourceName
    projectRef = $ProjectRef
    gitSha = $gitSha.ToLowerInvariant()
    database = [ordered]@{
      file = "data.sql"
    }
    storage = [ordered]@{
      bucket = $bucketName
      directory = "storage/godel-files"
    }
  }

  $utf8WithoutBom = New-Object Text.UTF8Encoding($false)
  $manifestPath = Join-Path $partialDirectory "manifest.json"
  $manifestJson = $manifest | ConvertTo-Json -Depth 4
  [IO.File]::WriteAllText($manifestPath, $manifestJson + [Environment]::NewLine, $utf8WithoutBom)

  $currentStep = "CHECKSUMS"
  $checksumFiles = @(
    Get-Item -LiteralPath $dataPath
    Get-Item -LiteralPath $manifestPath
    Get-ChildItem -LiteralPath $storageDirectory -Recurse -File
  )

  $checksumRecords = @(
    foreach ($file in $checksumFiles) {
      [PSCustomObject]@{
        RelativePath = Get-BackupRelativePath -FullName $file.FullName -BackupDirectory $partialDirectory
        Hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
      }
    }
  )

  $checksumLines = @(
    $checksumRecords |
      Sort-Object -Property RelativePath |
      ForEach-Object { $_.Hash + "  " + $_.RelativePath }
  )

  $checksumsPath = Join-Path $partialDirectory "checksums.sha256"
  [IO.File]::WriteAllLines($checksumsPath, $checksumLines, $utf8WithoutBom)

  if (-not (Test-Path -LiteralPath $checksumsPath -PathType Leaf)) {
    throw "Checksums file is missing."
  }

  $currentStep = "FINALIZE"
  Move-Item -LiteralPath $partialDirectory -Destination $finalDirectory
  $partialCreated = $false

  Write-Output "BACKUP COMPLETE"
  Write-Output ("Backup: " + $backupId)
  Write-Output "Database: OK"
  Write-Output "Storage: OK"
  Write-Output "Checksums: OK"
  Write-Output ("Path: " + $finalDirectory)
} catch {
  $exitCode = 1
  $failureStep = $currentStep

  if ($partialCreated -and -not [string]::IsNullOrWhiteSpace($partialDirectory)) {
    try {
      $resolvedPartial = [IO.Path]::GetFullPath($partialDirectory)
      $expectedLeaf = $backupId + ".partial"
      if (
        -not [string]::IsNullOrWhiteSpace($backupRootPrefix) -and
        $resolvedPartial.StartsWith($backupRootPrefix, [StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $resolvedPartial) -eq $expectedLeaf
      ) {
        Remove-Item -LiteralPath $resolvedPartial -Recurse -Force
      }
    } catch {
      [Console]::Error.WriteLine("Partial directory cleanup failed.")
    }
  }

  [Console]::Error.WriteLine("BACKUP FAILED: " + $failureStep)
} finally {
  if ($locationPushed) {
    Pop-Location
  }
}

exit $exitCode

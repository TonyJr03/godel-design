[CmdletBinding(PositionalBinding = $false)]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$BackupPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-DirectoryPrefix {
  param([Parameter(Mandatory = $true)][string]$Path)

  $trimCharacters = [char[]]@('\', '/')
  return [IO.Path]::GetFullPath($Path).TrimEnd($trimCharacters) +
    [IO.Path]::DirectorySeparatorChar
}

function Test-ContainedPath {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Candidate
  )

  $prefix = Get-DirectoryPrefix -Path $Root
  $resolvedCandidate = [IO.Path]::GetFullPath($Candidate)
  return $resolvedCandidate.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)
}

function Get-RelativePath {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Candidate
  )

  $prefix = Get-DirectoryPrefix -Path $Root
  $resolvedCandidate = [IO.Path]::GetFullPath($Candidate)
  if (-not $resolvedCandidate.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Path is outside the expected root."
  }

  return $resolvedCandidate.Substring($prefix.Length).Replace("\", "/")
}

function Read-EnvironmentFile {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$VariableNames
  )

  $values = @{}
  if (-not (Test-Path -LiteralPath $FilePath -PathType Leaf)) {
    return $values
  }

  $allowedNames = @{}
  foreach ($variableName in $VariableNames) {
    $allowedNames[$variableName] = $true
  }

  foreach ($line in (Get-Content -LiteralPath $FilePath -ErrorAction Stop)) {
    $trimmedLine = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmedLine) -or $trimmedLine.StartsWith("#")) {
      continue
    }

    $separatorIndex = $trimmedLine.IndexOf("=")
    if ($separatorIndex -lt 1) {
      continue
    }

    $variableName = $trimmedLine.Substring(0, $separatorIndex).Trim()
    if (-not $allowedNames.ContainsKey($variableName)) {
      continue
    }

    $variableValue = $trimmedLine.Substring($separatorIndex + 1).Trim()
    if ($variableValue.Length -ge 2) {
      $firstCharacter = $variableValue.Substring(0, 1)
      $lastCharacter = $variableValue.Substring($variableValue.Length - 1, 1)
      if (
        ($firstCharacter -eq '"' -and $lastCharacter -eq '"') -or
        ($firstCharacter -eq "'" -and $lastCharacter -eq "'")
      ) {
        $variableValue = $variableValue.Substring(1, $variableValue.Length - 2)
      }
    }

    $values[$variableName] = $variableValue
  }

  return $values
}

function Get-EnvironmentState {
  param([Parameter(Mandatory = $true)][string[]]$VariableNames)

  $processEnvironment = [Environment]::GetEnvironmentVariables("Process")
  $state = @{}
  foreach ($variableName in $VariableNames) {
    $existed = $processEnvironment.Contains($variableName)
    $state[$variableName] = [PSCustomObject]@{
      Existed = $existed
      Value = if ($existed) { [string]$processEnvironment[$variableName] } else { $null }
    }
  }

  return $state
}

function Restore-ProcessEnvironment {
  param([Parameter(Mandatory = $true)][hashtable]$State)

  foreach ($variableName in $State.Keys) {
    if ($State[$variableName].Existed) {
      [Environment]::SetEnvironmentVariable(
        $variableName,
        $State[$variableName].Value,
        "Process"
      )
    } else {
      [Environment]::SetEnvironmentVariable($variableName, $null, "Process")
    }
  }
}

function Import-RestoreEnvironment {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$VariableNames,
    [Parameter(Mandatory = $true)][hashtable]$PreviousState
  )

  $fileValues = Read-EnvironmentFile -FilePath $FilePath -VariableNames $VariableNames
  foreach ($variableName in $VariableNames) {
    if (-not $PreviousState[$variableName].Existed -and $fileValues.ContainsKey($variableName)) {
      [Environment]::SetEnvironmentVariable(
        $variableName,
        [string]$fileValues[$variableName],
        "Process"
      )
    }
  }
}

function Get-BackupInventory {
  param([Parameter(Mandatory = $true)][string]$BackupDirectory)

  $files = @{}
  $directories = [System.Collections.Generic.HashSet[string]]::new(
    [StringComparer]::OrdinalIgnoreCase
  )

  foreach ($entry in (Get-ChildItem -LiteralPath $BackupDirectory -Force -Recurse)) {
    $relativePath = Get-RelativePath -Root $BackupDirectory -Candidate $entry.FullName
    if ($entry.PSIsContainer) {
      [void]$directories.Add($relativePath)
    } else {
      $files[$relativePath] = (Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash
    }
  }

  return [PSCustomObject]@{
    Files = $files
    Directories = $directories
  }
}

function Assert-BackupUnchanged {
  param(
    [Parameter(Mandatory = $true)][string]$BackupDirectory,
    [Parameter(Mandatory = $true)][object]$ExpectedInventory
  )

  $actualInventory = Get-BackupInventory -BackupDirectory $BackupDirectory
  if (
    $actualInventory.Files.Count -ne $ExpectedInventory.Files.Count -or
    $actualInventory.Directories.Count -ne $ExpectedInventory.Directories.Count
  ) {
    throw "Backup inventory changed during restore."
  }

  foreach ($relativePath in $ExpectedInventory.Files.Keys) {
    if (
      -not $actualInventory.Files.ContainsKey($relativePath) -or
      $actualInventory.Files[$relativePath] -cne $ExpectedInventory.Files[$relativePath]
    ) {
      throw "Backup file changed during restore."
    }
  }

  foreach ($relativePath in $ExpectedInventory.Directories) {
    if (-not $actualInventory.Directories.Contains($relativePath)) {
      throw "Backup directory layout changed during restore."
    }
  }
}

function Read-CopyCounts {
  param([Parameter(Mandatory = $true)][string]$DataPath)

  $requiredTargets = @(
    "auth.users",
    "auth.identities",
    "public.perfiles",
    "public.clientes",
    "public.solicitudes",
    "public.pedidos",
    "storage.buckets",
    "storage.objects",
    "private.internal_user_creation_audit",
    "private.internal_user_password_reset_audit"
  )
  $counts = @{}
  $seenTargets = [System.Collections.Generic.HashSet[string]]::new(
    [StringComparer]::OrdinalIgnoreCase
  )
  foreach ($target in $requiredTargets) {
    $counts[$target] = [long]0
  }

  $hasReplicationSetting = $false
  $hasResetAll = $false
  $activeTarget = $null
  $reader = [IO.StreamReader]::new($DataPath, $true)
  try {
    while (($line = $reader.ReadLine()) -ne $null) {
      $trimmedLine = $line.Trim()
      if ($trimmedLine -ceq "SET session_replication_role = replica;") {
        $hasReplicationSetting = $true
      }
      if ($trimmedLine -ceq "RESET ALL;") {
        $hasResetAll = $true
      }

      if ($null -ne $activeTarget) {
        if ($line -ceq "\.") {
          $activeTarget = $null
        } elseif ($counts.ContainsKey($activeTarget)) {
          $counts[$activeTarget] = [long]$counts[$activeTarget] + 1
        }
        continue
      }

      if (
        $line -match '^\s*COPY\s+(?<target>(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_]*)\.(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_]*))\s'
      ) {
        $activeTarget = $Matches["target"].Replace('"', '').ToLowerInvariant()
        if ($counts.ContainsKey($activeTarget)) {
          [void]$seenTargets.Add($activeTarget)
        }
      }
    }
  } finally {
    $reader.Dispose()
  }

  if ($null -ne $activeTarget) {
    throw "data.sql contains an unterminated COPY block."
  }
  if (-not $hasReplicationSetting -or -not $hasResetAll) {
    throw "data.sql is missing the required replication safety statements."
  }
  foreach ($target in $requiredTargets) {
    if (-not $seenTargets.Contains($target)) {
      throw "data.sql is missing a required COPY target."
    }
  }

  return $counts
}

function Test-BackupAdmission {
  param([Parameter(Mandatory = $true)][string]$RequestedBackupPath)

  if (-not (Test-Path -LiteralPath $RequestedBackupPath -PathType Container)) {
    throw "BackupPath is not a directory."
  }

  $backupDirectory = [IO.Path]::GetFullPath($RequestedBackupPath)
  $backupDirectoryItem = Get-Item -LiteralPath $backupDirectory -Force
  if (($backupDirectoryItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "BackupPath cannot be a reparse point."
  }

  $manifestPath = Join-Path $backupDirectory "manifest.json"
  $dataPath = Join-Path $backupDirectory "data.sql"
  $checksumsPath = Join-Path $backupDirectory "checksums.sha256"
  $storageRoot = Join-Path $backupDirectory "storage"
  $storageDirectory = Join-Path $storageRoot "godel-files"
  foreach ($requiredFile in @($manifestPath, $dataPath, $checksumsPath)) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
      throw "Backup is missing a required file."
    }
  }
  if (-not (Test-Path -LiteralPath $storageDirectory -PathType Container)) {
    throw "Backup is missing the Storage directory."
  }

  $allowedRootEntries = @("manifest.json", "data.sql", "checksums.sha256", "storage")
  if (@(
    Get-ChildItem -LiteralPath $backupDirectory -Force |
      Where-Object { $_.Name -notin $allowedRootEntries }
  ).Count -gt 0) {
    throw "Backup contains unexpected root entries."
  }
  if (@(
    Get-ChildItem -LiteralPath $storageRoot -Force |
      Where-Object { $_.Name -cne "godel-files" }
  ).Count -gt 0) {
    throw "Backup contains unexpected Storage root entries."
  }
  if (@(
    Get-ChildItem -LiteralPath $backupDirectory -Force -Recurse |
      Where-Object { ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 }
  ).Count -gt 0) {
    throw "Backup contains a reparse point."
  }

  try {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -ErrorAction Stop |
      ConvertFrom-Json -ErrorAction Stop
  } catch {
    throw "manifest.json is invalid."
  }

  if ([int]$manifest.formatVersion -ne 1) { throw "Unsupported backup formatVersion." }
  if ([string]$manifest.source -cne "godel-production") { throw "Unexpected backup source." }
  if ([string]$manifest.database.file -cne "data.sql") { throw "Unexpected database file." }
  if ([string]$manifest.storage.bucket -cne "godel-files") { throw "Unexpected Storage bucket." }
  if ([string]$manifest.storage.directory -cne "storage/godel-files") {
    throw "Unexpected Storage directory."
  }

  $backupId = [string]$manifest.backupId
  if ($backupId -cne (Split-Path -Leaf $backupDirectory)) {
    throw "Backup ID does not match the directory name."
  }
  $manifestGitSha = [string]$manifest.gitSha
  if ($manifestGitSha -notmatch '^[0-9a-fA-F]{40}$') {
    throw "Backup gitSha is invalid."
  }

  $dataFile = Get-Item -LiteralPath $dataPath -Force
  if ($dataFile.PSIsContainer -or $dataFile.Length -le 0) {
    throw "data.sql is empty or invalid."
  }

  $checksumEntries = @{}
  $lineNumber = 0
  foreach ($line in (Get-Content -LiteralPath $checksumsPath -ErrorAction Stop)) {
    $lineNumber++
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line -notmatch '^(?<hash>[0-9a-f]{64})  (?<path>.+)$') {
      throw "Invalid checksum record."
    }

    $expectedHash = $Matches["hash"]
    $relativePath = $Matches["path"]
    $pathParts = @($relativePath -split '/')
    if (
      $relativePath.Contains("\") -or
      $relativePath.StartsWith("/") -or
      $relativePath -match '^[A-Za-z]:' -or
      @($pathParts | Where-Object { $_ -eq "" -or $_ -eq "." -or $_ -eq ".." }).Count -gt 0
    ) {
      throw "Unsafe checksum path."
    }
    if ($relativePath -ceq "checksums.sha256") {
      throw "checksums.sha256 cannot include itself."
    }
    if ($checksumEntries.ContainsKey($relativePath)) {
      throw "Duplicate checksum path."
    }

    $candidatePath = Join-Path $backupDirectory (
      $relativePath.Replace('/', [IO.Path]::DirectorySeparatorChar)
    )
    if (-not (Test-ContainedPath -Root $backupDirectory -Candidate $candidatePath)) {
      throw "Checksum path is outside the backup."
    }
    if (-not (Test-Path -LiteralPath $candidatePath -PathType Leaf)) {
      throw "Checksum references a missing file."
    }

    $actualHash = (Get-FileHash -LiteralPath $candidatePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -cne $expectedHash) {
      throw "Checksum mismatch."
    }
    $checksumEntries[$relativePath] = $expectedHash
  }

  $protectedFiles = [System.Collections.Generic.HashSet[string]]::new(
    [StringComparer]::OrdinalIgnoreCase
  )
  [void]$protectedFiles.Add("data.sql")
  [void]$protectedFiles.Add("manifest.json")
  $storageFiles = @(Get-ChildItem -LiteralPath $storageDirectory -Force -Recurse -File)
  foreach ($storageFile in $storageFiles) {
    if (-not (Test-ContainedPath -Root $storageDirectory -Candidate $storageFile.FullName)) {
      throw "Storage file is outside the bucket directory."
    }
    [void]$protectedFiles.Add(
      (Get-RelativePath -Root $backupDirectory -Candidate $storageFile.FullName)
    )
  }
  if ($checksumEntries.Count -ne $protectedFiles.Count) {
    throw "Checksum coverage does not match the backup files."
  }
  foreach ($relativePath in $protectedFiles) {
    if (-not $checksumEntries.ContainsKey($relativePath)) {
      throw "Backup file is not covered by checksums."
    }
  }
  foreach ($relativePath in $checksumEntries.Keys) {
    if (-not $protectedFiles.Contains($relativePath)) {
      throw "Checksum record is outside the backup contract."
    }
  }

  $copyCounts = Read-CopyCounts -DataPath $dataPath
  return [PSCustomObject]@{
    BackupDirectory = $backupDirectory
    BackupId = $backupId
    ManifestGitSha = $manifestGitSha.ToLowerInvariant()
    DataPath = $dataPath
    StorageRoot = $storageRoot
    StorageDirectory = $storageDirectory
    StorageFiles = $storageFiles
    CopyCounts = $copyCounts
    Inventory = Get-BackupInventory -BackupDirectory $backupDirectory
  }
}

function Save-SupabaseTempState {
  param([Parameter(Mandatory = $true)][string]$RepoRoot)

  $tempPath = Join-Path $RepoRoot "supabase\.temp"
  $backupRoot = Join-Path (
    [IO.Path]::GetTempPath()
  ) ("godel-restore-link-state-" + [guid]::NewGuid().ToString("N"))
  $backupPath = Join-Path $backupRoot "supabase-temp"
  New-Item -ItemType Directory -Path $backupRoot | Out-Null
  $hadPrevious = Test-Path -LiteralPath $tempPath
  if ($hadPrevious) {
    Copy-Item -LiteralPath $tempPath -Destination $backupPath -Recurse -Force
  }

  return [PSCustomObject]@{
    TempPath = $tempPath
    BackupRoot = $backupRoot
    BackupPath = $backupPath
    HadPrevious = $hadPrevious
    Restored = $false
  }
}

function Restore-SupabaseTempState {
  param([Parameter(Mandatory = $true)][object]$State)

  if (-not $State.Restored) {
    if (Test-Path -LiteralPath $State.TempPath) {
      Remove-Item -LiteralPath $State.TempPath -Recurse -Force
    }
    if ($State.HadPrevious) {
      Copy-Item -LiteralPath $State.BackupPath -Destination $State.TempPath -Recurse -Force
    }
    $State.Restored = $true
  }
  if (Test-Path -LiteralPath $State.BackupRoot) {
    Remove-Item -LiteralPath $State.BackupRoot -Recurse -Force
  }
}

function Invoke-ExternalCommand {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  $output = @(& $FilePath @Arguments 2>$null)
  if ($LASTEXITCODE -ne 0) {
    throw "External command failed."
  }
  return $output
}

function Invoke-Psql {
  param(
    [Parameter(Mandatory = $true)][string]$PsqlPath,
    [Parameter(Mandatory = $true)][string]$Phase,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  $previousPhase = [Environment]::GetEnvironmentVariable("GODEL_RESTORE_PSQL_PHASE", "Process")
  try {
    [Environment]::SetEnvironmentVariable("GODEL_RESTORE_PSQL_PHASE", $Phase, "Process")
    return @(Invoke-ExternalCommand -FilePath $PsqlPath -Arguments $Arguments)
  } finally {
    [Environment]::SetEnvironmentVariable(
      "GODEL_RESTORE_PSQL_PHASE",
      $previousPhase,
      "Process"
    )
  }
}

function Invoke-DbPush {
  param([Parameter(Mandatory = $true)][string]$NpxPath)

  $null = @(& $NpxPath "--no-install" "supabase" "--yes" "db" "push" "--linked" 2>$null)
  return [int]$LASTEXITCODE
}

function Get-RegisteredMigrationVersions {
  param(
    [Parameter(Mandatory = $true)][string]$PsqlPath,
    [Parameter(Mandatory = $true)][string]$Phase
  )

  $migrationSql = @'
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;
'@
  return @(
    Invoke-Psql -PsqlPath $PsqlPath -Phase $Phase -Arguments @(
      "--no-psqlrc", "--tuples-only", "--no-align", "--variable", "ON_ERROR_STOP=1",
      "--command", $migrationSql
    ) | ForEach-Object { ([string]$_).Trim() } |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  )
}

function Test-ExpectedMigrationSet {
  param(
    [Parameter(Mandatory = $true)][string[]]$RegisteredVersions,
    [Parameter(Mandatory = $true)][string[]]$ExpectedVersions
  )

  if ($RegisteredVersions.Count -ne $ExpectedVersions.Count) {
    return $false
  }
  for ($index = 0; $index -lt $ExpectedVersions.Count; $index++) {
    if ($RegisteredVersions[$index] -cne $ExpectedVersions[$index]) {
      return $false
    }
  }
  return $true
}

function ConvertTo-KeyValueMap {
  param([Parameter(Mandatory = $true)][object[]]$Lines)

  $values = @{}
  foreach ($lineValue in $Lines) {
    $line = ([string]$lineValue).Trim()
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $separatorIndex = $line.IndexOf('|')
    if ($separatorIndex -lt 1) {
      throw "Unexpected query output."
    }
    $key = $line.Substring(0, $separatorIndex)
    $value = $line.Substring($separatorIndex + 1)
    if ($values.ContainsKey($key)) {
      throw "Duplicate query output key."
    }
    $values[$key] = $value
  }
  return $values
}

function Set-PsqlConnectionEnvironment {
  param(
    [Parameter(Mandatory = $true)][string]$PoolerUrl,
    [Parameter(Mandatory = $true)][string]$Password
  )

  try {
    $connectionUri = [Uri]$PoolerUrl
  } catch {
    throw "pooler-url is invalid."
  }
  if ($connectionUri.Scheme -notin @("postgres", "postgresql")) {
    throw "pooler-url has an invalid scheme."
  }
  if ([string]::IsNullOrWhiteSpace($connectionUri.UserInfo) -or $connectionUri.UserInfo.Contains(':')) {
    throw "pooler-url must contain passwordless user information."
  }

  $databaseName = $connectionUri.AbsolutePath.TrimStart('/')
  if (
    [string]::IsNullOrWhiteSpace($connectionUri.Host) -or
    [string]::IsNullOrWhiteSpace($databaseName)
  ) {
    throw "pooler-url is incomplete."
  }
  $port = if ($connectionUri.Port -gt 0) { $connectionUri.Port } else { 5432 }

  [Environment]::SetEnvironmentVariable("PGHOST", $connectionUri.Host, "Process")
  [Environment]::SetEnvironmentVariable("PGPORT", [string]$port, "Process")
  [Environment]::SetEnvironmentVariable(
    "PGUSER",
    [Uri]::UnescapeDataString($connectionUri.UserInfo),
    "Process"
  )
  [Environment]::SetEnvironmentVariable("PGDATABASE", $databaseName, "Process")
  [Environment]::SetEnvironmentVariable("PGPASSWORD", $Password, "Process")
}

$expectedCliVersion = "2.109.1"
$requiredConfirmation = "ALLOW_DISPOSABLE_MANAGED_RESTORE"
$migrationVersions = @(
  "20260811131824",
  "20260811131825",
  "20260811131826",
  "20260811131827",
  "20260811131828",
  "20260811131829"
)
$environmentVariableNames = @(
  "GODEL_MANAGED_RESTORE_PROJECT_REF",
  "GODEL_MANAGED_RESTORE_DB_PASSWORD",
  "GODEL_MANAGED_RESTORE_CONFIRM",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
  "PGHOST",
  "PGPORT",
  "PGUSER",
  "PGDATABASE",
  "PGPASSWORD",
  "GODEL_RESTORE_PSQL_PHASE",
  "GODEL_RESTORE_CLI_PHASE"
)

$currentStep = "PREFLIGHT"
$exitCode = 0
$targetMutated = $false
$linkState = $null
$environmentState = $null
$repoLocationPushed = $false
$storageLocationPushed = $false
$backup = $null
$storageStatus = $null
$dbPushStatus = $null
$targetDbPassword = $null
$previousSupabaseDbPassword = $null

try {
  $repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
  if (-not (Test-Path -LiteralPath (Join-Path $repoRoot "package.json") -PathType Leaf)) {
    throw "Repository root could not be resolved."
  }

  $currentStep = "BACKUP ADMISSION"
  $backup = Test-BackupAdmission -RequestedBackupPath $BackupPath

  $currentStep = "TARGET ADMISSION"
  $environmentState = Get-EnvironmentState -VariableNames $environmentVariableNames
  $restoreEnvironmentNames = @(
    "GODEL_MANAGED_RESTORE_PROJECT_REF",
    "GODEL_MANAGED_RESTORE_DB_PASSWORD",
    "GODEL_MANAGED_RESTORE_CONFIRM",
    "SUPABASE_ACCESS_TOKEN"
  )
  Import-RestoreEnvironment `
    -FilePath (Join-Path $repoRoot ".env.managed.restore.local") `
    -VariableNames $restoreEnvironmentNames `
    -PreviousState $environmentState

  $productionValues = Read-EnvironmentFile `
    -FilePath (Join-Path $repoRoot ".env.managed.backup.local") `
    -VariableNames @("GODEL_MANAGED_SUPABASE_PROJECT_REF")
  $productionProjectRef = if ($productionValues.ContainsKey("GODEL_MANAGED_SUPABASE_PROJECT_REF")) {
    [string]$productionValues["GODEL_MANAGED_SUPABASE_PROJECT_REF"]
  } else {
    $null
  }
  $targetProjectRef = [Environment]::GetEnvironmentVariable(
    "GODEL_MANAGED_RESTORE_PROJECT_REF",
    "Process"
  )
  $targetDbPassword = [Environment]::GetEnvironmentVariable(
    "GODEL_MANAGED_RESTORE_DB_PASSWORD",
    "Process"
  )
  $restoreConfirmation = [Environment]::GetEnvironmentVariable(
    "GODEL_MANAGED_RESTORE_CONFIRM",
    "Process"
  )

  if ($restoreConfirmation -cne $requiredConfirmation) {
    throw "Disposable Managed restore confirmation is required."
  }
  if ([string]::IsNullOrWhiteSpace($productionProjectRef) -or $productionProjectRef -notmatch '^[a-z0-9]{20}$') {
    throw "Production ProjectRef authority is unavailable."
  }
  if ([string]::IsNullOrWhiteSpace($targetProjectRef) -or $targetProjectRef -notmatch '^[a-z0-9]{20}$') {
    throw "Restore target ProjectRef is invalid."
  }
  if ($targetProjectRef -ceq $productionProjectRef) {
    throw "Production restore is forbidden."
  }
  if ([string]::IsNullOrWhiteSpace($targetDbPassword)) {
    throw "Restore target database password is required."
  }
  [Environment]::SetEnvironmentVariable(
    "GODEL_MANAGED_RESTORE_DB_PASSWORD",
    $null,
    "Process"
  )
  [Environment]::SetEnvironmentVariable("SUPABASE_DB_PASSWORD", $null, "Process")

  $currentStep = "SCHEMA AUTHORITY"
  $gitCommand = @(Get-Command git -CommandType Application -ErrorAction Stop)[0]
  $null = Invoke-ExternalCommand -FilePath $gitCommand.Source -Arguments @(
    "-C", $repoRoot, "cat-file", "-e", ($backup.ManifestGitSha + "^{commit}")
  )
  & $gitCommand.Source -C $repoRoot diff --quiet $backup.ManifestGitSha HEAD -- "supabase/migrations"
  $schemaDiffExitCode = $LASTEXITCODE
  if ($schemaDiffExitCode -eq 1) {
    throw "Schema authority drift was detected."
  }
  if ($schemaDiffExitCode -ne 0) {
    throw "Schema authority could not be verified."
  }

  $currentStep = "TOOL PREFLIGHT"
  $npxCommand = @(Get-Command npx.cmd -CommandType Application -ErrorAction Stop)[0]
  $psqlCommands = @(Get-Command psql -CommandType Application -ErrorAction SilentlyContinue)
  $psqlCommand = if ($psqlCommands.Count -gt 0) { $psqlCommands[0] } else { $null }
  if ($null -eq $psqlCommand) {
    $currentStep = "PSQL_REQUIRED"
    throw "psql is required."
  }
  $supabaseCommandPath = Join-Path $repoRoot "node_modules\.bin\supabase.cmd"
  if (-not (Test-Path -LiteralPath $supabaseCommandPath -PathType Leaf)) {
    throw "The local Supabase CLI executable is unavailable."
  }
  $versionOutput = @(Invoke-ExternalCommand -FilePath $npxCommand.Source -Arguments @(
    "--no-install", "supabase", "--version"
  ))
  $reportedVersions = @(
    $versionOutput | ForEach-Object { ([string]$_).Trim() } |
      Where-Object { $_ -match '^\d+\.\d+\.\d+$' }
  )
  if ($reportedVersions.Count -ne 1 -or $reportedVersions[0] -cne $expectedCliVersion) {
    throw "The local Supabase CLI version is not approved."
  }

  Push-Location -LiteralPath $repoRoot
  $repoLocationPushed = $true

  $currentStep = "LINK STATE PRESERVE"
  $linkState = Save-SupabaseTempState -RepoRoot $repoRoot

  $currentStep = "LINK"
  $null = Invoke-ExternalCommand -FilePath $npxCommand.Source -Arguments @(
    "--no-install", "supabase", "link", "--project-ref", $targetProjectRef
  )

  $currentStep = "TARGET CONNECTION"
  $poolerUrlPath = Join-Path $repoRoot "supabase\.temp\pooler-url"
  if (-not (Test-Path -LiteralPath $poolerUrlPath -PathType Leaf)) {
    throw "Linked target pooler-url is unavailable."
  }
  $poolerUrl = (Get-Content -LiteralPath $poolerUrlPath -Raw -ErrorAction Stop).Trim()
  Set-PsqlConnectionEnvironment -PoolerUrl $poolerUrl -Password $targetDbPassword

  $currentStep = "TARGET_NOT_FRESH"
  $freshnessSql = @'
SELECT 'public.perfiles|' || CASE WHEN to_regclass('public.perfiles') IS NULL THEN 'absent' ELSE 'present' END;
SELECT 'public.solicitudes|' || CASE WHEN to_regclass('public.solicitudes') IS NULL THEN 'absent' ELSE 'present' END;
SELECT 'public.pedidos|' || CASE WHEN to_regclass('public.pedidos') IS NULL THEN 'absent' ELSE 'present' END;
SELECT 'storage.bucket.godel-files|' || CASE WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'godel-files') THEN 'present' ELSE 'absent' END;
SELECT 'auth.users|' || count(*)::text FROM auth.users;
'@
  $freshnessOutput = @(Invoke-Psql -PsqlPath $psqlCommand.Source -Phase "TARGET_FRESHNESS" -Arguments @(
    "--no-psqlrc", "--tuples-only", "--no-align", "--variable", "ON_ERROR_STOP=1",
    "--command", $freshnessSql
  ))
  $freshness = ConvertTo-KeyValueMap -Lines $freshnessOutput
  $expectedFreshness = @{
    "public.perfiles" = "absent"
    "public.solicitudes" = "absent"
    "public.pedidos" = "absent"
    "storage.bucket.godel-files" = "absent"
    "auth.users" = "0"
  }
  foreach ($key in $expectedFreshness.Keys) {
    if (-not $freshness.ContainsKey($key) -or $freshness[$key] -cne $expectedFreshness[$key]) {
      throw "Target is not fresh."
    }
  }

  $currentStep = "DB PUSH"
  $targetMutated = $true
  $previousSupabaseDbPassword = [Environment]::GetEnvironmentVariable(
    "SUPABASE_DB_PASSWORD",
    "Process"
  )
  try {
    [Environment]::SetEnvironmentVariable(
      "SUPABASE_DB_PASSWORD",
      $targetDbPassword,
      "Process"
    )
    $dbPushExitCode = Invoke-DbPush -NpxPath $npxCommand.Source
  } finally {
    [Environment]::SetEnvironmentVariable(
      "SUPABASE_DB_PASSWORD",
      $previousSupabaseDbPassword,
      "Process"
    )
    $previousSupabaseDbPassword = $null
    $targetDbPassword = $null
  }

  if ($dbPushExitCode -eq 0) {
    $dbPushStatus = "OK"
  } else {
    $currentStep = "DB PUSH RECONCILIATION"
    $registeredMigrationVersions = @(
      Get-RegisteredMigrationVersions `
        -PsqlPath $psqlCommand.Source `
        -Phase "DB_PUSH_RECONCILIATION"
    )
    if (-not (Test-ExpectedMigrationSet `
      -RegisteredVersions $registeredMigrationVersions `
      -ExpectedVersions $migrationVersions
    )) {
      throw "DB push failed and the migration set could not be reconciled."
    }
    $dbPushStatus = "NONZERO / MIGRATIONS RECONCILED"
  }

  $currentStep = "SEED SAFETY"
  $operationalSql = @'
SELECT 'auth.users|' || count(*)::text FROM auth.users;
SELECT 'public.perfiles|' || count(*)::text FROM public.perfiles;
SELECT 'public.clientes|' || count(*)::text FROM public.clientes;
SELECT 'public.solicitudes|' || count(*)::text FROM public.solicitudes;
SELECT 'public.pedidos|' || count(*)::text FROM public.pedidos;
SELECT 'storage.objects|' || count(*)::text FROM storage.objects;
'@
  $operationalOutput = @(Invoke-Psql -PsqlPath $psqlCommand.Source -Phase "SEED_SAFETY" -Arguments @(
    "--no-psqlrc", "--tuples-only", "--no-align", "--variable", "ON_ERROR_STOP=1",
    "--command", $operationalSql
  ))
  $operationalCounts = ConvertTo-KeyValueMap -Lines $operationalOutput
  foreach ($key in @(
    "auth.users",
    "public.perfiles",
    "public.clientes",
    "public.solicitudes",
    "public.pedidos",
    "storage.objects"
  )) {
    if (-not $operationalCounts.ContainsKey($key) -or $operationalCounts[$key] -cne "0") {
      throw "Unexpected operational rows exist after db push."
    }
  }

  $currentStep = "SEED CLEANUP"
  $seedCleanupSql = "DELETE FROM public.tipos_servicio; DELETE FROM storage.buckets WHERE id = 'godel-files';"
  $null = Invoke-Psql -PsqlPath $psqlCommand.Source -Phase "SEED_CLEANUP" -Arguments @(
    "--no-psqlrc", "--single-transaction", "--variable", "ON_ERROR_STOP=1",
    "--command", $seedCleanupSql
  )

  $currentStep = "DATABASE_RESTORE"
  $null = Invoke-Psql -PsqlPath $psqlCommand.Source -Phase "DATABASE_RESTORE" -Arguments @(
    "--no-psqlrc", "--single-transaction", "--variable", "ON_ERROR_STOP=1",
    "--command", "SET session_replication_role = replica;",
    "--file", $backup.DataPath
  )

  $currentStep = "STORAGE"
  if ($backup.StorageFiles.Count -eq 0) {
    $storageStatus = "EMPTY / OK"
  } else {
    $savedPgPassword = [Environment]::GetEnvironmentVariable("PGPASSWORD", "Process")
    $previousCliPhase = [Environment]::GetEnvironmentVariable(
      "GODEL_RESTORE_CLI_PHASE",
      "Process"
    )
    try {
      Push-Location -LiteralPath $backup.StorageRoot
      $storageLocationPushed = $true
      [Environment]::SetEnvironmentVariable(
        "GODEL_RESTORE_CLI_PHASE",
        "STORAGE_UPLOAD",
        "Process"
      )
      [Environment]::SetEnvironmentVariable("PGPASSWORD", $null, "Process")
      $null = Invoke-ExternalCommand -FilePath $supabaseCommandPath -Arguments @(
        "--workdir", $repoRoot,
        "--experimental",
        "storage", "cp", "godel-files", "ss:///godel-files/",
        "-r", "--linked"
      )
    } finally {
      [Environment]::SetEnvironmentVariable(
        "GODEL_RESTORE_CLI_PHASE",
        $previousCliPhase,
        "Process"
      )
      [Environment]::SetEnvironmentVariable("PGPASSWORD", $savedPgPassword, "Process")
      $savedPgPassword = $null
      if ($storageLocationPushed) {
        Pop-Location
        $storageLocationPushed = $false
      }
    }
    $storageStatus = "OK"
  }

  $currentStep = "DATABASE COUNTS"
  $countSql = @'
SELECT 'auth.users|' || count(*)::text FROM auth.users;
SELECT 'auth.identities|' || count(*)::text FROM auth.identities;
SELECT 'public.perfiles|' || count(*)::text FROM public.perfiles;
SELECT 'public.clientes|' || count(*)::text FROM public.clientes;
SELECT 'public.solicitudes|' || count(*)::text FROM public.solicitudes;
SELECT 'public.pedidos|' || count(*)::text FROM public.pedidos;
SELECT 'storage.buckets|' || count(*)::text FROM storage.buckets;
SELECT 'storage.objects|' || count(*)::text FROM storage.objects;
SELECT 'private.internal_user_creation_audit|' || count(*)::text FROM private.internal_user_creation_audit;
SELECT 'private.internal_user_password_reset_audit|' || count(*)::text FROM private.internal_user_password_reset_audit;
'@
  $countOutput = @(Invoke-Psql -PsqlPath $psqlCommand.Source -Phase "DATABASE_COUNTS" -Arguments @(
    "--no-psqlrc", "--tuples-only", "--no-align", "--variable", "ON_ERROR_STOP=1",
    "--command", $countSql
  ))
  $targetCounts = ConvertTo-KeyValueMap -Lines $countOutput
  foreach ($key in $backup.CopyCounts.Keys) {
    if (-not $targetCounts.ContainsKey($key)) {
      throw "Target count output is incomplete."
    }
    $targetCount = [long]0
    if (-not [long]::TryParse($targetCounts[$key], [ref]$targetCount)) {
      throw "Target count output is invalid."
    }
    if ($targetCount -ne [long]$backup.CopyCounts[$key]) {
      throw "Target count does not match the backup COPY count."
    }
  }

  $currentStep = "MIGRATION VERIFICATION"
  $migrationOutput = @(
    Get-RegisteredMigrationVersions `
      -PsqlPath $psqlCommand.Source `
      -Phase "MIGRATIONS"
  )
  if (-not (Test-ExpectedMigrationSet `
    -RegisteredVersions $migrationOutput `
    -ExpectedVersions $migrationVersions
  )) {
    throw "The expected migration set is not registered."
  }

  $currentStep = "BUCKET VERIFICATION"
  $bucketOutput = @(Invoke-Psql -PsqlPath $psqlCommand.Source -Phase "BUCKET" -Arguments @(
    "--no-psqlrc", "--tuples-only", "--no-align", "--variable", "ON_ERROR_STOP=1",
    "--command", "SELECT count(*)::text FROM storage.buckets WHERE id = 'godel-files';"
  ))
  $bucketValues = @($bucketOutput | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ -ne "" })
  if ($bucketValues.Count -ne 1 -or $bucketValues[0] -cne "1") {
    throw "The godel-files bucket is not present exactly once."
  }
  if ($backup.StorageFiles.Count -eq 0 -and [long]$backup.CopyCounts["storage.objects"] -ne 0) {
    throw "Empty physical Storage is inconsistent with storage.objects."
  }

  $currentStep = "BACKUP IMMUTABILITY"
  Assert-BackupUnchanged `
    -BackupDirectory $backup.BackupDirectory `
    -ExpectedInventory $backup.Inventory
} catch {
  $exitCode = 1
  $failureStep = $currentStep
} finally {
  $targetDbPassword = $null
  $previousSupabaseDbPassword = $null

  if ($storageLocationPushed) {
    Pop-Location
    $storageLocationPushed = $false
  }

  if ($null -ne $linkState) {
    try {
      Restore-SupabaseTempState -State $linkState
    } catch {
      if ($exitCode -eq 0) {
        $exitCode = 1
        $failureStep = "LINK STATE RESTORE"
      }
    }
  }

  if ($repoLocationPushed) {
    Pop-Location
    $repoLocationPushed = $false
  }

  if ($null -ne $environmentState) {
    try {
      Restore-ProcessEnvironment -State $environmentState
    } catch {
      if ($exitCode -eq 0) {
        $exitCode = 1
        $failureStep = "ENVIRONMENT RESTORE"
      }
    }
  }
}

if ($exitCode -eq 0) {
  Write-Output "RESTORE COMPLETE"
  Write-Output ("Backup: " + $backup.BackupId)
  Write-Output "Target: VERIFIED DISPOSABLE TARGET"
  Write-Output "Schema: OK"
  Write-Output ("DB push: " + $dbPushStatus)
  Write-Output "Database: OK"
  Write-Output "Database counts: OK"
  Write-Output ("Storage: " + $storageStatus)
} else {
  [Console]::Error.WriteLine("RESTORE FAILED: " + $failureStep)
  if ($failureStep -ceq "DB PUSH RECONCILIATION") {
    [Console]::Error.WriteLine("DB push: FAIL / UNRECONCILED")
  }
  if ($targetMutated) {
    [Console]::Error.WriteLine("Target: FAILED / DISPOSABLE")
  }
}

if ($MyInvocation.InvocationName -eq ".") {
  return $exitCode
}
exit $exitCode

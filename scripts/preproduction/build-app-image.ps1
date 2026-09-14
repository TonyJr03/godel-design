[CmdletBinding()]
param(
    [string]$Tag = "godel-design-app:local",
    [switch]$NoCache,
    [string]$EnvFile = ".env.local"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDirectory = Split-Path -Parent $PSCommandPath
$helper = Join-Path $scriptDirectory "build-app-image.mjs"

if (-not (Test-Path -LiteralPath $helper)) {
    throw "Build helper is missing."
}

$arguments = @($helper, "--tag", $Tag, "--env-file", $EnvFile)
if ($NoCache.IsPresent) {
    $arguments += "--no-cache"
}

& node @arguments
exit $LASTEXITCODE

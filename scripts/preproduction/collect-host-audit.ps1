[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("development-laptop", "company-host")]
    [string]$HostAlias
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$SchemaVersion = "1.0"
$ToolVersion = "0.1.0"
$AllowedStatuses = @("collected", "partial", "unavailable", "manual_required", "error")
$InventorySectionNames = @(
    "powershell",
    "operatingSystem",
    "processor",
    "memory",
    "storage",
    "virtualization",
    "wsl",
    "docker",
    "networkAdapter",
    "firewall",
    "antivirus",
    "power",
    "temperature",
    "manualValidation"
)

function New-AuditSection {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("collected", "partial", "unavailable", "manual_required", "error")]
        [string]$Status,

        [object]$Data = $null,

        [string]$Message = $null
    )

    $section = [ordered]@{
        status = $Status
        data = $Data
    }

    if (-not [string]::IsNullOrWhiteSpace($Message)) {
        $section.message = $Message
    }

    return $section
}

function Convert-ToGiB {
    param([object]$Value)

    if ($null -eq $Value) {
        return $null
    }

    try {
        return [math]::Round(([double]$Value / 1GB), 2)
    } catch {
        return $null
    }
}

function Convert-ToPercent {
    param(
        [object]$Part,
        [object]$Total
    )

    if ($null -eq $Part -or $null -eq $Total) {
        return $null
    }

    try {
        $totalNumber = [double]$Total
        if ($totalNumber -le 0) {
            return $null
        }

        return [math]::Round((([double]$Part / $totalNumber) * 100), 1)
    } catch {
        return $null
    }
}

function Get-PropertyValue {
    param(
        [Parameter(Mandatory = $true)]
        [object]$InputObject,

        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    $property = $InputObject.PSObject.Properties[$Name]
    if ($null -eq $property) {
        return $null
    }

    return $property.Value
}

function Convert-ArchitectureCode {
    param([object]$Value)

    if ($null -eq $Value) {
        return $null
    }

    switch ([int]$Value) {
        0 { return "x86" }
        1 { return "MIPS" }
        2 { return "Alpha" }
        3 { return "PowerPC" }
        5 { return "ARM" }
        6 { return "Itanium" }
        9 { return "x64" }
        12 { return "ARM64" }
        default { return "unknown" }
    }
}

function Convert-DriveType {
    param([object]$Value)

    switch ([int]$Value) {
        2 { return "removable" }
        3 { return "local_disk" }
        4 { return "network" }
        5 { return "compact_disc" }
        6 { return "ram_disk" }
        default { return "unknown" }
    }
}

function Convert-NetworkStatus {
    param([object]$Value)

    if ($null -eq $Value) {
        return "unknown"
    }

    switch ([int]$Value) {
        0 { return "disconnected" }
        1 { return "connecting" }
        2 { return "connected" }
        3 { return "disconnecting" }
        4 { return "hardware_not_present" }
        5 { return "hardware_disabled" }
        6 { return "hardware_malfunction" }
        7 { return "media_disconnected" }
        8 { return "authenticating" }
        9 { return "authentication_succeeded" }
        10 { return "authentication_failed" }
        11 { return "invalid_address" }
        12 { return "credentials_required" }
        default { return "unknown" }
    }
}

function Convert-StorageEnum {
    param(
        [object]$Value,
        [hashtable]$Map
    )

    if ($null -eq $Value) {
        return $null
    }

    try {
        $key = [int]$Value
        if ($Map.ContainsKey($key)) {
            return $Map[$key]
        }
    } catch {
        return "unknown"
    }

    return "unknown"
}

function Sanitize-ExternalName {
    param([object]$Value)

    if ($null -eq $Value) {
        return $null
    }

    $text = [string]$Value
    $text = $text -replace "[^A-Za-z0-9._ -]", "_"
    $text = $text.Trim()
    if ($text.Length -gt 80) {
        $text = $text.Substring(0, 80)
    }

    if ([string]::IsNullOrWhiteSpace($text)) {
        return "sanitized-name"
    }

    return $text
}

function Invoke-ExternalCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FileName,

        [string[]]$Arguments = @()
    )

    $command = Get-Command -Name $FileName -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        return [ordered]@{
            available = $false
            exitCode = $null
            lines = @()
        }
    }

    $output = & $FileName @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    $lines = @()
    foreach ($line in $output) {
        $lines += (([string]$line) -replace "`0", "")
    }

    return [ordered]@{
        available = $true
        exitCode = $exitCode
        lines = $lines
    }
}

function Invoke-Section {
    param(
        [Parameter(Mandatory = $true)]
        [scriptblock]$Collector
    )

    try {
        return & $Collector
    } catch {
        return New-AuditSection -Status "error" -Message ("Query failed: " + $_.Exception.GetType().Name)
    }
}

function ConvertFrom-PowerCfgAvailableStates {
    param([string[]]$Lines)

    $availableHeaderPattern = "(?i)(following\s+sleep\s+states\s+are\s+available|siguientes\s+estados\s+de\s+suspensi[oó]n\s+est[aá]n\s+disponibles|estados\s+de\s+suspensi[oó]n\s+disponibles)"
    $unavailableHeaderPattern = "(?i)(following\s+sleep\s+states\s+are\s+not\s+available|siguientes\s+estados\s+de\s+suspensi[oó]n\s+no\s+est[aá]n\s+disponibles|estados\s+de\s+suspensi[oó]n\s+no\s+disponibles)"
    $availableStart = $null
    $availableEnd = $null

    for ($index = 0; $index -lt $Lines.Count; $index++) {
        if ($null -eq $availableStart -and $Lines[$index] -match $availableHeaderPattern) {
            $availableStart = $index + 1
            continue
        }

        if ($null -ne $availableStart -and $Lines[$index] -match $unavailableHeaderPattern) {
            $availableEnd = $index - 1
            break
        }
    }

    if ($null -eq $availableStart -or $null -eq $availableEnd -or $availableEnd -lt $availableStart) {
        return [ordered]@{
            status = "partial"
            availableSleepStates = @()
            hibernationAvailable = $null
            message = "Power state output could not be interpreted reliably."
        }
    }

    $availableLines = @()
    for ($index = $availableStart; $index -le $availableEnd; $index++) {
        $line = ([string]$Lines[$index]).Trim()
        if (-not [string]::IsNullOrWhiteSpace($line)) {
            $availableLines += $line
        }
    }

    $sleepStates = @()
    foreach ($line in $availableLines) {
        if ($line -match "(?i)(standby|suspensi[oó]n|espera)") {
            foreach ($state in @("S0", "S1", "S2", "S3")) {
                if ($line -match ("\b" + $state + "\b")) {
                    $sleepStates += $state
                }
            }
        }
    }

    $hibernateAvailable = $false
    foreach ($line in $availableLines) {
        if ($line -match "(?i)\b(hibernate|hibernation|hibernar|hibernaci[oó]n)\b") {
            $hibernateAvailable = $true
            break
        }
    }

    return [ordered]@{
        status = "collected"
        availableSleepStates = @($sleepStates | Select-Object -Unique)
        hibernationAvailable = $hibernateAvailable
        message = $null
    }
}

function Get-PowerShellAudit {
    return New-AuditSection -Status "collected" -Data ([ordered]@{
        edition = $PSVersionTable.PSEdition
        version = $PSVersionTable.PSVersion.ToString()
        processArchitecture = if ([Environment]::Is64BitProcess) { "64-bit" } else { "32-bit" }
    })
}

function Get-OperatingSystemAudit {
    $os = Get-CimInstance -ClassName Win32_OperatingSystem
    $lastBoot = Get-PropertyValue -InputObject $os -Name "LastBootUpTime"
    $uptimeHours = $null
    if ($null -ne $lastBoot) {
        try {
            $uptimeHours = [math]::Round(((Get-Date) - $lastBoot).TotalHours, 1)
        } catch {
            $uptimeHours = $null
        }
    }

    return New-AuditSection -Status "collected" -Data ([ordered]@{
        caption = Get-PropertyValue -InputObject $os -Name "Caption"
        version = Get-PropertyValue -InputObject $os -Name "Version"
        build = Get-PropertyValue -InputObject $os -Name "BuildNumber"
        architecture = Get-PropertyValue -InputObject $os -Name "OSArchitecture"
        approximateUptimeHours = $uptimeHours
    })
}

function Get-ProcessorAudit {
    $processors = @(Get-CimInstance -ClassName Win32_Processor)
    if ($processors.Count -eq 0) {
        return New-AuditSection -Status "unavailable" -Message "Processor information was not available."
    }

    $items = @()
    foreach ($processor in $processors) {
        $items += [ordered]@{
            manufacturer = Get-PropertyValue -InputObject $processor -Name "Manufacturer"
            model = Get-PropertyValue -InputObject $processor -Name "Name"
            architecture = Convert-ArchitectureCode -Value (Get-PropertyValue -InputObject $processor -Name "Architecture")
            physicalCores = Get-PropertyValue -InputObject $processor -Name "NumberOfCores"
            logicalProcessors = Get-PropertyValue -InputObject $processor -Name "NumberOfLogicalProcessors"
            virtualizationFirmwareEnabled = Get-PropertyValue -InputObject $processor -Name "VirtualizationFirmwareEnabled"
            secondLevelAddressTranslation = Get-PropertyValue -InputObject $processor -Name "SecondLevelAddressTranslationExtensions"
            vmMonitorModeExtensions = Get-PropertyValue -InputObject $processor -Name "VMMonitorModeExtensions"
        }
    }

    return New-AuditSection -Status "collected" -Data ([ordered]@{
        processorCount = $items.Count
        processors = $items
    })
}

function Get-MemoryAudit {
    $os = Get-CimInstance -ClassName Win32_OperatingSystem
    $totalKiB = Get-PropertyValue -InputObject $os -Name "TotalVisibleMemorySize"
    $freeKiB = Get-PropertyValue -InputObject $os -Name "FreePhysicalMemory"
    $usedKiB = $null
    if ($null -ne $totalKiB -and $null -ne $freeKiB) {
        $usedKiB = ([double]$totalKiB - [double]$freeKiB)
    }

    return New-AuditSection -Status "collected" -Data ([ordered]@{
        totalGiB = Convert-ToGiB -Value ([double]$totalKiB * 1KB)
        availableGiB = Convert-ToGiB -Value ([double]$freeKiB * 1KB)
        approximateUsedPercent = Convert-ToPercent -Part $usedKiB -Total $totalKiB
    })
}

function Get-LogicalStorageAudit {
    $disks = @(Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DriveType=3")
    if ($disks.Count -eq 0) {
        return New-AuditSection -Status "unavailable" -Message "No local logical disks were reported."
    }

    $items = @()
    foreach ($disk in $disks) {
        $size = Get-PropertyValue -InputObject $disk -Name "Size"
        $free = Get-PropertyValue -InputObject $disk -Name "FreeSpace"
        $items += [ordered]@{
            drive = Get-PropertyValue -InputObject $disk -Name "DeviceID"
            type = Convert-DriveType -Value (Get-PropertyValue -InputObject $disk -Name "DriveType")
            capacityGiB = Convert-ToGiB -Value $size
            freeGiB = Convert-ToGiB -Value $free
            freePercent = Convert-ToPercent -Part $free -Total $size
        }
    }

    return New-AuditSection -Status "collected" -Data ([ordered]@{
        disks = $items
    })
}

function Get-PhysicalStorageAudit {
    $mediaTypeMap = @{
        0 = "unspecified"
        3 = "hdd"
        4 = "ssd"
        5 = "scm"
    }
    $busTypeMap = @{
        0 = "unknown"
        1 = "scsi"
        2 = "atapi"
        3 = "ata"
        4 = "ieee1394"
        5 = "ssa"
        6 = "fibre_channel"
        7 = "usb"
        8 = "raid"
        9 = "iscsi"
        10 = "sas"
        11 = "sata"
        12 = "sd"
        13 = "mmc"
        14 = "virtual"
        15 = "file_backed_virtual"
        16 = "storage_spaces"
        17 = "nvme"
    }
    $healthMap = @{
        0 = "healthy"
        1 = "warning"
        2 = "unhealthy"
        5 = "unknown"
    }

    try {
        $physicalDisks = @(Get-CimInstance -Namespace "root/Microsoft/Windows/Storage" -ClassName MSFT_PhysicalDisk)
    } catch {
        return New-AuditSection -Status "unavailable" -Message "Physical storage API was not available without additional permissions or support."
    }

    if ($physicalDisks.Count -eq 0) {
        return New-AuditSection -Status "unavailable" -Message "No physical disks were reported by the storage API."
    }

    $items = @()
    foreach ($disk in $physicalDisks) {
        $operationalStatus = Get-PropertyValue -InputObject $disk -Name "OperationalStatus"
        $operationalStatusValues = @()
        if ($null -ne $operationalStatus) {
            foreach ($status in @($operationalStatus)) {
                $operationalStatusValues += [string]$status
            }
        }

        $items += [ordered]@{
            mediaType = Convert-StorageEnum -Value (Get-PropertyValue -InputObject $disk -Name "MediaType") -Map $mediaTypeMap
            busType = Convert-StorageEnum -Value (Get-PropertyValue -InputObject $disk -Name "BusType") -Map $busTypeMap
            capacityGiB = Convert-ToGiB -Value (Get-PropertyValue -InputObject $disk -Name "Size")
            healthStatus = Convert-StorageEnum -Value (Get-PropertyValue -InputObject $disk -Name "HealthStatus") -Map $healthMap
            operationalStatus = $operationalStatusValues
        }
    }

    return New-AuditSection -Status "collected" -Data ([ordered]@{
        disks = $items
    })
}

function Get-StorageAudit {
    $logical = Invoke-Section -Collector { Get-LogicalStorageAudit }
    $physical = Invoke-Section -Collector { Get-PhysicalStorageAudit }
    $status = "collected"
    $message = $null

    if ($logical.status -ne "collected" -or $physical.status -ne "collected") {
        $status = "partial"
        $message = "One or more storage subsections were not fully collected."
    }

    return New-AuditSection -Status $status -Data ([ordered]@{
        logical = $logical
        physical = $physical
    }) -Message $message
}

function Get-VirtualizationAudit {
    $computer = Get-CimInstance -ClassName Win32_ComputerSystem
    $processors = @(Get-CimInstance -ClassName Win32_Processor)
    $firmwareFlags = @()
    foreach ($processor in $processors) {
        $firmwareFlags += (Get-PropertyValue -InputObject $processor -Name "VirtualizationFirmwareEnabled")
    }

    return New-AuditSection -Status "collected" -Data ([ordered]@{
        hypervisorPresent = Get-PropertyValue -InputObject $computer -Name "HypervisorPresent"
        processorVirtualizationFirmwareEnabled = $firmwareFlags
    })
}

function Get-WslAudit {
    $statusResult = Invoke-ExternalCommand -FileName "wsl.exe" -Arguments @("--status")
    if (-not $statusResult.available) {
        return New-AuditSection -Status "unavailable" -Data ([ordered]@{
            clientAvailable = $false
        }) -Message "wsl.exe was not available."
    }

    $versionResult = Invoke-ExternalCommand -FileName "wsl.exe" -Arguments @("--version")
    $defaultVersion = $null
    $wslVersion = $null

    if ($versionResult.available -and $versionResult.exitCode -eq 0) {
        foreach ($line in $versionResult.lines) {
            if ($line -match "(?i)^\s*(WSL\s+version|Versi[oó]n\s+de\s+WSL)\s*:\s*([0-9A-Za-z._-]+)") {
                $wslVersion = $Matches[2]
                break
            }
        }
    }

    foreach ($line in $statusResult.lines) {
        if ($line -match "(?i)(Default\s+Version|Versi[oó]n\s+predeterminada)\s*:\s*(\d+)") {
            $defaultVersion = $Matches[2]
        } elseif ($null -eq $wslVersion -and $line -match "(?i)(WSL\s+version|Versi[oó]n\s+de\s+WSL)\s*:\s*([0-9A-Za-z._-]+)") {
            $wslVersion = $Matches[2]
        }
    }

    $listResult = Invoke-ExternalCommand -FileName "wsl.exe" -Arguments @("--list", "--verbose")
    $distributions = @()
    $unparsedDistributionLines = 0
    if ($listResult.available -and $listResult.exitCode -eq 0) {
        foreach ($line in $listResult.lines) {
            $trimmed = $line.Trim()
            if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed -match "(?i)(NAME|NOMBRE)\s+(STATE|ESTADO)\s+(VERSION|VERSI[oó]N)") {
                continue
            }

            if ($trimmed -match "^\*?\s*(\S+)\s+(\S+)\s+(\d+)\s*$") {
                $distributions += [ordered]@{
                    name = Sanitize-ExternalName -Value $Matches[1]
                    state = Sanitize-ExternalName -Value $Matches[2]
                    version = $Matches[3]
                }
            } elseif ($trimmed -notmatch "(?i)(no installed distributions|no hay distribuciones|no se encontr|use.*wsl)") {
                $unparsedDistributionLines++
            }
        }
    }

    $status = "collected"
    $messages = @()
    if (-not ($versionResult.available) -or $versionResult.exitCode -ne 0) {
        $status = "partial"
        $messages += "WSL version command was unavailable or unsupported."
    } elseif ($null -eq $wslVersion) {
        $status = "partial"
        $messages += "WSL version output could not be interpreted."
    }
    if ($statusResult.exitCode -ne 0) {
        $status = "partial"
        $messages += "WSL status query did not complete successfully."
    } elseif ($null -eq $defaultVersion) {
        $status = "partial"
        $messages += "WSL default version could not be interpreted."
    }
    if (-not ($listResult.available) -or $listResult.exitCode -ne 0) {
        $status = "partial"
        $messages += "WSL distribution list query did not complete successfully."
    } elseif ($unparsedDistributionLines -gt 0) {
        $status = "partial"
        $messages += "One or more WSL distribution lines could not be interpreted."
    }

    return New-AuditSection -Status $status -Data ([ordered]@{
        clientAvailable = $true
        versionCommandSucceeded = ($versionResult.available -and $versionResult.exitCode -eq 0)
        statusCommandSucceeded = ($statusResult.exitCode -eq 0)
        listCommandSucceeded = ($listResult.available -and $listResult.exitCode -eq 0)
        wslVersion = $wslVersion
        defaultVersion = $defaultVersion
        distributions = $distributions
    }) -Message ($messages -join " ")
}

function Get-DockerAudit {
    $versionText = Invoke-ExternalCommand -FileName "docker.exe" -Arguments @("--version")
    if (-not $versionText.available) {
        return New-AuditSection -Status "unavailable" -Data ([ordered]@{
            clientAvailable = $false
        }) -Message "docker.exe was not available."
    }

    $clientVersion = $null
    if ($versionText.exitCode -eq 0) {
        foreach ($line in $versionText.lines) {
            if ($line -match "version\s+([0-9A-Za-z._+-]+)") {
                $clientVersion = $Matches[1]
                break
            }
        }
    }

    $versionJson = Invoke-ExternalCommand -FileName "docker.exe" -Arguments @("version", "--format", "{{json .}}")
    $serverVersion = $null
    $serverArchitecture = $null
    $serverOs = $null
    if ($versionJson.available -and $versionJson.exitCode -eq 0 -and $versionJson.lines.Count -gt 0) {
        try {
            $versionObject = ($versionJson.lines -join "`n") | ConvertFrom-Json
            if ($null -ne (Get-PropertyValue -InputObject $versionObject -Name "Server")) {
                $server = $versionObject.Server
                $serverVersion = Get-PropertyValue -InputObject $server -Name "Version"
                $serverArchitecture = Get-PropertyValue -InputObject $server -Name "Arch"
                $serverOs = Get-PropertyValue -InputObject $server -Name "Os"
            }
        } catch {
            $serverVersion = $null
        }
    }

    $infoJson = Invoke-ExternalCommand -FileName "docker.exe" -Arguments @("info", "--format", "{{json .}}")
    $daemonAvailable = ($infoJson.available -and $infoJson.exitCode -eq 0 -and $infoJson.lines.Count -gt 0)
    $daemonData = [ordered]@{
        available = $daemonAvailable
        serverVersion = $serverVersion
        architecture = $serverArchitecture
        operatingSystem = $serverOs
        osType = $null
        visibleCpuCount = $null
        visibleMemoryGiB = $null
        containerMode = $null
    }

    if ($daemonAvailable) {
        try {
            $infoObject = ($infoJson.lines -join "`n") | ConvertFrom-Json
            $osType = Get-PropertyValue -InputObject $infoObject -Name "OSType"
            $daemonData.operatingSystem = Get-PropertyValue -InputObject $infoObject -Name "OperatingSystem"
            $daemonData.osType = $osType
            $daemonData.architecture = Get-PropertyValue -InputObject $infoObject -Name "Architecture"
            $daemonData.visibleCpuCount = Get-PropertyValue -InputObject $infoObject -Name "NCPU"
            $daemonData.visibleMemoryGiB = Convert-ToGiB -Value (Get-PropertyValue -InputObject $infoObject -Name "MemTotal")
            if ($osType -eq "linux") {
                $daemonData.containerMode = "linux_containers"
            } elseif ($osType -eq "windows") {
                $daemonData.containerMode = "windows_containers"
            }
        } catch {
            $daemonAvailable = $false
            $daemonData.available = $false
        }
    }

    $status = "collected"
    $message = $null
    if (-not $daemonAvailable) {
        $status = "partial"
        $message = "Docker client was available, but daemon information was not available."
    }

    return New-AuditSection -Status $status -Data ([ordered]@{
        clientAvailable = $true
        clientVersion = $clientVersion
        daemon = $daemonData
    }) -Message $message
}

function Get-NetworkAdapterAudit {
    $adapters = @(Get-CimInstance -ClassName Win32_NetworkAdapter -Filter "NetEnabled=True AND PhysicalAdapter=True")
    if ($adapters.Count -eq 0) {
        return New-AuditSection -Status "unavailable" -Message "No active physical network adapter was reported."
    }

    $items = @()
    foreach ($adapter in $adapters) {
        $speed = Get-PropertyValue -InputObject $adapter -Name "Speed"
        $items += [ordered]@{
            description = Sanitize-ExternalName -Value (Get-PropertyValue -InputObject $adapter -Name "Description")
            status = Convert-NetworkStatus -Value (Get-PropertyValue -InputObject $adapter -Name "NetConnectionStatus")
            linkSpeedMbps = if ($null -ne $speed) { [math]::Round(([double]$speed / 1000000), 0) } else { $null }
            mediaType = Sanitize-ExternalName -Value (Get-PropertyValue -InputObject $adapter -Name "AdapterType")
        }
    }

    return New-AuditSection -Status "collected" -Data ([ordered]@{
        activePhysicalAdapters = $items
    })
}

function Get-FirewallAudit {
    $command = Get-Command -Name "Get-NetFirewallProfile" -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        return New-AuditSection -Status "unavailable" -Message "Firewall profile cmdlet was not available."
    }

    $profiles = @(Get-NetFirewallProfile)
    $items = @()
    foreach ($profile in $profiles) {
        $name = Get-PropertyValue -InputObject $profile -Name "Name"
        if ($name -in @("Domain", "Private", "Public")) {
            $items += [ordered]@{
                profile = $name
                enabled = Get-PropertyValue -InputObject $profile -Name "Enabled"
            }
        }
    }

    return New-AuditSection -Status "collected" -Data ([ordered]@{
        profiles = $items
    })
}

function Get-AntivirusAudit {
    try {
        $products = @(Get-CimInstance -Namespace "root/SecurityCenter2" -ClassName AntiVirusProduct)
    } catch {
        return New-AuditSection -Status "unavailable" -Message "SecurityCenter2 antivirus information was not available."
    }

    if ($products.Count -eq 0) {
        return New-AuditSection -Status "unavailable" -Data ([ordered]@{
            productDetected = $false
            activeProtection = "unknown"
            realTimeProtection = "unknown"
            signatureAge = "unknown"
            products = @()
        }) -Message "No antivirus product was reported."
    }

    $items = @()
    foreach ($product in $products) {
        $state = Get-PropertyValue -InputObject $product -Name "productState"
        $items += [ordered]@{
            product = Sanitize-ExternalName -Value (Get-PropertyValue -InputObject $product -Name "displayName")
            productStateHex = if ($null -ne $state) { ("0x{0:X6}" -f [int]$state) } else { $null }
            activeProtection = "unknown"
            realTimeProtection = "unknown"
            signatureAge = "unknown"
        }
    }

    return New-AuditSection -Status "partial" -Data ([ordered]@{
        productDetected = ($items.Count -gt 0)
        activeProtection = "unknown"
        realTimeProtection = "unknown"
        signatureAge = "unknown"
        products = $items
    }) -Message "Antivirus product was detected; active protection state was not asserted."
}

function Get-PowerAudit {
    $schemeResult = Invoke-ExternalCommand -FileName "powercfg.exe" -Arguments @("/GETACTIVESCHEME")
    $statesResult = Invoke-ExternalCommand -FileName "powercfg.exe" -Arguments @("/A")

    if (-not $schemeResult.available -and -not $statesResult.available) {
        return New-AuditSection -Status "unavailable" -Message "powercfg.exe was not available."
    }

    $activeScheme = $null
    if ($schemeResult.available -and $schemeResult.exitCode -eq 0) {
        foreach ($line in $schemeResult.lines) {
            if ($line -match "\(([^)]+)\)") {
                $activeScheme = Sanitize-ExternalName -Value $Matches[1]
                break
            }
        }
        if ($null -eq $activeScheme) {
            $activeScheme = "available_without_guid"
        }
    }

    $sleepStates = @()
    $hibernateAvailable = $null
    $powerStateParse = [ordered]@{
        status = "partial"
        availableSleepStates = @()
        hibernationAvailable = $null
        message = "Power state query did not complete successfully."
    }
    if ($statesResult.available -and $statesResult.exitCode -eq 0) {
        $powerStateParse = ConvertFrom-PowerCfgAvailableStates -Lines $statesResult.lines
        $sleepStates = $powerStateParse.availableSleepStates
        $hibernateAvailable = $powerStateParse.hibernationAvailable
    }

    $status = "collected"
    $messages = @()
    if (($schemeResult.available -and $schemeResult.exitCode -ne 0) -or ($statesResult.available -and $statesResult.exitCode -ne 0)) {
        $status = "partial"
        $messages += "One or more powercfg queries did not complete successfully."
    }
    if ($powerStateParse.status -ne "collected") {
        $status = "partial"
        $messages += $powerStateParse.message
    }

    return New-AuditSection -Status $status -Data ([ordered]@{
        activeScheme = $activeScheme
        availableSleepStates = $sleepStates
        hibernationAvailable = $hibernateAvailable
        manualChecksRequired = @(
            "UPS",
            "auto_power_on_after_power_loss",
            "bios_or_uefi_power_settings",
            "real_power_loss_behavior"
        )
    }) -Message ($messages -join " ")
}

function Get-TemperatureAudit {
    try {
        $readings = @(Get-CimInstance -Namespace "root/wmi" -ClassName MSAcpi_ThermalZoneTemperature)
    } catch {
        return New-AuditSection -Status "unavailable" -Message "Windows thermal zone information was not available."
    }

    $values = @()
    foreach ($reading in $readings) {
        $raw = Get-PropertyValue -InputObject $reading -Name "CurrentTemperature"
        if ($null -ne $raw) {
            $celsius = [math]::Round((([double]$raw / 10) - 273.15), 1)
            if ($celsius -ge -20 -and $celsius -le 130) {
                $values += $celsius
            }
        }
    }

    if ($values.Count -eq 0) {
        return New-AuditSection -Status "unavailable" -Message "No reliable temperature reading was available through built-in Windows mechanisms."
    }

    return New-AuditSection -Status "collected" -Data ([ordered]@{
        source = "Windows thermal zone"
        readingCount = $values.Count
        minimumCelsius = ($values | Measure-Object -Minimum).Minimum
        maximumCelsius = ($values | Measure-Object -Maximum).Maximum
    })
}

function Get-ManualValidationAudit {
    $items = @(
        "ram_expansion_possible",
        "storage_expansion_possible",
        "ups_presence_and_capacity",
        "auto_power_on_after_power_loss",
        "real_power_loss_behavior",
        "usual_resource_competing_applications",
        "peak_load_hours",
        "company_operational_restrictions",
        "manufacturer_temperature_tool_if_required"
    )

    $pending = @()
    foreach ($item in $items) {
        $pending += [ordered]@{
            item = $item
            status = "manual_required"
        }
    }

    return New-AuditSection -Status "manual_required" -Data ([ordered]@{
        pending = $pending
    })
}

function New-CollectionSummary {
    param([hashtable]$Sections)

    $counts = [ordered]@{}
    foreach ($status in $AllowedStatuses) {
        $counts[$status] = 0
    }

    $warnings = @()
    foreach ($key in $Sections.Keys) {
        $section = $Sections[$key]
        $status = [string]$section.status
        if ($counts.Contains($status)) {
            $counts[$status] = $counts[$status] + 1
        }
        if ($status -ne "collected" -and $section.Contains("message")) {
            $warnings += [ordered]@{
                section = $key
                status = $status
                message = $section.message
            }
        }
    }

    $overall = "completed"
    if ($counts["error"] -gt 0) {
        $overall = "completed_with_section_errors"
    } elseif ($counts["partial"] -gt 0 -or $counts["unavailable"] -gt 0 -or $counts["manual_required"] -gt 0) {
        $overall = "completed_with_expected_gaps"
    }

    return New-AuditSection -Status "collected" -Data ([ordered]@{
        overallStatus = $overall
        sectionCounts = $counts
        warnings = $warnings
    })
}

function Get-NormalizedAuditPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    return ($Path -replace "\[\d+\]", "[]")
}

function Test-AuthorizedVersionPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $normalizedPath = Get-NormalizedAuditPath -Path $Path
    $authorizedPaths = @(
        "schemaVersion",
        "toolVersion",
        "powershell.data.version",
        "operatingSystem.data.version",
        "operatingSystem.data.build",
        "wsl.data.wslVersion",
        "wsl.data.defaultVersion",
        "wsl.data.distributions[].version",
        "docker.data.clientVersion",
        "docker.data.daemon.serverVersion"
    )

    return ($authorizedPaths -contains $normalizedPath)
}

function Test-StrictVersionValue {
    param([object]$Value)

    if ($null -eq $Value) {
        return $true
    }

    $text = [string]$Value
    return ($text -match "^\d+(\.\d+){0,3}$")
}

function Test-EnvironmentIdentifierInContent {
    param([Parameter(Mandatory = $true)][string]$Content)

    $issues = @()

    foreach ($value in @($env:COMPUTERNAME, $env:USERNAME)) {
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            $escaped = [regex]::Escape([string]$value)
            $pattern = "(?i)(^|[^A-Za-z0-9])" + $escaped + "($|[^A-Za-z0-9])"
            if ($Content -match $pattern) {
                $issues += "environment_identity_token"
            }
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($env:USERPROFILE)) {
        if ($Content.IndexOf([string]$env:USERPROFILE, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
            $issues += "environment_profile_path"
        }
    }

    return @($issues | Select-Object -Unique)
}

function Test-SensitiveScalarContent {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Content
    )

    $issues = @()
    $patterns = [ordered]@{
        email = "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"
        macAddress = "\b([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b"
        ipv4 = "\b((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)\b"
        ipv6 = "(?i)\b(?:[0-9a-f]{1,4}:){2,}[0-9a-f]{1,4}\b|\b[0-9a-f]{1,4}::[0-9a-f:]*\b|\b[0-9a-f:]*::[0-9a-f]{1,4}\b"
        jwt = "eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"
        bearerToken = "(?i)\bBearer\s+[A-Za-z0-9._-]+"
        privateKey = "-----BEGIN\s+[A-Z ]*PRIVATE KEY-----"
        dockerEndpoint = "(?i)\b(npipe|tcp|unix)://"
        envAssignment = "(?m)^[A-Za-z_][A-Za-z0-9_]*="
    }

    foreach ($key in $patterns.Keys) {
        if ($Content -match $patterns[$key]) {
            $issues += $key
        }
    }

    $issues += Test-EnvironmentIdentifierInContent -Content $Content
    return @($issues | Select-Object -Unique)
}

function Test-SensitiveAuditObject {
    param(
        [object]$Value,
        [string]$Path = ""
    )

    $issues = @()

    if ($null -eq $Value) {
        return @()
    }

    if ($Value -is [System.Collections.IDictionary]) {
        foreach ($key in $Value.Keys) {
            $childPath = if ([string]::IsNullOrWhiteSpace($Path)) { [string]$key } else { $Path + "." + [string]$key }
            $issues += Test-SensitiveAuditObject -Value $Value[$key] -Path $childPath
        }
        return @($issues | Select-Object -Unique)
    }

    if ($Value -is [pscustomobject]) {
        foreach ($property in $Value.PSObject.Properties) {
            $childPath = if ([string]::IsNullOrWhiteSpace($Path)) { $property.Name } else { $Path + "." + $property.Name }
            $issues += Test-SensitiveAuditObject -Value $property.Value -Path $childPath
        }
        return @($issues | Select-Object -Unique)
    }

    if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string])) {
        $index = 0
        foreach ($item in $Value) {
            $issues += Test-SensitiveAuditObject -Value $item -Path ($Path + "[" + $index + "]")
            $index++
        }
        return @($issues | Select-Object -Unique)
    }

    $text = [string]$Value
    if (Test-AuthorizedVersionPath -Path $Path) {
        if (-not (Test-StrictVersionValue -Value $Value)) {
            $issues += "invalid_version_value"
        }
        $issues += Test-EnvironmentIdentifierInContent -Content $text
        return @($issues | Select-Object -Unique)
    }

    $issues += Test-SensitiveScalarContent -Content $text
    return @($issues | Select-Object -Unique)
}

function ConvertTo-SensitiveTextScanObject {
    param(
        [object]$Value,
        [string]$Path = ""
    )

    if ($null -eq $Value) {
        return $null
    }

    if ($Value -is [System.Collections.IDictionary]) {
        $copy = [ordered]@{}
        foreach ($key in $Value.Keys) {
            $childPath = if ([string]::IsNullOrWhiteSpace($Path)) { [string]$key } else { $Path + "." + [string]$key }
            $copy[$key] = ConvertTo-SensitiveTextScanObject -Value $Value[$key] -Path $childPath
        }
        return $copy
    }

    if ($Value -is [pscustomobject]) {
        $copy = [ordered]@{}
        foreach ($property in $Value.PSObject.Properties) {
            $childPath = if ([string]::IsNullOrWhiteSpace($Path)) { $property.Name } else { $Path + "." + $property.Name }
            $copy[$property.Name] = ConvertTo-SensitiveTextScanObject -Value $property.Value -Path $childPath
        }
        return $copy
    }

    if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string])) {
        $copy = @()
        $index = 0
        foreach ($item in $Value) {
            $copy += ConvertTo-SensitiveTextScanObject -Value $item -Path ($Path + "[" + $index + "]")
            $index++
        }
        return $copy
    }

    if ((Test-AuthorizedVersionPath -Path $Path) -and (Test-StrictVersionValue -Value $Value)) {
        return "VERSION_VALUE"
    }

    return $Value
}

function Test-SensitiveContent {
    param([Parameter(Mandatory = $true)][string]$Content)

    return Test-SensitiveScalarContent -Content $Content
}

function New-SummaryMarkdown {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Audit
    )

    $summary = $Audit.collectionSummary.data
    $manual = $Audit.manualValidation.data.pending
    $lines = New-Object System.Collections.Generic.List[string]

    $lines.Add("# PPO-01 Host Audit Summary")
    $lines.Add("")
    $lines.Add("- Host alias: " + $Audit.hostAlias)
    $lines.Add("- Collected at UTC: " + $Audit.collectedAtUtc)
    $lines.Add("- Overall status: " + $summary.overallStatus)
    $lines.Add("")
    $lines.Add("## Section status")
    $lines.Add("")
    foreach ($status in $AllowedStatuses) {
        $lines.Add("- " + $status + ": " + $summary.sectionCounts[$status])
    }
    $lines.Add("")
    $lines.Add("## Sections by category")
    $lines.Add("")

    foreach ($status in @("collected", "partial", "unavailable", "manual_required", "error")) {
        $names = @()
        foreach ($name in $InventorySectionNames) {
            if ($Audit[$name].status -eq $status) {
                $names += $name
            }
        }
        $lines.Add("- " + $status + ": " + (($names -join ", ")))
    }

    $lines.Add("")
    $lines.Add("## Manual validation pending")
    $lines.Add("")
    foreach ($item in $manual) {
        $lines.Add("- " + $item.item)
    }

    $lines.Add("")
    $lines.Add("## Sanitized warnings")
    $lines.Add("")
    if ($summary.warnings.Count -eq 0) {
        $lines.Add("- None.")
    } else {
        foreach ($warning in $summary.warnings) {
            $lines.Add("- " + $warning.section + " [" + $warning.status + "]: " + $warning.message)
        }
    }

    return ($lines -join [Environment]::NewLine)
}

function Get-EvidenceRoot {
    $base = $env:LOCALAPPDATA
    if ([string]::IsNullOrWhiteSpace($base)) {
        $base = $env:TEMP
    }
    if ([string]::IsNullOrWhiteSpace($base)) {
        throw "Neither LOCALAPPDATA nor TEMP is available."
    }

    return (Join-Path -Path $base -ChildPath "GodelDesign\PPO-01\host-audits")
}

function Ensure-DirectoryExists {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

function New-RunDirectory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$EvidenceRoot,

        [Parameter(Mandatory = $true)]
        [string]$Alias
    )

    $ppoDirectory = Split-Path -Parent $EvidenceRoot
    $godelDirectory = Split-Path -Parent $ppoDirectory
    Ensure-DirectoryExists -Path $godelDirectory
    Ensure-DirectoryExists -Path $ppoDirectory
    Ensure-DirectoryExists -Path $EvidenceRoot

    $aliasDirectory = Join-Path -Path $EvidenceRoot -ChildPath $Alias
    Ensure-DirectoryExists -Path $aliasDirectory

    for ($attempt = 0; $attempt -lt 5; $attempt++) {
        $timestampUtc = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssfffffffZ")
        $candidate = Join-Path -Path $aliasDirectory -ChildPath $timestampUtc
        if (-not (Test-Path -LiteralPath $candidate)) {
            New-Item -ItemType Directory -Path $candidate | Out-Null
            return $candidate
        }

        Start-Sleep -Milliseconds 10
    }

    throw "Unable to create a unique evidence directory."
}

function Remove-CurrentRunArtifacts {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RunDirectory,

        [string[]]$Files = @()
    )

    foreach ($file in $Files) {
        if (-not [string]::IsNullOrWhiteSpace($file) -and (Test-Path -LiteralPath $file)) {
            Remove-Item -LiteralPath $file -Force
        }
    }

    if (Test-Path -LiteralPath $RunDirectory) {
        $remaining = @(Get-ChildItem -LiteralPath $RunDirectory -Force)
        if ($remaining.Count -eq 0) {
            Remove-Item -LiteralPath $RunDirectory -Force
        }
    }
}

function Main {
    Write-Host "Collecting PPO-01 host audit inventory..."

    $collectedAtUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    $evidenceRoot = Get-EvidenceRoot
    $runDirectory = $null
    $createdFiles = @()
    $runDirectory = New-RunDirectory -EvidenceRoot $evidenceRoot -Alias $HostAlias
    $jsonPath = Join-Path -Path $runDirectory -ChildPath "host-audit.json"
    $summaryPath = Join-Path -Path $runDirectory -ChildPath "host-audit-summary.md"

    $sections = @{}
    $sections.powershell = Invoke-Section -Collector { Get-PowerShellAudit }
    $sections.operatingSystem = Invoke-Section -Collector { Get-OperatingSystemAudit }
    $sections.processor = Invoke-Section -Collector { Get-ProcessorAudit }
    $sections.memory = Invoke-Section -Collector { Get-MemoryAudit }
    $sections.storage = Invoke-Section -Collector { Get-StorageAudit }
    $sections.virtualization = Invoke-Section -Collector { Get-VirtualizationAudit }
    $sections.wsl = Invoke-Section -Collector { Get-WslAudit }
    $sections.docker = Invoke-Section -Collector { Get-DockerAudit }
    $sections.networkAdapter = Invoke-Section -Collector { Get-NetworkAdapterAudit }
    $sections.firewall = Invoke-Section -Collector { Get-FirewallAudit }
    $sections.antivirus = Invoke-Section -Collector { Get-AntivirusAudit }
    $sections.power = Invoke-Section -Collector { Get-PowerAudit }
    $sections.temperature = Invoke-Section -Collector { Get-TemperatureAudit }
    $sections.manualValidation = Invoke-Section -Collector { Get-ManualValidationAudit }

    $audit = [ordered]@{
        schemaVersion = $SchemaVersion
        toolVersion = $ToolVersion
        hostAlias = $HostAlias
        collectedAtUtc = $collectedAtUtc
        powershell = $sections.powershell
        operatingSystem = $sections.operatingSystem
        processor = $sections.processor
        memory = $sections.memory
        storage = $sections.storage
        virtualization = $sections.virtualization
        wsl = $sections.wsl
        docker = $sections.docker
        networkAdapter = $sections.networkAdapter
        firewall = $sections.firewall
        antivirus = $sections.antivirus
        power = $sections.power
        temperature = $sections.temperature
        manualValidation = $sections.manualValidation
        collectionSummary = $null
    }

    $summarySections = @{}
    foreach ($name in @("powershell", "operatingSystem", "processor", "memory", "storage", "virtualization", "wsl", "docker", "networkAdapter", "firewall", "antivirus", "power", "temperature", "manualValidation")) {
        $summarySections[$name] = $audit[$name]
    }
    $audit.collectionSummary = New-CollectionSummary -Sections $summarySections

    $objectIssues = Test-SensitiveAuditObject -Value $audit
    $scanAudit = ConvertTo-SensitiveTextScanObject -Value $audit
    $jsonForScan = $scanAudit | ConvertTo-Json -Depth 12
    $json = $audit | ConvertTo-Json -Depth 12
    $summary = New-SummaryMarkdown -Audit $audit

    $jsonIssues = Test-SensitiveContent -Content $jsonForScan
    $summaryIssues = Test-SensitiveContent -Content $summary
    $allIssues = @($objectIssues + $jsonIssues + $summaryIssues | Select-Object -Unique)
    if ($allIssues.Count -gt 0) {
        Remove-CurrentRunArtifacts -RunDirectory $runDirectory -Files $createdFiles
        throw ("Sanitization failed before writing evidence. Categories: " + ($allIssues -join ", "))
    }

    try {
        if ((Test-Path -LiteralPath $jsonPath) -or (Test-Path -LiteralPath $summaryPath)) {
            throw "Evidence file already exists in the current run directory."
        }

        Set-Content -LiteralPath $jsonPath -Value $json -Encoding UTF8
        $createdFiles += $jsonPath
        Set-Content -LiteralPath $summaryPath -Value $summary -Encoding UTF8
        $createdFiles += $summaryPath
    } catch {
        Remove-CurrentRunArtifacts -RunDirectory $runDirectory -Files @($jsonPath, $summaryPath)
        throw "Failed to write sanitized evidence files."
    }

    Write-Host "PPO-01 host audit inventory completed."
    Write-Host "Sanitized evidence files were written outside the repository."
}

try {
    Main
    exit 0
} catch {
    Write-Error ("PPO-01 host audit inventory failed. " + $_.Exception.Message)
    exit 1
}

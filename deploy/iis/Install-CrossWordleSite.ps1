#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
    One-time IIS setup for CrossWordle. Runs on the web server; safe to run again.

.DESCRIPTION
    Installs the IIS role services the site needs, then creates the app pool, the site (bound to
    loopback only, so it is reachable only through a local reverse proxy such as cloudflared),
    the release folders and their permissions, and a log field for the visitor's real address.

    HttpPlatformHandler and Node.js 22 are installed separately, from their signed installers
    (see deploy/iis/README.md). The script stops if either is missing.

.EXAMPLE
    Invoke-Command -Session $session -FilePath deploy\iis\Install-CrossWordleSite.ps1
#>
[CmdletBinding()]
param(
    [string] $SiteName = 'crosswordle',
    [string] $Root = 'C:\inetpub\crosswordle',
    [ValidateRange(1, 65535)]
    [int] $Port = 8080
)

$ErrorActionPreference = 'Stop'

$features = @(
    'Web-Server', 'Web-Static-Content', 'Web-Default-Doc', 'Web-Http-Errors',
    'Web-Http-Logging', 'Web-Custom-Logging', 'Web-Filtering', 'Web-Stat-Compression',
    'Web-Scripting-Tools'
)
$result = Install-WindowsFeature -Name $features
if ($result.RestartNeeded -eq 'Yes') {
    Write-Warning 'Windows needs a restart to finish installing IIS. Restart, then run this again.'
    return
}

Import-Module WebAdministration

$node = Join-Path $env:ProgramFiles 'nodejs\node.exe'
if (-not (Test-Path $node)) {
    throw "Node.js not found at $node. Install the Node.js 22 LTS MSI first."
}
$modules = Get-WebConfiguration -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/globalModules/add'
if (-not ($modules | Where-Object { $_.name -eq 'httpPlatformHandler' })) {
    throw 'HttpPlatformHandler is not installed. Install the HttpPlatformHandler v1.2 MSI first.'
}

foreach ($folder in @($Root, "$Root\releases", "$Root\empty")) {
    if (-not (Test-Path $folder)) { New-Item -ItemType Directory -Path $folder | Out-Null }
}

$poolPath = "IIS:\AppPools\$SiteName"
if (-not (Test-Path $poolPath)) { New-WebAppPool -Name $SiteName | Out-Null }
# No .NET in the worker process: IIS only serves files and proxies /api to Node.
Set-ItemProperty $poolPath -Name managedRuntimeVersion -Value ''
Set-ItemProperty $poolPath -Name processModel.identityType -Value ApplicationPoolIdentity

$sitePath = "IIS:\Sites\$SiteName"
if (-not (Test-Path $sitePath)) {
    # Starts on an empty folder; the first deploy points it at a release.
    New-Website -Name $SiteName -PhysicalPath "$Root\empty" -ApplicationPool $SiteName `
        -IPAddress '127.0.0.1' -Port $Port | Out-Null
}
Set-ItemProperty $sitePath -Name bindings -Value @{ protocol = 'http'; bindingInformation = "127.0.0.1:${Port}:" }
Set-ItemProperty $sitePath -Name applicationPool -Value $SiteName

# The app pool (and the Node process it starts) can read the releases and nothing more.
$acl = Get-Acl $Root
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    "IIS AppPool\$SiteName", 'ReadAndExecute', 'ContainerInherit, ObjectInherit', 'None', 'Allow')
$acl.SetAccessRule($rule)
Set-Acl -Path $Root -AclObject $acl

# Every request arrives from cloudflared on 127.0.0.1; log the visitor's address too.
$fields = "system.applicationHost/sites/site[@name='$SiteName']/logFile/customFields"
$existing = Get-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter $fields -Name Collection
if (-not ($existing | Where-Object { $_.logFieldName -eq 'CF-Connecting-IP' })) {
    Add-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter $fields -Name '.' -Value @{
        logFieldName = 'CF-Connecting-IP'; sourceName = 'CF-Connecting-IP'; sourceType = 'RequestHeader'
    }
}

Start-Website -Name $SiteName
Write-Output "Site '$SiteName' is ready at http://127.0.0.1:$Port/ (empty until the first deploy)."

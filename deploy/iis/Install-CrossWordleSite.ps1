#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
    One-time IIS setup for CrossWordle. Runs on the web server; safe to run again.

.DESCRIPTION
    Installs the IIS role services the site needs, then creates the app pool, the site, the release
    folders and their permissions, and a log field for the visitor's real address.

    The site binds to loopback by default, for a reverse proxy on the same server. For a reverse
    proxy on another machine, bind a network address and name the proxy in -AllowFrom: the script
    adds a Windows Firewall rule that lets only that address reach the port.

    HttpPlatformHandler, URL Rewrite and Node.js 22 are installed separately, from their signed
    installers (see deploy/iis/README.md). The script stops if any is missing.

.EXAMPLE
    Invoke-Command -Session $session -FilePath deploy\iis\Install-CrossWordleSite.ps1

.EXAMPLE
    # Behind a reverse proxy at 192.0.2.10, answering only for the public names.
    Invoke-Command -Session $session -FilePath deploy\iis\Install-CrossWordleSite.ps1 -ArgumentList `
        'crosswordle', 'C:\inetpub\crosswordle', 8080, '192.0.2.20', @('crosswordle.example.com'), '192.0.2.10'
#>
[CmdletBinding()]
param(
    [string] $SiteName = 'crosswordle',
    [string] $Root = 'C:\inetpub\crosswordle',
    [ValidateRange(1, 65535)]
    [int] $Port = 8080,
    # The address IIS listens on: 127.0.0.1, one of the server's addresses, or * for all of them.
    [string] $IPAddress = '127.0.0.1',
    # Host names the site answers for. Empty answers for any name.
    [string[]] $HostName = @(),
    # The reverse proxy's address (or addresses, comma-separated), the only one let in. Required
    # unless the site is on loopback.
    [string] $AllowFrom
)

$ErrorActionPreference = 'Stop'

$loopback = $IPAddress -eq '127.0.0.1'
if (-not $loopback -and -not $AllowFrom) {
    throw "A site on $IPAddress is reachable from the network: pass -AllowFrom with the reverse proxy's address."
}

# Role services only: naming 'Web-Server' itself also adds its defaults, directory browsing among
# them. The parents these need are added automatically.
$features = @(
    'Web-Static-Content', 'Web-Default-Doc', 'Web-Http-Errors',
    'Web-Http-Logging', 'Web-Custom-Logging', 'Web-Filtering', 'Web-Stat-Compression',
    'Web-Scripting-Tools'
)
$result = Install-WindowsFeature -Name $features
if ($result.RestartNeeded -eq 'Yes') {
    Write-Warning 'Windows needs a restart to finish installing IIS. Restart, then run this again.'
    return
}
# Web-Server brings directory browsing with it; the site never lists folders. web.config turns it
# off as well, so a removal still waiting for a restart doesn't hold up the rest of the setup.
if ((Get-WindowsFeature -Name 'Web-Dir-Browsing').InstallState -in 'Installed', 'InstallPending') {
    $removal = Uninstall-WindowsFeature -Name 'Web-Dir-Browsing' -WarningAction SilentlyContinue
    if ($removal.RestartNeeded -eq 'Yes') {
        Write-Warning 'Directory browsing is removed at the next restart.'
    }
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
if (-not ($modules | Where-Object { $_.name -eq 'RewriteModule' })) {
    throw 'URL Rewrite is not installed. Install the URL Rewrite 2.1 MSI first.'
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
        -IPAddress $IPAddress -Port $Port | Out-Null
}
# One binding per host name, or one for any name. This replaces whatever bindings were there.
$names = if ($HostName.Count -gt 0) { $HostName } else { @('') }
$bindings = @($names | ForEach-Object { @{ protocol = 'http'; bindingInformation = "${IPAddress}:${Port}:$_" } })
Set-ItemProperty $sitePath -Name bindings -Value $bindings
Set-ItemProperty $sitePath -Name applicationPool -Value $SiteName

# Only the reverse proxy may reach a site on a network address. On loopback no rule is needed, and
# any rule left from an earlier setup is removed.
$ruleName = "CrossWordle site '$SiteName'"
Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
if (-not $loopback) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP `
        -LocalPort $Port -RemoteAddress ($AllowFrom -split ',\s*') -Profile Any | Out-Null
    if (Get-NetFirewallProfile | Where-Object { -not $_.Enabled }) {
        Write-Warning ('Windows Firewall is off for at least one profile, so any address can reach port ' +
            "$Port there. Turn it on once remote management is allowed through it.")
    }
}

# IIS locks the handlers section by default, and the release's web.config maps /api to
# HttpPlatformHandler. Unlock it for this site only.
Set-WebConfiguration -PSPath 'MACHINE/WEBROOT/APPHOST' -Location $SiteName `
    -Filter 'system.webServer/handlers' -Metadata overrideMode -Value Allow

# Serve static files as the app pool's own identity rather than the shared IUSR account, so one
# account is the only non-admin reader.
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Location $SiteName `
    -Filter 'system.webServer/security/authentication/anonymousAuthentication' -Name userName -Value ''

# Only administrators (who deploy) and SYSTEM can write, and only the app pool (and the Node
# process it starts) can read. Nothing is inherited from C:\inetpub, where every local user can
# read: the releases hold the answers bundle.
$acl = New-Object System.Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
$inherit = 'ContainerInherit, ObjectInherit'
foreach ($rule in @(
        @('BUILTIN\Administrators', 'FullControl'),
        @('NT AUTHORITY\SYSTEM', 'FullControl'),
        @("IIS AppPool\$SiteName", 'ReadAndExecute'))) {
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
                $rule[0], $rule[1], $inherit, 'None', 'Allow')))
}
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
$serving = Get-ItemProperty $sitePath -Name physicalPath
if ($serving -eq "$Root\empty") { $serving = 'nothing yet: run scripts/deploy-iis.ps1' }
$answers = if ($HostName.Count -gt 0) { " for $($HostName -join ', ')" } else { '' }
Write-Output "Site '$SiteName' is ready on ${IPAddress}:$Port$answers, serving $serving."

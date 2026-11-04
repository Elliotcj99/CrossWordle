#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
    One-time IIS setup for CrossWordle. Runs on the web server; safe to run again.

.DESCRIPTION
    Installs the IIS role services the site needs, then creates the app pool, the site, the release
    folders and their permissions, and a log field for the visitor's real address.

    By default the site binds plain HTTP to loopback (127.0.0.1:8080), for a Cloudflare Tunnel
    whose cloudflared runs on the same server. That needs no certificate and nothing reaches IIS
    except through the tunnel.

    To serve the site some other way, pass your own binding: the protocol (http or https), address,
    port and host names, and for https the thumbprint of a certificate in LocalMachine\My. The
    script leaves the server's firewall alone: which addresses can reach the port is up to the
    network.

    The bindings are set to exactly what the parameters describe, so run the script again with the
    same parameters it was installed with. Bindings and a certificate mapping that already match
    are left untouched.

    HttpPlatformHandler, URL Rewrite and Node.js 22 are installed separately, from their signed
    installers (see deploy/iis/README.md). The script stops if any is missing.

.EXAMPLE
    # The default: http://127.0.0.1:8080/, for a Cloudflare Tunnel on this server.
    Invoke-Command -Session $session -FilePath deploy\iis\Install-CrossWordleSite.ps1

.EXAMPLE
    # The staging site beside it, on http://127.0.0.1:8081/.
    Invoke-Command -Session $session -FilePath deploy\iis\Install-CrossWordleSite.ps1 -ArgumentList `
        'Crosswordle-Staging', 'C:\inetpub\crosswordle-staging', 8081

.EXAMPLE
    # Your own binding: HTTPS on one of the server's addresses, answering only for the given name,
    # with the certificate whose thumbprint is given.
    Invoke-Command -Session $session -FilePath deploy\iis\Install-CrossWordleSite.ps1 -ArgumentList `
        'crosswordle', 'C:\inetpub\crosswordle', 443, '192.0.2.20', @('crosswordle.example.com'),
        'https', '0123456789ABCDEF0123456789ABCDEF01234567'
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
    [ValidateSet('http', 'https')]
    [string] $Protocol = 'http',
    # https only: the certificate's thumbprint, in LocalMachine\My with its private key.
    [string] $CertificateThumbprint,
    # https only: pick the certificate by host name (SNI), so sites sharing an address and port can
    # each have their own. Off by default: the certificate then belongs to the address and port, and
    # every site on them shares it (and clients needn't send SNI).
    [bool] $RequireSni = $false
)

$ErrorActionPreference = 'Stop'

if ($Protocol -eq 'https') {
    if (-not $CertificateThumbprint) { throw 'An https binding needs -CertificateThumbprint.' }
    $CertificateThumbprint = ($CertificateThumbprint -replace '[^0-9A-Fa-f]', '').ToUpperInvariant()
    $certificate = Get-Item "Cert:\LocalMachine\My\$CertificateThumbprint" -ErrorAction SilentlyContinue
    if (-not $certificate) { throw "No certificate $CertificateThumbprint in LocalMachine\My." }
    if (-not $certificate.HasPrivateKey) { throw "Certificate $CertificateThumbprint has no private key." }
    if ($RequireSni -and $HostName.Count -eq 0) { throw 'SNI needs at least one -HostName.' }
} elseif ($CertificateThumbprint -or $RequireSni) {
    throw '-CertificateThumbprint and -RequireSni are for https bindings only.'
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

foreach ($folder in @($Root, "$Root\releases", "$Root\empty", "$Root\data", "$Root\logs", "$Root\backups")) {
    if (-not (Test-Path $folder)) { New-Item -ItemType Directory -Path $folder | Out-Null }
}

$poolPath = "IIS:\AppPools\$SiteName"
if (-not (Test-Path $poolPath)) { New-WebAppPool -Name $SiteName | Out-Null }
# No .NET in the worker process: IIS only serves files and proxies /api to Node.
Set-ItemProperty $poolPath -Name managedRuntimeVersion -Value ''
Set-ItemProperty $poolPath -Name processModel.identityType -Value ApplicationPoolIdentity

# One binding per host name, or one for any name. HTTPS refuses TLS 1.0 and 1.1 (sslFlags 64),
# plus SNI (1) when asked for.
$names = if ($HostName.Count -gt 0) { $HostName } else { @('') }
$sslFlags = if ($Protocol -eq 'https') { 64 + [int]$RequireSni } else { 0 }
$bindings = @($names | ForEach-Object {
        @{ protocol = $Protocol; bindingInformation = "${IPAddress}:${Port}:$_"; sslFlags = $sslFlags }
    })

# HTTP.sys holds an HTTPS binding's certificate, keyed by address and port, or by host name and
# port with SNI. Work out which mappings need making before changing anything, so a refusal leaves
# the site as it was.
$mappings = @()
if ($Protocol -eq 'https') {
    $address = if ($IPAddress -eq '*') { '0.0.0.0' } else { $IPAddress }
    $keys = if ($RequireSni) { @($names | ForEach-Object { "hostnameport=${_}:$Port" }) } else { @("ipport=${address}:$Port") }
    foreach ($key in $keys) {
        $shown = (netsh http show sslcert $key) -join "`n"
        $mapped = if ($shown -match 'Certificate Hash\s*:\s*([0-9a-fA-F]+)') { $Matches[1].ToUpperInvariant() }
        if ($mapped -eq $CertificateThumbprint) { continue }   # already right: leave it alone
        if ($mapped -and -not $RequireSni) {
            # Other sites on this address and port share that mapping: changing it changes theirs.
            $sharing = @(Get-Website | Where-Object { $_.name -ne $SiteName } | Where-Object {
                    $_.bindings.Collection | Where-Object {
                        $_.protocol -eq 'https' -and $_.bindingInformation -like "${IPAddress}:${Port}:*"
                    }
                })
            if ($sharing) {
                throw ("${address}:$Port already has certificate $mapped, shared with " +
                    "$(($sharing.name) -join ', '). Use -RequireSni for a certificate of this site's own.")
            }
        }
        $mappings += @{ Key = $key; Replace = [bool]$mapped }
    }
}

$sitePath = "IIS:\Sites\$SiteName"
$describe = { param($b) '{0} {1} {2}' -f $b.protocol, $b.bindingInformation, [int]$b.sslFlags }
if (-not (Test-Path $sitePath)) {
    # Starts on an empty folder; the first deploy points it at a release. New-Item only takes
    # sslFlags up to 3, so the bindings are set in full just below.
    $plain = @($bindings | ForEach-Object { @{ protocol = $_.protocol; bindingInformation = $_.bindingInformation } })
    New-Item $sitePath -PhysicalPath "$Root\empty" -Bindings $plain | Out-Null
}
# Replace the bindings only if they differ, so a re-run never drops a working binding even for a
# moment.
$current = @((Get-ItemProperty $sitePath -Name bindings).Collection | ForEach-Object { & $describe $_ }) | Sort-Object
$wanted = @($bindings | ForEach-Object { & $describe $_ }) | Sort-Object
if (($current -join '|') -ne ($wanted -join '|')) {
    Set-ItemProperty $sitePath -Name bindings -Value $bindings
}
Set-ItemProperty $sitePath -Name applicationPool -Value $SiteName

foreach ($mapping in $mappings) {
    if ($mapping.Replace) { netsh http delete sslcert $mapping.Key | Out-Null }
    $add = @('http', 'add', 'sslcert', $mapping.Key, "certhash=$CertificateThumbprint", 'certstorename=MY',
        'appid={4dc3e181-e14b-4a21-b022-59fc669b0914}', 'disablelegacytls=enable')
    $output = & netsh @add
    if ($LASTEXITCODE -ne 0) { throw "Couldn't map the certificate for $($mapping.Key): $output" }
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

# The database lives in data and the API's error log in logs: the only folders the app pool may
# write to. Backups are written by an administrator's scheduled task, so backups keeps the
# read-only rights it inherits.
foreach ($writable in @("$Root\data", "$Root\logs")) {
    $writableAcl = Get-Acl -Path $writable
    $writableAcl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
                "IIS AppPool\$SiteName", 'Modify', $inherit, 'None', 'Allow')))
    Set-Acl -Path $writable -AclObject $writableAcl
}

# The site's settings (contact address, Turnstile keys), read by the API. Never in a release or
# the repo. Created empty, without a byte order mark, if it isn't there yet.
$config = "$Root\config.json"
if (-not (Test-Path $config)) {
    [IO.File]::WriteAllText($config, "{}`r`n", (New-Object Text.UTF8Encoding($false)))
}

# Requests arrive through Cloudflare (from cloudflared, with the default binding); log the visitor's
# address too.
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
Write-Output "Site '$SiteName' is ready on ${Protocol}://${IPAddress}:$Port$answers, serving $serving."

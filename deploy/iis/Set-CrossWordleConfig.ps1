#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Sets a CrossWordle site's settings (config.json): the contact address and the Turnstile keys.
    Runs on the web server; safe to run again.

.DESCRIPTION
    Changes only the settings you pass and keeps the rest. Writes the file without a byte order mark,
    then recycles the app pool, because Node reads the settings when it starts. The file lives in
    the site's root, outside the releases, and only administrators, SYSTEM and the app pool can
    read it (Install-CrossWordleSite.ps1 sets that).

    Pass the Turnstile secret as a SecureString, read from your secret store, so it never appears
    in a command line or a transcript.

.EXAMPLE
    $secret = ConvertTo-SecureString (Get-Secret ...) -AsPlainText -Force
    Invoke-Command -Session $session -FilePath deploy\iis\Set-CrossWordleConfig.ps1 -ArgumentList `
        'crosswordle', 'C:\inetpub\crosswordle', 'admin@example.com', '0x4AAAA...', $secret
#>
[CmdletBinding()]
param(
    [string] $SiteName = 'crosswordle',
    [string] $Root = 'C:\inetpub\crosswordle',
    [string] $ContactEmail,
    [string] $TurnstileSiteKey,
    [securestring] $TurnstileSecretKey
)

$ErrorActionPreference = 'Stop'

if (($TurnstileSiteKey -and -not $TurnstileSecretKey) -or ($TurnstileSecretKey -and -not $TurnstileSiteKey)) {
    throw 'Pass both Turnstile keys, or neither.'
}
if ($ContactEmail -and $ContactEmail -notmatch '^[^@\s]+@[^@\s]+$') {
    throw "'$ContactEmail' isn't an email address."
}

$path = Join-Path $Root 'config.json'
$settings = [ordered]@{}
if (Test-Path $path) {
    $existing = Get-Content -Path $path -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($existing) {
        foreach ($property in $existing.PSObject.Properties) { $settings[$property.Name] = $property.Value }
    }
}

if ($ContactEmail) { $settings['contactEmail'] = $ContactEmail }
if ($TurnstileSiteKey) {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($TurnstileSecretKey))
    $settings['turnstile'] = [ordered]@{ siteKey = $TurnstileSiteKey; secretKey = $plain }
}

[IO.File]::WriteAllText($path, ($settings | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding($false)))
Remove-Variable plain -ErrorAction SilentlyContinue

Import-Module WebAdministration
Restart-WebAppPool -Name (Get-ItemProperty "IIS:\Sites\$SiteName" -Name applicationPool)

$set = @($settings.Keys | ForEach-Object { if ($_ -eq 'turnstile') { 'turnstile (both keys)' } else { $_ } })
Write-Output "Settings for '$SiteName': $($set -join ', '). App pool recycled."

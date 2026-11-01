#Requires -Version 5.1
<#
.SYNOPSIS
    Builds CrossWordle and deploys it to the IIS host over PowerShell remoting.

.DESCRIPTION
    1. Refuses to deploy uncommitted work, so every release matches a commit.
    2. Runs `npm run build:iis`.
    3. Copies dist\iis to <Root>\releases\<commit sha> on the server.
    4. Points the site at the new release and recycles its app pool.
    5. Checks the home page and the API on the server. If either fails, the site goes back to the
       release it was on before.
    6. Keeps the five newest releases (never the live one).

    -Rollback skips the build and points the site at the release deployed before the live one.

    The server's name and the account are never stored in the repo: pass -ComputerName or set
    CROSSWORDLE_IIS_HOST, and pass -Credential (or let it prompt).

.EXAMPLE
    .\scripts\deploy-iis.ps1 -ComputerName web01.example.com -Credential $credential

.EXAMPLE
    .\scripts\deploy-iis.ps1 -ComputerName web01.example.com -Credential $credential -Rollback
#>
[CmdletBinding()]
param(
    [string] $ComputerName = $env:CROSSWORDLE_IIS_HOST,
    [pscredential] $Credential,
    [string] $SiteName = 'crosswordle',
    [string] $Root = 'C:\inetpub\crosswordle',
    [switch] $Rollback
)

$ErrorActionPreference = 'Stop'
$KeepReleases = 5

if (-not $ComputerName) {
    throw 'Pass -ComputerName or set CROSSWORDLE_IIS_HOST.'
}
if (-not $Credential) { $Credential = Get-Credential -Message "Account on $ComputerName" }

$repo = Split-Path -Parent $PSScriptRoot
Push-Location $repo
try {
    if (-not $Rollback) {
        if (git status --porcelain) {
            throw 'Commit or stash your changes first: only committed work is deployed.'
        }
        $release = (git rev-parse HEAD).Trim()
        npm run build:iis
        if ($LASTEXITCODE -ne 0) { throw 'npm run build:iis failed.' }
    }

    $session = New-PSSession -ComputerName $ComputerName -Credential $Credential
    try {
        if (-not $Rollback) {
            $target = "$Root\releases\$release"
            Invoke-Command -Session $session -ScriptBlock {
                param($Target)
                if (Test-Path $Target) { Remove-Item $Target -Recurse -Force }
                New-Item -ItemType Directory -Path $Target | Out-Null
            } -ArgumentList $target
            Copy-Item -Path 'dist\iis\*' -Destination $target -ToSession $session -Recurse
        }

        $live = Invoke-Command -Session $session -ScriptBlock {
            param($SiteName, $Root, $Release, $Rollback, $KeepReleases)
            $ErrorActionPreference = 'Stop'
            Import-Module WebAdministration

            $site = "IIS:\Sites\$SiteName"
            $previous = (Get-ItemProperty $site -Name physicalPath)
            $releases = @(Get-ChildItem "$Root\releases" -Directory | Sort-Object CreationTime -Descending)

            if ($Rollback) {
                $current = $releases | Where-Object { "$($_.FullName)\site" -eq $previous }
                $older = $releases | Where-Object { $current -and $_.CreationTime -lt $current.CreationTime }
                if (-not $older) { throw "There is no release older than the live one ($previous)." }
                $Release = $older[0].Name
            }

            function Test-Site {
                $binding = (Get-WebBinding -Name $SiteName -Protocol http).bindingInformation
                $base = 'http://' + ($binding -replace ':$', '')
                $page = Invoke-WebRequest "$base/" -UseBasicParsing -TimeoutSec 60
                if ($page.StatusCode -ne 200) { throw "Home page returned $($page.StatusCode)." }
                # 'sample' is always in the answers bundle; an unknown entry proves the API runs
                # and has the bundle, without scoring anything.
                $body = '{"puzzleId":"sample","entryId":"-","guess":"A"}'
                try {
                    Invoke-WebRequest "$base/api/guess" -Method Post -Body $body `
                        -ContentType 'application/json' -UseBasicParsing -TimeoutSec 60 | Out-Null
                    throw 'The API accepted an unknown entry.'
                } catch [System.Net.WebException] {
                    $response = $_.Exception.Response
                    if ($null -eq $response -or [int]$response.StatusCode -ne 404) {
                        throw "The API check failed: $($_.Exception.Message)"
                    }
                    $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
                    if ($reader.ReadToEnd() -notmatch 'unknown-entry') {
                        throw 'The API returned 404 without its JSON body.'
                    }
                }
            }

            $pool = (Get-ItemProperty $site -Name applicationPool)
            $next = "$Root\releases\$Release\site"
            Set-ItemProperty $site -Name physicalPath -Value $next
            Restart-WebAppPool -Name $pool
            try {
                Test-Site
            } catch {
                Set-ItemProperty $site -Name physicalPath -Value $previous
                Restart-WebAppPool -Name $pool
                throw "Release $Release failed its checks, so the site is back on $previous. $_"
            }

            if (-not $Rollback) {
                $releases | Where-Object { $_.Name -ne $Release } |
                    Select-Object -Skip ($KeepReleases - 1) |
                    Where-Object { "$($_.FullName)\site" -ne $next } |
                    Remove-Item -Recurse -Force
            }
            $Release
        } -ArgumentList $SiteName, $Root, $release, $Rollback.IsPresent, $KeepReleases

        Write-Output "Live on ${ComputerName}: $($live.Substring(0, 7))"
    } finally {
        Remove-PSSession $session
    }
} finally {
    Pop-Location
}

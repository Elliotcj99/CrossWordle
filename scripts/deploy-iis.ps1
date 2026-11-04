#Requires -Version 5.1
<#
.SYNOPSIS
    Builds CrossWordle and deploys it to the IIS host over PowerShell remoting.

.DESCRIPTION
    1. Refuses to deploy uncommitted work, so every release matches a commit.
    2. Runs `npm run build:iis`.
    3. Copies dist\iis to <Root>\releases\<commit sha> on the server (<commit sha>-<time> when
       that commit is the live release, whose files are in use).
    4. Points the site at the new release and recycles its app pool.
    5. Checks the home page and the API on the server, through the site's first binding (HTTP or
       HTTPS, straight to its address). If either fails, the site goes back to the release it was
       on before.
    6. Keeps the newest folder of each of the five newest commits (always the live one).

    -Rollback skips the build and points the site at the newest release of an older commit than
    the live one.

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
        # npm writes progress to stderr. When output is redirected, Windows PowerShell turns that
        # into error records, which 'Stop' would treat as a failure; the exit code decides instead.
        & { $ErrorActionPreference = 'Continue'; npm run build:iis }
        if ($LASTEXITCODE -ne 0) { throw 'npm run build:iis failed.' }
    }

    $session = New-PSSession -ComputerName $ComputerName -Credential $Credential
    try {
        if (-not $Rollback) {
            # The release's folder is named after the commit. Redeploying the commit that's live
            # goes into a new folder: the live one's files are in use (IIS and Node hold them
            # open), and deleting them would take the site down even if the delete then failed.
            $release = Invoke-Command -Session $session -ScriptBlock {
                param($SiteName, $Root, $Release)
                $ErrorActionPreference = 'Stop'
                Import-Module WebAdministration
                # IIS may hold the path with environment variables or a trailing separator, and
                # -Root may be spelled differently: compare full, plain paths.
                function Get-PlainPath([string] $Path) {
                    [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($Path)).TrimEnd('\')
                }
                $live = Get-PlainPath (Get-ItemProperty "IIS:\Sites\$SiteName" -Name physicalPath)
                $name = $Release
                if ((Get-PlainPath "$Root\releases\$name\site") -eq $live) {
                    $name = "$Release-$(Get-Date -Format 'yyyyMMddHHmmss')"
                }
                $target = "$Root\releases\$name"
                if (Test-Path $target) { Remove-Item $target -Recurse -Force }
                New-Item -ItemType Directory -Path $target | Out-Null
                $name
            } -ArgumentList $SiteName, $Root, $release
            Copy-Item -Path 'dist\iis\*' -Destination "$Root\releases\$release" -ToSession $session -Recurse
        }

        $live = Invoke-Command -Session $session -ScriptBlock {
            param($SiteName, $Root, $Release, $Rollback, $KeepReleases)
            $ErrorActionPreference = 'Stop'
            Import-Module WebAdministration

            function Get-PlainPath([string] $Path) {
                [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($Path)).TrimEnd('\')
            }
            # A release folder is named after its commit, with -<time> when the commit was
            # deployed again while live.
            function Get-Commit([string] $Name) { ($Name -split '-', 2)[0] }

            $site = "IIS:\Sites\$SiteName"
            $previous = (Get-ItemProperty $site -Name physicalPath)
            $releases = @(Get-ChildItem "$Root\releases" -Directory | Sort-Object CreationTime -Descending)

            if ($Rollback) {
                $current = $releases | Where-Object { (Get-PlainPath "$($_.FullName)\site") -eq (Get-PlainPath $previous) }
                # The newest older release of a different commit: another folder of the live
                # commit would be the same build.
                $older = $releases | Where-Object {
                    $current -and $_.CreationTime -lt $current.CreationTime -and
                    (Get-Commit $_.Name) -ne (Get-Commit $current.Name)
                }
                if (-not $older) { throw "There is no release of an older commit than the live one ($previous)." }
                $Release = $older[0].Name
            }

            # One request to this site, straight to the address and port it's bound to (never out
            # through DNS and Cloudflare), with its host name for IIS to route by and, over HTTPS,
            # for SNI. Returns the status code and the raw body.
            function Invoke-SiteRequest($Binding, [string] $Method, [string] $Path, [string] $Body = '') {
                # Bindings look like "<address>:<port>:<host name>".
                $address, $port, $hostName = $Binding.bindingInformation -split ':', 3
                if ($address -eq '*') { $address = '127.0.0.1' }
                $hostHeader = if ($hostName) { $hostName } else { "${address}:$port" }
                $tcp = New-Object Net.Sockets.TcpClient($address, [int]$port)
                try {
                    $tcp.ReceiveTimeout = 60000   # the first request starts Node
                    $tcp.SendTimeout = 60000
                    $stream = $tcp.GetStream()
                    if ($Binding.protocol -eq 'https') {
                        # The certificate must chain to a root this server trusts. A name that
                        # doesn't match is only a warning: the deploy checks the release, not which
                        # names the certificate covers.
                        $tls = @{ NameMismatch = $false }
                        $validate = [Net.Security.RemoteCertificateValidationCallback] {
                            param($sender, $certificate, $chain, $errors)
                            if ($errors -eq 'RemoteCertificateNameMismatch') { $tls.NameMismatch = $true; return $true }
                            return $errors -eq 'None'
                        }.GetNewClosure()
                        $stream = New-Object Net.Security.SslStream($stream, $false, $validate)
                        # Windows PowerShell's .NET offers TLS 1.0 unless told otherwise, and the
                        # binding refuses anything older than 1.2.
                        $protocols = [Security.Authentication.SslProtocols]::Tls12
                        if ([enum]::IsDefined([Security.Authentication.SslProtocols], 'Tls13')) {
                            $protocols = $protocols -bor [Security.Authentication.SslProtocols]::Tls13
                        }
                        $stream.AuthenticateAsClient($hostHeader, $null, $protocols, $false)
                        if ($tls.NameMismatch) {
                            Write-Warning "The certificate on ${address}:$port doesn't cover $hostHeader."
                        }
                    }
                    $bytes = [Text.Encoding]::UTF8.GetBytes($Body)
                    $head = "$Method $Path HTTP/1.1`r`nHost: $hostHeader`r`nConnection: close`r`n" +
                        "Content-Type: application/json`r`nContent-Length: $($bytes.Length)`r`n`r`n"
                    $headBytes = [Text.Encoding]::ASCII.GetBytes($head)
                    $stream.Write($headBytes, 0, $headBytes.Length)
                    $stream.Write($bytes, 0, $bytes.Length)
                    $stream.Flush()
                    $response = (New-Object IO.StreamReader($stream, [Text.Encoding]::UTF8)).ReadToEnd()
                    if ($response -notmatch '^HTTP/1\.\d (\d{3})') { throw "No HTTP response from ${address}:$port." }
                    @{ Status = [int]$Matches[1]; Body = ($response -split "`r`n`r`n", 2)[1] }
                } finally {
                    $tcp.Close()
                }
            }

            function Test-Site {
                # Through the site's first binding, HTTP or HTTPS.
                $binding = @(Get-WebBinding -Name $SiteName | Where-Object { $_.protocol -in 'http', 'https' })[0]
                if (-not $binding) { throw "Site $SiteName has no http or https binding." }
                $page = Invoke-SiteRequest $binding 'GET' '/'
                if ($page.Status -ne 200) { throw "Home page returned $($page.Status)." }
                # 'sample' is always in the answers bundle; an unknown entry proves the API runs
                # and has the bundle, without scoring anything.
                $api = Invoke-SiteRequest $binding 'POST' '/api/guess' '{"puzzleId":"sample","entryId":"-","guess":"A"}'
                if ($api.Status -ne 404 -or $api.Body -notmatch '"unknown-entry"') {
                    throw "The API check failed: $($api.Status) $($api.Body)"
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
                # Keep the newest folder of each of the newest $KeepReleases commits (the live one
                # among them); delete the rest. A folder the previous worker still holds open is
                # left for the next deploy to delete.
                $releases = @(Get-ChildItem "$Root\releases" -Directory | Sort-Object CreationTime -Descending)
                $newest = [ordered]@{}   # commit -> its newest folder, newest commits first
                foreach ($folder in $releases) {
                    $commit = Get-Commit $folder.Name
                    if (-not $newest.Contains($commit)) { $newest[$commit] = $folder.Name }
                }
                $liveCommit = Get-Commit $Release
                $keepCommits = @($liveCommit) +
                    @($newest.Keys | Where-Object { $_ -ne $liveCommit } | Select-Object -First ($KeepReleases - 1))
                foreach ($folder in $releases) {
                    $commit = Get-Commit $folder.Name
                    if ((Get-PlainPath "$($folder.FullName)\site") -eq (Get-PlainPath $next)) { continue }
                    if ($keepCommits -contains $commit -and $newest[$commit] -eq $folder.Name) { continue }
                    try {
                        Remove-Item $folder.FullName -Recurse -Force
                    } catch {
                        Write-Warning "Couldn't delete $($folder.Name) yet (in use); the next deploy will. $_"
                    }
                }
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

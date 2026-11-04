#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Runs the CrossWordle admin command (admin.mjs) from a site's live release, on its database.
    Runs on the web server.

.DESCRIPTION
    Finds the release the site serves now, then runs its admin.mjs with the site's data folder and
    settings, the same ones the app pool's Node uses. The commands:

        review [--all]              Ranked results flagged for a look, awaiting a decision.
        keep <puzzle-id> <player>   Looked at and fine: stays on the leaderboard.
        hide <puzzle-id> <player>   Off the leaderboard; kept in the player's own record.
        errors [--hours <n>]        The API's errors in the last n hours (default 24).
        health                      Every health check in detail, puzzles left, database and
                                    disk, the last backup and recent errors (exit 2 if down).
        stats [--from <date>] [--to <date>]
                                    Usage per puzzle and per day (default: the last 7 days).
        feedback [--all]            Open feature requests (--all: closed ones too).
        feedback show|close|reopen <id>

    Nothing comes off the leaderboard unless you hide it.

    The site is named as for Install-CrossWordleSite.ps1: -SiteName, plus '-staging' with -Staging,
    in C:\inetpub\<site name> unless -Root says otherwise.

.EXAMPLE
    Invoke-Command -Session $session -FilePath deploy\iis\Invoke-CrossWordleAdmin.ps1 `
        -ArgumentList 'crosswordle', $false, @('review')

.EXAMPLE
    Invoke-Command -Session $session -FilePath deploy\iis\Invoke-CrossWordleAdmin.ps1 `
        -ArgumentList 'crosswordle', $false, @('hide', '2026-11-05', '0b6f8f4e')

.EXAMPLE
    # The staging site's health.
    Invoke-Command -Session $session -FilePath deploy\iis\Invoke-CrossWordleAdmin.ps1 `
        -ArgumentList 'crosswordle', $true, @('health')
#>
[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_.-]*$')]
    [string] $SiteName = 'crosswordle',
    [bool] $Staging = $false,
    [Parameter(Mandatory)] [string[]] $Arguments,
    [string] $Root
)

$ErrorActionPreference = 'Stop'

if ($Staging) { $SiteName = "$SiteName-staging" }
if (-not $Root) { $Root = Join-Path $env:SystemDrive "inetpub\$SiteName" }

Import-Module WebAdministration
$site = (Get-Item "IIS:\Sites\$SiteName").physicalPath
$admin = Join-Path (Split-Path $site -Parent) 'server\admin.mjs'
if (-not (Test-Path $admin)) { throw "No admin command in the live release ($admin). Deploy a newer release." }
$node = Join-Path $env:ProgramFiles 'nodejs\node.exe'

$env:CROSSWORDLE_DATA = Join-Path $Root 'data'
$env:CROSSWORDLE_CONFIG = Join-Path $Root 'config.json'
$env:CROSSWORDLE_LOGS = Join-Path $Root 'logs'
# node:sqlite still reports itself as experimental on Node 22; on stderr that reads as an error.
& $node --disable-warning=ExperimentalWarning $admin @Arguments
if ($LASTEXITCODE -ne 0) { throw "The admin command failed (exit $LASTEXITCODE)." }

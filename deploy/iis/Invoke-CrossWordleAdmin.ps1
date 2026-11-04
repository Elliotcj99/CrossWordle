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

    Nothing comes off the leaderboard unless you hide it.

.EXAMPLE
    Invoke-Command -Session $session -FilePath deploy\iis\Invoke-CrossWordleAdmin.ps1 `
        -ArgumentList 'crosswordle', 'C:\inetpub\crosswordle', @('review')

.EXAMPLE
    Invoke-Command -Session $session -FilePath deploy\iis\Invoke-CrossWordleAdmin.ps1 `
        -ArgumentList 'crosswordle', 'C:\inetpub\crosswordle', @('hide', '2026-11-05', '0b6f8f4e')
#>
[CmdletBinding()]
param(
    [string] $SiteName = 'crosswordle',
    [string] $Root = 'C:\inetpub\crosswordle',
    [Parameter(Mandatory)] [string[]] $Arguments
)

$ErrorActionPreference = 'Stop'

Import-Module WebAdministration
$site = (Get-Item "IIS:\Sites\$SiteName").physicalPath
$admin = Join-Path (Split-Path $site -Parent) 'server\admin.mjs'
if (-not (Test-Path $admin)) { throw "No admin command in the live release ($admin). Deploy a newer release." }
$node = Join-Path $env:ProgramFiles 'nodejs\node.exe'

$env:CROSSWORDLE_DATA = Join-Path $Root 'data'
$env:CROSSWORDLE_CONFIG = Join-Path $Root 'config.json'
# node:sqlite still reports itself as experimental on Node 22; on stderr that reads as an error.
& $node --disable-warning=ExperimentalWarning $admin @Arguments
if ($LASTEXITCODE -ne 0) { throw "The admin command failed (exit $LASTEXITCODE)." }

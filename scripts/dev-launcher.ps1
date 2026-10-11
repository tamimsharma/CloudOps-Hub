#Requires -Version 5.1
<#
.SYNOPSIS
  CloudOps Hub - one-click launcher (started by the Desktop shortcut).

.DESCRIPTION
  - If the stack is already running, just opens the browser.
  - Otherwise prepares the environment (.env, dependencies),
    starts PostgreSQL + Redis (docker compose) when available,
    creates/seeds the schema when the database is empty,
    then runs `npm run dev` (API :4000 + Web :5173) in this window
    and opens http://localhost:5173 once it responds.

  Stop everything by closing this window (or Ctrl+C).

.EXAMPLE
  .\scripts\dev-launcher.ps1
  .\scripts\dev-launcher.ps1 -FullStack      # also prometheus/grafana/opensearch
  .\scripts\dev-launcher.ps1 -SkipDocker     # no containers at all
  .\scripts\dev-launcher.ps1 -NoBrowser
#>
[CmdletBinding()]
param(
  [switch]$SkipDocker,  # do not touch docker compose
  [switch]$FullStack,   # start every service in docker-compose.yml
  [switch]$NoBrowser    # do not open the browser
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

try { $Host.UI.RawUI.WindowTitle = 'CloudOps Hub' } catch { }

function Write-Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message)   { Write-Host "    OK  $Message" -ForegroundColor Green }
function Write-WarnLine([string]$Message) { Write-Host "  WARN  $Message" -ForegroundColor Yellow }
function Write-Err([string]$Message)  { Write-Host "  ERROR $Message" -ForegroundColor Red }

# Probes a port on both loopback families: on this machine the API listens on
# 0.0.0.0 while Vite listens on ::1 only, so a single address is not enough.
function Test-Port([int]$Port, [int]$TimeoutMs = 1500) {
  foreach ($address in @('127.0.0.1', '::1')) {
    $client = $null
    try {
      $ip = [System.Net.IPAddress]::Parse($address)
      $client = New-Object System.Net.Sockets.TcpClient($ip.AddressFamily)
      $task = $client.ConnectAsync($ip, $Port)
      if ($task.Wait($TimeoutMs) -and $client.Connected) { return $true }
    } catch { }
    finally { if ($client) { $client.Close() } }
  }
  return $false
}

# Opens a URL in the user's browser. The registered http handler on this machine
# points at an uninstalled program, so fall back to a known browser and never
# let a launch failure abort the launcher.
function Open-Url([string]$Url) {
  try { Start-Process $Url; return $true } catch { }
  $browsers = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
  )
  foreach ($browser in $browsers) {
    if (Test-Path $browser) {
      try { Start-Process $browser -ArgumentList "`"$Url`""; return $true } catch { }
    }
  }
  return $false
}

function Test-CommandInstalled([string]$Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-Npm([string]$Script) {
  Write-Step "npm run $Script"
  & npm run $Script
  if ($LASTEXITCODE -ne 0) {
    Write-Err "npm run $Script failed (exit $LASTEXITCODE)"
    exit $LASTEXITCODE
  }
}

# Returns $true/$false when docker compose ran, $null when unavailable.
function Invoke-Compose([string[]]$ComposeArgs) {
  if (Test-CommandInstalled 'docker') {
    & docker compose @ComposeArgs
    if ($LASTEXITCODE -eq 0) { return $true }
  }
  if (Test-CommandInstalled 'docker-compose') {
    & docker-compose @ComposeArgs
    if ($LASTEXITCODE -eq 0) { return $true }
    return $false
  }
  return $null
}

Write-Host ""
Write-Host 'CloudOps Hub launcher' -ForegroundColor Cyan
Write-Host "Project: $RepoRoot"

# 1) Already running? ---------------------------------------------------------
$apiUp = Test-Port 4000
$webUp = Test-Port 5173

if ($apiUp -and $webUp) {
  Write-Ok 'Already running: API http://localhost:4000, Web http://localhost:5173'
  if (-not $NoBrowser) {
    if (Open-Url 'http://localhost:5173') { Write-Ok 'browser opened' }
    else { Write-WarnLine "could not open a browser - visit http://localhost:5173 manually" }
  }
  Write-Host ''
  Write-Host 'Press Enter to close.' -ForegroundColor DarkGray
  try { [void](Read-Host) } catch { Start-Sleep -Seconds 3 }
  exit 0
}

if ($apiUp -xor $webUp) {
  Write-WarnLine "Only part of the stack is running (API:$(if ($apiUp) {'up'} else {'down'}), Web:$(if ($webUp) {'up'} else {'down'}))."
  Write-Err 'Another session is using port 4000 or 5173 - close it first, then re-run the shortcut.'
  exit 1
}

# 2) Toolchain ---------------------------------------------------------------
Write-Step 'Checking toolchain'
foreach ($tool in @('node', 'npm')) {
  if (-not (Test-CommandInstalled $tool)) {
    Write-Err "'$tool' was not found on PATH. Install Node.js 20+ first."
    exit 1
  }
}
Write-Ok ("node " + (& node --version).Trim())
Write-Ok ("npm " + (& npm --version).Trim())

# 3) Environment file --------------------------------------------------------
if (-not (Test-Path (Join-Path $RepoRoot '.env'))) {
  if (Test-Path (Join-Path $RepoRoot '.env.example')) {
    Copy-Item (Join-Path $RepoRoot '.env.example') (Join-Path $RepoRoot '.env')
    Write-Ok '.env created from .env.example'
  } else {
    Write-WarnLine '.env.example not found - skipped'
  }
}

# 4) Dependencies ------------------------------------------------------------
if (-not (Test-Path (Join-Path $RepoRoot 'node_modules'))) {
  Write-Step 'Installing workspace dependencies (first run only, takes a few minutes)'
  & npm install
  if ($LASTEXITCODE -ne 0) { Write-Err 'npm install failed'; exit $LASTEXITCODE }
  Write-Ok 'dependencies installed'
} else {
  Write-Ok 'dependencies present'
}

# 5) Containers --------------------------------------------------------------
if (-not $SkipDocker) {
  if (Test-CommandInstalled 'docker') {
    $eap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & docker info *> $null; $daemonUp = ($LASTEXITCODE -eq 0) }
    catch { $daemonUp = $false }
    finally { $ErrorActionPreference = $eap }
  } else {
    $daemonUp = $false
  }

  if ($daemonUp) {
    Write-Step 'Starting database containers'
    if ($FullStack) {
      $composeResult = Invoke-Compose @('up', '-d', '--profile', 'full')
    } else {
      $composeResult = Invoke-Compose (@('up', '-d') + @('postgres', 'redis'))
    }
    if ($composeResult -eq $false) { Write-WarnLine 'docker compose failed - continuing with whatever is already running.' }

    $deadline = (Get-Date).AddSeconds(90)
    while ((Get-Date) -lt $deadline -and -not (Test-Port 5432)) { Start-Sleep -Milliseconds 500 }
    if (Test-Port 5432) { Write-Ok 'PostgreSQL is accepting connections on :5432' }
    else { Write-WarnLine 'PostgreSQL did not come up within 90s - the API may fail to start.' }
  } else {
    Write-WarnLine 'Docker daemon is not running. Start Docker Desktop (or use a local PostgreSQL) and re-run.'
  }
} else {
  Write-WarnLine 'Docker steps skipped (-SkipDocker)'
}

# 6) Database schema + seed --------------------------------------------------
Write-Step 'Checking the database'
$schemaState = 'unknown'
if (-not $SkipDocker -and (Test-CommandInstalled 'docker')) {
  $eap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $probe = (& docker compose exec -T postgres psql -U cloudops -d cloudops_hub -tAc 'select count(*) from users' 2>&1 | Out-String) }
  catch { $probe = '' }
  finally { $ErrorActionPreference = $eap }

  if ($probe -match '(?m)^\s*(\d+)\s*$') {
    $schemaState = 'ready'
    $userCount = [int]$Matches[1]
    if ($userCount -eq 0) { $schemaState = 'empty' }
  } elseif ($probe -match 'does not exist') {
    $schemaState = 'missing'
  }
}

switch ($schemaState) {
  'ready' { Write-Ok 'schema present (demo data loaded)' }
  'empty' {
    Write-WarnLine 'schema exists but has no users - seeding'
    Invoke-Npm 'db:seed'
  }
  'missing' {
    Write-Ok 'empty database - creating schema and demo data'
    Invoke-Npm 'db:generate'
    Invoke-Npm 'db:push'
    Invoke-Npm 'db:seed'
  }
  default {
    Write-WarnLine 'could not verify the schema (non-Docker database?) - syncing schema only'
    Write-WarnLine 'on a brand-new database run:  npm run db:seed'
    Invoke-Npm 'db:push'
  }
}

# 7) Start the app (opens the browser when the web server answers) -----------
$browserJob = $null
if (-not $NoBrowser) {
  $browserJob = Start-Job -ScriptBlock {
    param($Url, $Chrome, $Edge)
    function Test-Loopback([int]$Port) {
      foreach ($address in @('127.0.0.1', '::1')) {
        $client = $null
        try {
          $ip = [System.Net.IPAddress]::Parse($address)
          $client = New-Object System.Net.Sockets.TcpClient($ip.AddressFamily)
          $task = $client.ConnectAsync($ip, $Port)
          if ($task.Wait(1000) -and $client.Connected) { return $true }
        } catch { } finally { if ($client) { $client.Close() } }
      }
      return $false
    }
    $deadline = (Get-Date).AddSeconds(180)
    while ((Get-Date) -lt $deadline) {
      if (Test-Loopback 5173) {
        Start-Sleep -Seconds 3
        try { Start-Process $Url; return } catch { }
        foreach ($browser in @($Chrome, $Edge)) {
          if ($browser -and (Test-Path $browser)) {
            try { Start-Process $browser -ArgumentList "`"$Url`""; return } catch { }
          }
        }
        return
      }
      Start-Sleep -Seconds 2
    }
  } -ArgumentList 'http://localhost:5173',
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
}

Write-Step 'Starting CloudOps Hub'
Write-Host '    API  http://localhost:4000'
Write-Host '    Web  http://localhost:5173   (browser opens automatically)'
Write-Host '    Stop: Ctrl+C or close this window'
Write-Host ''

& npm run dev
$devExit = $LASTEXITCODE

if ($browserJob) {
  try { Stop-Job -Job $browserJob -ErrorAction SilentlyContinue } catch { }
  try { Remove-Job -Job $browserJob -Force -ErrorAction SilentlyContinue } catch { }
}

Write-Host ''
if ($devExit -ne 0) { Write-Err "npm run dev exited with code $devExit" }
else { Write-Host 'CloudOps Hub stopped.' -ForegroundColor Cyan }
exit $devExit

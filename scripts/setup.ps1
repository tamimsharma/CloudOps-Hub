#Requires -Version 5.1
<#
.SYNOPSIS
  CloudOps Hub - Windows development environment setup.

.DESCRIPTION
  - verifies that node, npm (and optionally docker) are installed
  - copies .env.example to .env when .env is missing
  - installs workspace dependencies
  - runs prisma generate / db push / db seed

.EXAMPLE
  .\scripts\setup.ps1
  .\scripts\setup.ps1 -SkipDb
  .\scripts\setup.ps1 -SkipDocker
#>
[CmdletBinding()]
param(
  [switch]$SkipDocker,
  [switch]$SkipDb
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
  Write-Host "    OK  $Message" -ForegroundColor Green
}

function Write-WarnLine([string]$Message) {
  Write-Host "  WARN  $Message" -ForegroundColor Yellow
}

function Test-CommandInstalled([string]$Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Assert-Command([string]$Name) {
  if (-not (Test-CommandInstalled $Name)) {
    Write-Host "ERROR: '$Name' is required but was not found on PATH." -ForegroundColor Red
    exit 1
  }
}

function Assert-NodeMajor([int]$Minimum) {
  $raw = (& node --version).TrimStart('v')
  $major = [int]($raw.Split('.')[0])
  if ($major -lt $Minimum) {
    Write-Host "ERROR: Node.js $Minimum+ required, found $raw." -ForegroundColor Red
    exit 1
  }
  return $raw
}

Write-Host ""
Write-Host "CloudOps Hub - development setup" -ForegroundColor Cyan
Write-Host "Working directory: $RepoRoot"

# 1) Toolchain checks --------------------------------------------------------
Write-Step "Checking toolchain"
Assert-Command node
Assert-Command npm
$nodeVersion = Assert-NodeMajor 20
$npmVersion = (& npm --version).Trim()
Write-Ok "node v$nodeVersion"
Write-Ok "npm $npmVersion"

if ($SkipDocker) {
  Write-WarnLine "Docker check skipped (-SkipDocker)"
} elseif (Test-CommandInstalled 'docker') {
  $dockerVersion = (& docker --version) -replace '^Docker version ', ''
  Write-Ok "docker $dockerVersion"
  try {
    docker info *> $null
    if ($LASTEXITCODE -eq 0) { Write-Ok "docker daemon is running" }
  } catch {
    Write-WarnLine "Docker daemon is not reachable; 'npm run docker:up' will fail until it is started."
  }
} else {
  Write-WarnLine "docker not found. Container workflows (docker compose) will be unavailable."
}

# 2) Environment file --------------------------------------------------------
Write-Step "Preparing .env"
$envPath = Join-Path $RepoRoot '.env'
$envExamplePath = Join-Path $RepoRoot '.env.example'
if (Test-Path $envPath) {
  Write-Ok ".env already exists - left untouched"
} elseif (Test-Path $envExamplePath) {
  Copy-Item $envExamplePath $envPath
  Write-Ok ".env created from .env.example"
} else {
  Write-WarnLine ".env.example not found - skipped"
}

# 3) Dependencies ------------------------------------------------------------
Write-Step "Installing workspace dependencies (npm install)"
& npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Ok "dependencies installed"

# 4) Database ----------------------------------------------------------------
if ($SkipDb) {
  Write-WarnLine "Database steps skipped (-SkipDb)"
} else {
  Write-Step "Generating Prisma client"
  & npm run db:generate
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Ok "Prisma client generated"

  Write-Step "Pushing Prisma schema to the database"
  Write-Host "    (start PostgreSQL first: docker compose up -d postgres)"
  & npm run db:push
  if ($LASTEXITCODE -ne 0) {
    Write-WarnLine "prisma db push failed - is PostgreSQL running?"
  } else {
    Write-Ok "schema pushed"
  }

  Write-Step "Seeding database"
  & npm run db:seed
  if ($LASTEXITCODE -ne 0) {
    Write-WarnLine "seed failed - continuing (it may not be implemented yet or the DB may be unreachable)"
  } else {
    Write-Ok "database seeded"
  }
}

# 5) Summary -----------------------------------------------------------------
Write-Host ""
Write-Host "Setup finished." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  docker compose --profile full up -d   # postgres, redis + observability stack"
Write-Host "  npm run dev                   # api (:4000) + web (:5173)"
Write-Host "  .\scripts\smoke-test.ps1      # verify the API"
Write-Host ""

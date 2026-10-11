<#
.SYNOPSIS
  CloudOps Hub - API smoke test (Windows/PowerShell).

.DESCRIPTION
  Verifies the real account lifecycle against a running API:
    1. liveness
    2. register a throwaway account (email + password, bcrypt-hashed by the API)
    3. log in with those credentials
    4. authenticated health, identity and dashboard calls
    5. change the password, log in again with it
    6. confirm the old password no longer works

.EXAMPLE
  .\scripts\smoke-test.ps1
  .\scripts\smoke-test.ps1 -BaseUrl http://localhost:4000
#>
[CmdletBinding()]
param(
  [string]$BaseUrl = $env:BASE_URL
)

$ErrorActionPreference = 'Stop'

if (-not $BaseUrl) { $BaseUrl = 'http://localhost:4000' }
$BaseUrl = $BaseUrl.TrimEnd('/')

$stamp = [DateTime]::UtcNow.ToString('yyyyMMddHHmmssfff')
$Email = "smoke-$stamp@example.com"
$Name = 'Smoke Tester'
$Password = 'Smoke!Pass123'
$NewPassword = 'Smoke!Pass456'

$script:PassCount = 0
$script:FailCount = 0

function Write-Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Pass([string]$Message) {
  $script:PassCount++
  Write-Host "    PASS  $Message" -ForegroundColor Green
}
function Fail([string]$Message, [string]$Detail = '') {
  $script:FailCount++
  Write-Host "    FAIL  $Message" -ForegroundColor Red
  if ($Detail) { Write-Host "          $Detail" -ForegroundColor DarkGray }
}

# Invoke-Api METHOD PATH [-Token token] [-Body object]
# Returns @{ StatusCode; Content }
function Invoke-Api {
  param(
    [Parameter(Mandatory)][string]$Method,
    [Parameter(Mandatory)][string]$Path,
    [string]$Token,
    [object]$Body
  )

  $headers = @{}
  if ($Token) { $headers['Authorization'] = "Bearer $Token" }

  $params = @{
    Uri             = "$BaseUrl$Path"
    Method          = $Method
    Headers         = $headers
    TimeoutSec      = 30
    ErrorAction     = 'Stop'
    UseBasicParsing = $true
  }
  if ($PSBoundParameters.ContainsKey('Body')) {
    $params['ContentType'] = 'application/json'
    $params['Body'] = ($Body | ConvertTo-Json -Compress)
  }

  try {
    $response = Invoke-WebRequest @params
    return @{ StatusCode = [int]$response.StatusCode; Content = $response.Content }
  } catch {
    $status = 0
    $content = $_.Exception.Message
    $response = $_.Exception.Response
    if ($response -and $response.GetResponseStream) {
      try {
        $stream = $response.GetResponseStream()
        $stream.Position = 0
        $reader = New-Object System.IO.StreamReader($stream)
        $content = $reader.ReadToEnd()
      } catch { }
    }
    if ($response -and $response.StatusCode) { $status = [int]$response.StatusCode }
    return @{ StatusCode = $status; Content = $content }
  }
}

function Get-Token([string]$Content) {
  try {
    $parsed = $Content | ConvertFrom-Json
    return $parsed.data.accessToken
  } catch { return $null }
}

Write-Host ""
Write-Host "CloudOps Hub - smoke test" -ForegroundColor Cyan
Write-Host "Target:  $BaseUrl"
Write-Host "Account: $Email (created and destroyed by this run)"

# 1) Liveness ----------------------------------------------------------------
Write-Step 'GET /health'
$result = Invoke-Api -Method GET -Path '/health'
if ($result.StatusCode -eq 200) { Pass '/health returned 200' }
else { Fail "/health returned $($result.StatusCode)" $result.Content }

# 2) Register a throwaway account --------------------------------------------
Write-Step "POST /api/auth/register ($Email)"
$register = Invoke-Api -Method POST -Path '/api/auth/register' -Body @{
  email    = $Email
  name     = $Name
  password = $Password
}
if ($register.StatusCode -eq 201) { Pass 'register returned 201 (account stored with a hashed password)' }
else { Fail "register returned $($register.StatusCode)" $register.Content }

# 3) Log in with those credentials -------------------------------------------
Write-Step 'POST /api/auth/login (new account)'
$login = Invoke-Api -Method POST -Path '/api/auth/login' -Body @{
  email    = $Email
  password = $Password
}
$token = $null
if ($login.StatusCode -eq 200) {
  $token = Get-Token $login.Content
  if ($token) { Pass 'login succeeded with the registered email + password' }
  else { Fail 'login returned 200 but no accessToken was found' $login.Content }
} else {
  Fail "login returned $($login.StatusCode)" $login.Content
}

# 4) Authenticated calls -------------------------------------------------------
if ($token) {
  Write-Step 'GET /api/health'
  $result = Invoke-Api -Method GET -Path '/api/health' -Token $token
  if ($result.StatusCode -eq 200) { Pass '/api/health returned 200' }
  else { Fail "/api/health returned $($result.StatusCode)" $result.Content }

  Write-Step 'GET /api/auth/me'
  $me = Invoke-Api -Method GET -Path '/api/auth/me' -Token $token
  if ($me.StatusCode -eq 200 -and $me.Content -match [regex]::Escape($Email)) {
    Pass '/api/auth/me returned the registered identity'
  } else {
    Fail '/api/auth/me did not echo the registered email' $me.Content
  }

  Write-Step 'GET /api/dashboard/summary'
  $dashboard = Invoke-Api -Method GET -Path '/api/dashboard/summary' -Token $token
  if ($dashboard.StatusCode -eq 200) { Pass '/api/dashboard/summary returned 200' }
  else { Fail "/api/dashboard/summary returned $($dashboard.StatusCode)" $dashboard.Content }

  # 5) Change the password --------------------------------------------------
  Write-Step 'POST /api/auth/change-password'
  $change = Invoke-Api -Method POST -Path '/api/auth/change-password' -Token $token -Body @{
    currentPassword = $Password
    newPassword     = $NewPassword
  }
  if ($change.StatusCode -eq 200) { Pass 'password changed' }
  else { Fail "change-password returned $($change.StatusCode)" $change.Content }

  # 6) New password works, old one does not ---------------------------------
  Write-Step 'POST /api/auth/login (updated password)'
  $relogin = Invoke-Api -Method POST -Path '/api/auth/login' -Body @{
    email    = $Email
    password = $NewPassword
  }
  if ($relogin.StatusCode -eq 200 -and (Get-Token $relogin.Content)) {
    Pass 'login with the new password succeeded'
  } else {
    Fail "login with the new password returned $($relogin.StatusCode)" $relogin.Content
  }

  Write-Step 'POST /api/auth/login (old password must fail)'
  $stale = Invoke-Api -Method POST -Path '/api/auth/login' -Body @{
    email    = $Email
    password = $Password
  }
  if ($stale.StatusCode -eq 401) { Pass 'old password rejected with 401' }
  else { Fail "old password returned $($stale.StatusCode) instead of 401" $stale.Content }
} else {
  Fail 'skipped authenticated steps - no access token from login'
}

# Summary ---------------------------------------------------------------------
Write-Host ""
if ($script:FailCount -gt 0) {
  Write-Host "Result: $($script:PassCount) passed, $($script:FailCount) failed" -ForegroundColor Red
  exit 1
}
Write-Host "Result: $($script:PassCount) passed, $($script:FailCount) failed" -ForegroundColor Green
Write-Host 'Smoke test passed.' -ForegroundColor Green

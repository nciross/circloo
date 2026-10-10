#Requires -Version 7
<#
.SYNOPSIS
  Deploy circloo to Azure in one command. Everything goes into ONE resource group: rg-circloo-<env>.
.DESCRIPTION
  Needs PowerShell 7 (pwsh), the Azure CLI (az) and the Azure Developer CLI (azd). From Windows PowerShell 5.1 run:
    pwsh ./scripts/deploy.ps1
  Every step stops with one clear sentence when something is missing (tool, sign-in, subscription, azd environment).

  Group calls (spec 009): the call server VM is created only when the azd variable CALLS_ENABLED is true (false by
  default in every environment). Its other settings default per environment (prod / everything else) and can each be
  overridden with an azd variable: CALLS_VM_SIZE (Standard_B2als_v2 / Standard_B2ats_v2), CALLS_DISK_SKU
  (StandardSSD_LRS / Standard_LRS), CALLS_TURN_TLS (true / false), CALLS_SHUTDOWN_TIME (off / 2000, Paris time).
  When calls are enabled, this script starts the VM after provisioning (scripts/calls-start.ps1), because a
  deployment does not start a VM deallocated by the nightly shutdown. To start it without a full deploy:
    ./scripts/calls-start.ps1 -Environment dev
  Turning CALLS_ENABLED off again does not delete the VM (deployments only add or update): scripts/destroy does.
.EXAMPLE
  ./scripts/deploy.ps1                       # env "dev" in francecentral
  ./scripts/deploy.ps1 -Environment prod -Location westeurope
  ./scripts/deploy.ps1 -Subscription <id-or-name>
  azd env set CALLS_ENABLED true; ./scripts/deploy.ps1   # dev with the call server
#>
param(
  [string]$Environment = 'dev',
  [string]$Location = 'francecentral',
  [string]$Subscription = ''
)
$ErrorActionPreference = 'Stop'
# Native tools report through exit codes, checked one by one below with a clear message.
$PSNativeCommandUseErrorActionPreference = $false
Set-Location (Join-Path $PSScriptRoot '..')

function Stop-Deploy([string]$message) {
  Write-Host "`n$message" -ForegroundColor Red
  exit 1
}

function Invoke-Checked([string]$what, [scriptblock]$command) {
  & $command
  if ($LASTEXITCODE -ne 0) { Stop-Deploy "Deployment stopped: $what failed (exit code $LASTEXITCODE). See the output above." }
}

function New-Secret([int]$bytes = 32, [switch]$LettersAndDigits) {
  $b = [byte[]]::new($bytes); [Security.Cryptography.RandomNumberGenerator]::Fill($b)
  $text = [Convert]::ToBase64String($b) -replace '[+/=]', ''
  # -LettersAndDigits: for the LiveKit secret, written into a YAML key file on the call server.
  if ($LettersAndDigits) { return $text }
  # URL-safe, and always contains upper/lower/digit/symbol to satisfy PostgreSQL complexity rules.
  $text + 'Aa1!'
}

if (-not $Environment) { Stop-Deploy 'Give an environment name, for example -Environment dev.' }
foreach ($tool in 'az', 'azd') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    Stop-Deploy "$tool is not installed. Install it (az: https://aka.ms/installazurecli, azd: https://aka.ms/azd-install) and run the script again."
  }
}

# Sign in if needed (azd and az keep separate tokens).
azd auth login --check-status *> $null
if ($LASTEXITCODE -ne 0) { Invoke-Checked 'azd sign-in' { azd auth login } }
az account show --only-show-errors *> $null
if ($LASTEXITCODE -ne 0) { Invoke-Checked 'az sign-in' { az login --only-show-errors | Out-Null } }
if ($Subscription) { Invoke-Checked "selecting subscription '$Subscription'" { az account set --subscription $Subscription --only-show-errors } }
$subId = (az account show --query id -o tsv --only-show-errors 2>$null | Select-Object -First 1)
if (-not $subId) {
  Stop-Deploy "No Azure subscription is selected. Run 'az login', then 'az account set --subscription <id>' (or pass -Subscription)."
}
$subId = $subId.Trim()
Write-Host "Subscription: $subId"

# Create or select the azd environment.
# The location is part of every resource name, so only set it for a new env or when passed explicitly.
$known = @()
$listed = azd env list --output json --no-prompt 2>$null
if ($LASTEXITCODE -eq 0 -and $listed) {
  try { $known = @(($listed | Out-String | ConvertFrom-Json) | ForEach-Object { $_.Name }) }
  catch { Stop-Deploy 'Could not read the list of azd environments (azd env list).' }
}
if ($known -contains $Environment) {
  Invoke-Checked "selecting azd environment '$Environment'" { azd env select $Environment --no-prompt }
  if ($PSBoundParameters.ContainsKey('Location')) { Invoke-Checked 'setting the location' { azd env set AZURE_LOCATION $Location --no-prompt } }
} else {
  Invoke-Checked "creating azd environment '$Environment'" { azd env new $Environment --subscription $subId --location $Location --no-prompt }
  Invoke-Checked 'setting the location' { azd env set AZURE_LOCATION $Location --no-prompt }
}
Invoke-Checked 'setting the subscription' { azd env set AZURE_SUBSCRIPTION_ID $subId --no-prompt }

# Generate secrets once; they are stored in .azure/<env>/.env (gitignored) and pushed to Key Vault by Bicep.
$values = @(azd env get-values --no-prompt)
if ($LASTEXITCODE -ne 0) { Stop-Deploy "Could not read the azd environment '$Environment'." }
# The call server's two (LIVEKIT_API_SECRET, CALLS_VM_PASSWORD) are generated too, so turning calls on later needs
# nothing else; Bicep uses them only when CALLS_ENABLED is true.
foreach ($name in 'POSTGRES_ADMIN_PASSWORD', 'AUTH_SECRET', 'CALLS_VM_PASSWORD', 'LIVEKIT_API_SECRET') {
  if (-not ($values -match "^$name=")) {
    $secret = if ($name -eq 'LIVEKIT_API_SECRET') { New-Secret 48 -LettersAndDigits } else { New-Secret }
    Invoke-Checked "storing $name" { azd env set $name $secret --no-prompt }
  }
}

# Repair values that picked up a Windows carriage return from an earlier run (a CRLF tool output, e.g. a Windows openssl
# under Git Bash): Bicep parameter resolution fails on them with "invalid character '\r' in string literal" (#135).
# "get-values" shows the carriage return escaped as \r (and escapes other characters too, e.g. "!" as "\!", so its text
# must never be written back). The real value comes from "get-value": PowerShell splits native output at a carriage
# return, so joining its lines gives the value without it. Nothing was ever provisioned with these values.
$parameterKeys = 'AZURE_ENV_NAME', 'AZURE_LOCATION', 'AZURE_SUBSCRIPTION_ID', 'POSTGRES_ADMIN_PASSWORD', 'AUTH_SECRET', 'SERVICE_WEB_IMAGE_NAME',
  'CALLS_ENABLED', 'CALLS_VM_SIZE', 'CALLS_DISK_SKU', 'CALLS_TURN_TLS', 'CALLS_SHUTDOWN_TIME', 'CALLS_VM_PASSWORD', 'LIVEKIT_API_SECRET'
foreach ($key in $parameterKeys) {
  $escaped = $values | Where-Object { $_ -like "$key=*" } | Select-Object -First 1
  if (-not $escaped -or $escaped -notmatch '\\r') { continue }
  $clean = @(azd env get-value $key --no-prompt) -join ''
  if ($LASTEXITCODE -ne 0) { Stop-Deploy "Could not read $key from the azd environment '$Environment'." }
  Write-Host "Repairing $key (it contained a Windows line break)." -ForegroundColor Yellow
  Invoke-Checked "repairing $key" { azd env set $key $clean --no-prompt }
}
$values = @(azd env get-values --no-prompt)
if ($LASTEXITCODE -ne 0) { Stop-Deploy "Could not read the azd environment '$Environment'." }

if (Test-Path 'src/Circloo.Api/Dockerfile') {
  $firstDeploy = -not ($values -match '^SERVICE_WEB_IMAGE_NAME=".+"')
  Invoke-Checked 'azd up' { azd up --no-prompt }
  if ($firstDeploy) {
    # The first provision pointed ingress at the placeholder's port 80; re-provision so it targets the app (idempotent).
    Invoke-Checked 'second provision' { azd provision --no-prompt }
  }
} else {
  Write-Host 'No app yet (src/Circloo.Api/Dockerfile missing) - provisioning infrastructure only.' -ForegroundColor Yellow
  Invoke-Checked 'azd provision' { azd provision --no-prompt }
}

# Group calls: a deployment does not start a VM that the nightly shutdown deallocated, so start it (idempotent).
$values = @(azd env get-values --no-prompt)
if ($LASTEXITCODE -ne 0) { Stop-Deploy "Could not read the azd environment '$Environment'." }
if ($values -match '^CALLS_ENABLED="?true"?$') {
  & (Join-Path $PSScriptRoot 'calls-start.ps1') -Environment $Environment
  if ($LASTEXITCODE -ne 0) { Stop-Deploy 'Deployment stopped: starting the call server failed. See the output above.' }
} else {
  # Turning calls off does not delete an existing call server; say so, since it keeps costing money.
  $left = @(az vm list --resource-group "rg-circloo-$Environment" --query "[?starts_with(name, 'vm-circloo-')].name" -o tsv --only-show-errors 2>$null | Where-Object { $_ })
  if ($left) {
    Write-Host "Calls are disabled, but the call server VM $($left -join ', ') still exists and keeps costing money (IP and disk). Turning CALLS_ENABLED off does not delete it: run scripts/destroy, or delete its resources." -ForegroundColor Yellow
  }
}

Write-Host "`nDeployed to resource group rg-circloo-$Environment" -ForegroundColor Green
azd env get-value WEB_URI --no-prompt

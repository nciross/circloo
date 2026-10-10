#Requires -Version 7
<#
.SYNOPSIS
  Start the group call server VM of a circloo environment, without a full deploy.
.DESCRIPTION
  Outside production the call server shuts down every night (CALLS_SHUTDOWN_TIME, 20:00 Paris time by default) and a
  deployment does not start a deallocated VM. While it is off, starting a call answers "try again". This script starts
  it again with one 'az vm start'; LiveKit is ready about a minute after the VM is up. scripts/deploy runs it after
  provisioning whenever calls are enabled. Running it on a VM that is already running changes nothing.
  Needs PowerShell 7, az and azd, and the azd environment created by scripts/deploy with CALLS_ENABLED=true:
    azd env set CALLS_ENABLED true ; ./scripts/deploy.ps1 -Environment dev
.EXAMPLE
  ./scripts/calls-start.ps1                    # env "dev"
  ./scripts/calls-start.ps1 -Environment prod
#>
param(
  [string]$Environment = 'dev'
)
$ErrorActionPreference = 'Stop'
# Native tools report through exit codes, checked one by one below with a clear message.
$PSNativeCommandUseErrorActionPreference = $false
Set-Location (Join-Path $PSScriptRoot '..')

function Stop-Start([string]$message) {
  Write-Host "`n$message" -ForegroundColor Red
  exit 1
}

if (-not $Environment) { Stop-Start 'Give an environment name, for example -Environment dev.' }
foreach ($tool in 'az', 'azd') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    Stop-Start "$tool is not installed. Install it (az: https://aka.ms/installazurecli, azd: https://aka.ms/azd-install) and run the script again."
  }
}

azd env select $Environment --no-prompt *> $null
if ($LASTEXITCODE -ne 0) { Stop-Start "There is no azd environment '$Environment' on this machine. Deploy it first: ./scripts/deploy.ps1 -Environment $Environment" }
$values = @(azd env get-values --no-prompt)
if ($LASTEXITCODE -ne 0) { Stop-Start "Could not read the azd environment '$Environment'." }

# These values are plain names and flags, so the quoting of "get-values" is enough here.
function Get-EnvValue([string]$name) {
  $line = $values | Where-Object { $_ -like "$name=*" } | Select-Object -First 1
  if (-not $line) { return '' }
  return $line.Substring($name.Length + 1).Trim().Trim('"')
}

if ((Get-EnvValue 'CALLS_ENABLED') -ne 'true') {
  Stop-Start "Calls are not enabled in '$Environment'. To create the call server: azd env set CALLS_ENABLED true, then ./scripts/deploy.ps1 -Environment $Environment"
}
$vm = Get-EnvValue 'CALLS_VM_NAME'
$rg = Get-EnvValue 'AZURE_RESOURCE_GROUP'
$subscription = Get-EnvValue 'AZURE_SUBSCRIPTION_ID'
if (-not $vm -or -not $rg) {
  Stop-Start "The call server of '$Environment' is not provisioned yet. Run ./scripts/deploy.ps1 -Environment $Environment"
}

az account show --only-show-errors *> $null
if ($LASTEXITCODE -ne 0) {
  az login --only-show-errors | Out-Null
  if ($LASTEXITCODE -ne 0) { Stop-Start 'Could not sign in to Azure (az login).' }
}

Write-Host "Starting the call server $vm in $rg (a minute or two)..."
$subscriptionArgs = if ($subscription) { @('--subscription', $subscription) } else { @() }
az vm start --resource-group $rg --name $vm @subscriptionArgs --only-show-errors
if ($LASTEXITCODE -ne 0) { Stop-Start "Could not start the call server (az vm start failed, exit code $LASTEXITCODE). See the output above." }

Write-Host "Call server running: $(Get-EnvValue 'LIVEKIT_URL')" -ForegroundColor Green
Write-Host 'LiveKit answers about a minute after boot; until then starting a call answers "try again".'

<#
.SYNOPSIS
  Deploy circloo to Azure in one command. Everything goes into ONE resource group: rg-circloo-<env>.
.EXAMPLE
  ./scripts/deploy.ps1                       # env "dev" in francecentral
  ./scripts/deploy.ps1 -Environment prod -Location westeurope
#>
param(
  [string]$Environment = 'dev',
  [string]$Location = 'francecentral',
  [string]$Subscription = ''
)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

function New-Secret([int]$bytes = 32) {
  $b = [byte[]]::new($bytes); [Security.Cryptography.RandomNumberGenerator]::Fill($b)
  # URL-safe, and always contains upper/lower/digit/symbol to satisfy PostgreSQL complexity rules.
  ([Convert]::ToBase64String($b) -replace '[+/=]', '') + 'Aa1!'
}

foreach ($tool in 'az', 'azd') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool is not installed." }
}

# Sign in if needed (azd and az keep separate tokens).
azd auth login --check-status *> $null; if ($LASTEXITCODE -ne 0) { azd auth login }
az account show *> $null;               if ($LASTEXITCODE -ne 0) { az login | Out-Null }
if ($Subscription) { az account set --subscription $Subscription }
$subId = az account show --query id -o tsv

# Create or select the azd environment.
azd env select $Environment *> $null
if ($LASTEXITCODE -ne 0) { azd env new $Environment --subscription $subId --location $Location --no-prompt }
azd env set AZURE_SUBSCRIPTION_ID $subId | Out-Null
azd env set AZURE_LOCATION $Location | Out-Null

# Generate secrets once; they are stored in .azure/<env>/.env (gitignored) and pushed to Key Vault by Bicep.
$values = azd env get-values
foreach ($name in 'POSTGRES_ADMIN_PASSWORD', 'AUTH_SECRET') {
  if (-not ($values -match "^$name=")) { azd env set $name (New-Secret) | Out-Null }
}

if (Test-Path 'src/web/Dockerfile') {
  azd up --no-prompt
} else {
  Write-Host 'No app yet (src/web/Dockerfile missing) - provisioning infrastructure only.' -ForegroundColor Yellow
  azd provision --no-prompt
}
if ($LASTEXITCODE -ne 0) { throw 'Deployment failed.' }

Write-Host "`nDeployed to resource group rg-circloo-$Environment" -ForegroundColor Green
azd env get-value WEB_URI

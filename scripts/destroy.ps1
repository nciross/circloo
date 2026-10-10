#Requires -Version 7
<#
.SYNOPSIS
  Destroy a circloo environment: deletes the whole resource group rg-circloo-<env> and purges Key Vault.
  That includes the group call server (VM, disk, public IPs, network, auto-shutdown schedule) when calls were enabled.
.EXAMPLE
  ./scripts/destroy.ps1            # asks for confirmation
  ./scripts/destroy.ps1 -Environment dev -Yes
#>
param(
  [string]$Environment = 'dev',
  [switch]$Yes
)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$rg = "rg-circloo-$Environment"

if (-not $Yes) {
  $answer = Read-Host "This permanently deletes $rg and ALL its data. Type the environment name ($Environment) to confirm"
  if ($answer -ne $Environment) { Write-Host 'Aborted.'; exit 1 }
}

azd env select $Environment *> $null
if ($LASTEXITCODE -eq 0) {
  azd down --force --purge --no-prompt
} else {
  # No local azd env (e.g. different machine): fall back to deleting the resource group directly.
  az group delete --name $rg --yes
  if ($LASTEXITCODE -ne 0) { throw 'Destroy failed.' }
  # Purge the soft-deleted Key Vault, or the next deploy of this env collides with it.
  $query = "[?starts_with(name, 'kv-circloo-') && properties.tags.""azd-env-name"" == '$Environment'].name"
  foreach ($kv in @(az keyvault list-deleted --resource-type vault --query $query -o tsv | Where-Object { $_ })) {
    az keyvault purge --name $kv
  }
}
if ($LASTEXITCODE -ne 0) { throw 'Destroy failed.' }
Write-Host "$rg destroyed." -ForegroundColor Green

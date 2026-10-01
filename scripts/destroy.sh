#!/usr/bin/env bash
# Destroy a circloo environment: deletes the whole resource group rg-circloo-<env> and purges Key Vault.
# Usage: ./scripts/destroy.sh [env=dev] [--yes]
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_NAME="dev"
YES=""
for arg in "$@"; do
  case "$arg" in
    -y|--yes) YES=1 ;;
    *) ENV_NAME="$arg" ;;
  esac
done
RG="rg-circloo-$ENV_NAME"

if [ -z "$YES" ]; then
  read -r -p "This permanently deletes $RG and ALL its data. Type the environment name ($ENV_NAME) to confirm: " answer
  [ "$answer" = "$ENV_NAME" ] || { echo "Aborted."; exit 1; }
fi

if azd env select "$ENV_NAME" >/dev/null 2>&1; then
  azd down --force --purge --no-prompt
else
  az group delete --name "$RG" --yes
  # Purge the soft-deleted Key Vault, or the next deploy of this env collides with it.
  query="[?starts_with(name, 'kv-circloo-') && properties.tags.\"azd-env-name\" == '$ENV_NAME'].name"
  for kv in $(az keyvault list-deleted --resource-type vault --query "$query" -o tsv); do
    az keyvault purge --name "$kv"
  done
fi
echo "$RG destroyed."

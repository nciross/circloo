#!/usr/bin/env bash
# Destroy a circloo environment: deletes the whole resource group rg-circloo-<env> and purges Key Vault.
# Usage: ./scripts/destroy.sh [env=dev] [--yes]
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_NAME="${1:-dev}"
RG="rg-circloo-$ENV_NAME"

if [ "${2:-}" != "--yes" ]; then
  read -r -p "This permanently deletes $RG and ALL its data. Type the environment name ($ENV_NAME) to confirm: " answer
  [ "$answer" = "$ENV_NAME" ] || { echo "Aborted."; exit 1; }
fi

if azd env select "$ENV_NAME" >/dev/null 2>&1; then
  azd down --force --purge --no-prompt
else
  az group delete --name "$RG" --yes
fi
echo "$RG destroyed."

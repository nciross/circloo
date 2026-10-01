#!/usr/bin/env bash
# Deploy circloo to Azure in one command. Everything goes into ONE resource group: rg-circloo-<env>.
# Usage: ./scripts/deploy.sh [env=dev] [location=francecentral]
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_NAME="${1:-dev}"
LOCATION="${2:-francecentral}"

new_secret() { echo "$(openssl rand -base64 32 | tr -d '+/=')Aa1!"; }

for tool in az azd openssl; do command -v "$tool" >/dev/null || { echo "$tool is not installed." >&2; exit 1; }; done

azd auth login --check-status >/dev/null 2>&1 || azd auth login
az account show >/dev/null 2>&1 || az login >/dev/null
SUB_ID="$(az account show --query id -o tsv)"

# The location is part of every resource name, so only set it for a new env or when passed explicitly.
if ! azd env select "$ENV_NAME" >/dev/null 2>&1; then
  azd env new "$ENV_NAME" --subscription "$SUB_ID" --location "$LOCATION" --no-prompt
  azd env set AZURE_LOCATION "$LOCATION" >/dev/null
elif [ $# -ge 2 ]; then
  azd env set AZURE_LOCATION "$LOCATION" >/dev/null
fi
azd env set AZURE_SUBSCRIPTION_ID "$SUB_ID" >/dev/null

# Capture first: grep -q on a live pipe can SIGPIPE under pipefail and regenerate the secrets.
VALUES="$(azd env get-values)"
for name in POSTGRES_ADMIN_PASSWORD AUTH_SECRET; do
  grep -q "^$name=" <<<"$VALUES" || azd env set "$name" "$(new_secret)" >/dev/null
done

if [ -f src/Circloo.Api/Dockerfile ]; then
  azd up --no-prompt
else
  echo "No app yet (src/Circloo.Api/Dockerfile missing) - provisioning infrastructure only."
  azd provision --no-prompt
fi

echo "Deployed to resource group rg-circloo-$ENV_NAME"
azd env get-value WEB_URI

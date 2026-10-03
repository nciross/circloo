#!/usr/bin/env bash
# Deploy circloo to Azure in one command. Everything goes into ONE resource group: rg-circloo-<env>.
# Usage: ./scripts/deploy.sh [env=dev] [location=francecentral] [subscription]
# Every step stops with one clear sentence when something is missing (tool, sign-in, subscription, azd environment).
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_NAME="${1:-dev}"
LOCATION="${2:-francecentral}"
SUBSCRIPTION="${3:-}"

stop() { printf '\n%s\n' "$1" >&2; exit 1; }
checked() { local what="$1"; shift; "$@" || stop "Deployment stopped: $what failed. See the output above."; }
# A Windows openssl ends its output with CRLF: drop \r too, or the secret carries it into Bicep (#135).
new_secret() {
  local raw
  raw="$(openssl rand -base64 32)" || stop "openssl could not generate a secret."
  printf '%sAa1!' "$(tr -d '+/=\r\n' <<<"$raw")"
}

for tool in az azd openssl; do
  command -v "$tool" >/dev/null || stop "$tool is not installed. Install it and run the script again."
done

azd auth login --check-status >/dev/null 2>&1 || checked "azd sign-in" azd auth login
az account show --only-show-errors >/dev/null 2>&1 || checked "az sign-in" az login --only-show-errors >/dev/null
if [ -n "$SUBSCRIPTION" ]; then checked "selecting subscription $SUBSCRIPTION" az account set --subscription "$SUBSCRIPTION" --only-show-errors; fi
SUB_ID="$(az account show --query id -o tsv --only-show-errors 2>/dev/null | tr -d '\r' || true)"
[ -n "$SUB_ID" ] || stop "No Azure subscription is selected. Run 'az login', then 'az account set --subscription <id>' (or pass it as the 3rd argument)."
echo "Subscription: $SUB_ID"

# The location is part of every resource name, so only set it for a new env or when passed explicitly.
# Capture first: grep -q on a live pipe can SIGPIPE under pipefail and send an existing environment down "create".
ENVS="$(azd env list --output json --no-prompt 2>/dev/null || true)"
if grep -Eiq "\"name\": *\"$ENV_NAME\"" <<<"$ENVS"; then
  checked "selecting azd environment $ENV_NAME" azd env select "$ENV_NAME" --no-prompt
  # Only when a location was given: a subscription as 3rd argument must not reset it.
  if [ -n "${2:-}" ]; then checked "setting the location" azd env set AZURE_LOCATION "$LOCATION" --no-prompt >/dev/null; fi
else
  checked "creating azd environment $ENV_NAME" azd env new "$ENV_NAME" --subscription "$SUB_ID" --location "$LOCATION" --no-prompt
  checked "setting the location" azd env set AZURE_LOCATION "$LOCATION" --no-prompt >/dev/null
fi
checked "setting the subscription" azd env set AZURE_SUBSCRIPTION_ID "$SUB_ID" --no-prompt >/dev/null

# Capture first: grep -q on a live pipe can SIGPIPE under pipefail and regenerate the secrets.
VALUES="$(azd env get-values --no-prompt)" || stop "Could not read the azd environment $ENV_NAME."
for name in POSTGRES_ADMIN_PASSWORD AUTH_SECRET; do
  if ! grep -q "^$name=" <<<"$VALUES"; then
    secret="$(new_secret)"
    checked "storing $name" azd env set "$name" "$secret" --no-prompt >/dev/null
  fi
done

# Repair values that picked up a Windows carriage return from an earlier run (a CRLF tool output): Bicep parameter
# resolution fails on them with "invalid character '\r' in string literal" (#135). Each value is read with
# "azd env get-value", which prints the real value ("get-values" escapes it, e.g. "!" as "\!", and must never be
# written back); only carriage returns are removed. Nothing was ever provisioned with them.
CR=$'\r'
for key in AZURE_ENV_NAME AZURE_LOCATION AZURE_SUBSCRIPTION_ID POSTGRES_ADMIN_PASSWORD AUTH_SECRET SERVICE_WEB_IMAGE_NAME; do
  value="$(azd env get-value "$key" --no-prompt 2>/dev/null)" || continue
  clean="${value//$CR/}"
  if [ "$clean" != "$value" ]; then
    echo "Repairing $key (it contained a Windows line break)."
    checked "repairing $key" azd env set "$key" "$clean" --no-prompt >/dev/null
  fi
done
VALUES="$(azd env get-values --no-prompt)" || stop "Could not read the azd environment $ENV_NAME."

if [ -f src/Circloo.Api/Dockerfile ]; then
  FIRST_DEPLOY=1
  if grep -Eq '^SERVICE_WEB_IMAGE_NAME=".+"' <<<"$VALUES"; then FIRST_DEPLOY=0; fi
  checked "azd up" azd up --no-prompt
  if [ "$FIRST_DEPLOY" = 1 ]; then
    # The first provision pointed ingress at the placeholder's port 80; re-provision so it targets the app (idempotent).
    checked "second provision" azd provision --no-prompt
  fi
else
  echo "No app yet (src/Circloo.Api/Dockerfile missing) - provisioning infrastructure only."
  checked "azd provision" azd provision --no-prompt
fi

echo "Deployed to resource group rg-circloo-$ENV_NAME"
azd env get-value WEB_URI --no-prompt

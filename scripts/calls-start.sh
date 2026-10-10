#!/usr/bin/env bash
# Start the group call server VM of a circloo environment, without a full deploy.
# Usage: ./scripts/calls-start.sh [env=dev]
#
# Outside production the call server shuts down every night (CALLS_SHUTDOWN_TIME, 20:00 Paris time by default) and a
# deployment does not start a deallocated VM. While it is off, starting a call answers "try again". This starts it
# again with one 'az vm start'; LiveKit is ready about a minute after the VM is up. scripts/deploy runs it after
# provisioning whenever calls are enabled. Running it on a VM that is already running changes nothing.
# Needs az and azd, and the azd environment created by scripts/deploy with CALLS_ENABLED=true:
#   azd env set CALLS_ENABLED true && ./scripts/deploy.sh dev
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_NAME="${1:-dev}"

stop() { printf '\n%s\n' "$1" >&2; exit 1; }

for tool in az azd; do
  command -v "$tool" >/dev/null || stop "$tool is not installed. Install it and run the script again."
done

azd env select "$ENV_NAME" --no-prompt >/dev/null 2>&1 \
  || stop "There is no azd environment $ENV_NAME on this machine. Deploy it first: ./scripts/deploy.sh $ENV_NAME"
# Capture first: grep on a live pipe can SIGPIPE under pipefail.
VALUES="$(azd env get-values --no-prompt)" || stop "Could not read the azd environment $ENV_NAME."

# These values are plain names and flags, so the quoting of "get-values" is enough here.
env_value() {
  local line
  line="$(grep -m1 "^$1=" <<<"$VALUES" || true)"
  line="${line#*=}"; line="${line//$'\r'/}"; line="${line#\"}"; line="${line%\"}"
  printf '%s' "$line"
}

enabled="$(env_value CALLS_ENABLED | tr '[:upper:]' '[:lower:]')"
[ "$enabled" = "true" ] \
  || stop "Calls are not enabled in $ENV_NAME. To create the call server: azd env set CALLS_ENABLED true, then ./scripts/deploy.sh $ENV_NAME"
VM="$(env_value CALLS_VM_NAME)"
RG="$(env_value AZURE_RESOURCE_GROUP)"
SUBSCRIPTION="$(env_value AZURE_SUBSCRIPTION_ID)"
[ -n "$VM" ] && [ -n "$RG" ] || stop "The call server of $ENV_NAME is not provisioned yet. Run ./scripts/deploy.sh $ENV_NAME"

az account show --only-show-errors >/dev/null 2>&1 || az login --only-show-errors >/dev/null || stop "Could not sign in to Azure (az login)."

echo "Starting the call server $VM in $RG (a minute or two)..."
args=(--resource-group "$RG" --name "$VM" --only-show-errors)
if [ -n "$SUBSCRIPTION" ]; then args+=(--subscription "$SUBSCRIPTION"); fi
az vm start "${args[@]}" || stop "Could not start the call server (az vm start failed). See the output above."

echo "Call server running: $(env_value LIVEKIT_URL)"
echo 'LiveKit answers about a minute after boot; until then starting a call answers "try again".'

#!/bin/bash
# The call server VM, every boot (spec 009 T917, research R23, R26, R28). A template: infra/modules/livekit.bicep
# replaces the placeholders in double underscores and stores the result as the VM's userData; circloo-calls.service
# (infra/livekit/cloud-init.yaml) reads it from IMDS and runs it as root at every boot. It holds no secret: userData is
# readable from inside the VM. Safe to run again: it replaces the containers each time.
#
# Runs the pinned LiveKit server and Caddy (with the layer4 module), both with host networking. Caddy terminates TLS
# on 443 with Let's Encrypt certificates (TLS-ALPN challenge, so port 80 stays closed) for lk-<token> (WebSocket and
# Twirp to LiveKit on 7880) and, when TURN/TLS is on, for turn-<token> (to LiveKit's TURN on 5349, PROXY protocol v2).
set -euo pipefail
umask 077

# Pinned: bump on purpose, never "latest". The LiveKit pin is the same as the AppHost and LiveKitFixture.
LIVEKIT_IMAGE='livekit/livekit-server:v1.13.7'
CADDY_IMAGE='livekit/caddyl4:v2.11.3'

LK_DOMAIN='__LK_DOMAIN__'          # lk-<token>.<region>.cloudapp.azure.com
TURN_DOMAIN='__TURN_DOMAIN__'      # turn-<token>.<region>.cloudapp.azure.com, empty when callsTurnTls is false
TURN_PRIVATE_IP='__TURN_PRIVATE_IP__' # the private address behind turn-<token>, empty when callsTurnTls is false
VAULT_URI='__VAULT_URI__'          # https://kv-circloo-<token>.vault.azure.net/
API_KEY='__API_KEY__'              # the key id, not a secret
IMDS='http://169.254.169.254/metadata'

log() { echo "circloo-calls: $*"; }

# 1. Packages, in case the first boot could not install them.
if ! command -v docker >/dev/null || ! command -v jq >/dev/null; then
  log "installing docker.io and jq"
  apt-get update -q
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q docker.io jq
  systemctl enable --now docker
fi

# 2. The second private address (behind turn-<token>), added to the network interface when cloud-init did not, so
# Caddy receives what arrives on the second public IP.
if [ -n "$TURN_PRIVATE_IP" ]; then
  nic="$(ip -o -4 route show default | awk '{print $5; exit}')"
  ip -o -4 addr show | grep -q " $TURN_PRIVATE_IP/" || ip addr add "$TURN_PRIVATE_IP/32" dev "$nic"
fi

# 3. The API secret: read from Key Vault with this VM's system-assigned identity (IMDS token), written to a root-only
# key file. The token goes to curl on stdin, never on a command line. The role assignment can take a few minutes to
# apply after the VM is created, so it waits up to 10 minutes (the service tries again after that).
secret=''
for attempt in $(seq 1 60); do
  token="$(curl -sf --noproxy '*' -H Metadata:true \
    "$IMDS/identity/oauth2/token?api-version=2018-02-01&resource=https%3A%2F%2Fvault.azure.net" \
    | jq -r '.access_token // empty')" || token=''
  if [ -n "$token" ]; then
    secret="$(printf 'Authorization: Bearer %s\n' "$token" \
      | curl -sf -H @- "${VAULT_URI}secrets/livekit-api-secret?api-version=7.4" \
      | jq -r '.value // empty')" || secret=''
  fi
  [ -n "$secret" ] && break
  log "waiting for Key Vault access ($attempt of 60)"
  sleep 10
done
unset token
[ -n "$secret" ] || { log "could not read livekit-api-secret from Key Vault"; exit 1; }
if ! [[ "$secret" =~ ^[A-Za-z0-9_-]{32,}$ ]]; then
  log "livekit-api-secret must be at least 32 letters, digits, - or _ (scripts/deploy generates one)"
  exit 1
fi
install -d -m 700 /etc/livekit /etc/caddy /var/lib/circloo/caddy
printf '%s: %s\n' "$API_KEY" "$secret" > /etc/livekit/keys.yaml.new
unset secret
chmod 600 /etc/livekit/keys.yaml.new
mv -f /etc/livekit/keys.yaml.new /etc/livekit/keys.yaml

# 4. LiveKit configuration: infra/livekit/livekit.yaml with its placeholders filled by livekit.bicep.
cat > /etc/livekit/livekit.yaml <<'CIRCLOO_LIVEKIT_YAML'
__LIVEKIT_YAML__
CIRCLOO_LIVEKIT_YAML

# 5. Caddy configuration (JSON, layer4). No admin endpoint, no HTTP challenge (port 80 is closed).
jq -n --arg lk "$LK_DOMAIN" --arg turn "$TURN_DOMAIN" '
  def route($sni; $handle): {match: [{tls: {sni: [$sni]}}], handle: $handle};
  ([$lk, $turn] | map(select(. != ""))) as $names
  | {
      admin: {disabled: true},
      logging: {logs: {default: {level: "WARN"}}},
      apps: {
        tls: {
          certificates: {automate: $names},
          automation: {policies: [{subjects: $names, issuers: [{module: "acme", challenges: {http: {disabled: true}}}]}]}
        },
        layer4: {servers: {calls: {listen: [":443"], routes: (
          (if $turn == "" then [] else [route($turn; [
            {handler: "tls"},
            {handler: "proxy", proxy_protocol: "v2", upstreams: [{dial: ["127.0.0.1:5349"]}]}
          ])] end)
          + [route($lk; [
            {handler: "tls", connection_policies: [{alpn: ["http/1.1"]}]},
            {handler: "proxy", upstreams: [{dial: ["127.0.0.1:7880"]}]}
          ])]
        )}}}
      }
    }' > /etc/caddy/caddy.json

# 6. The containers. Certificates stay on the disk (/var/lib/circloo/caddy) across restarts, so a nightly stop does
# not ask Let's Encrypt again.
pull() {
  for attempt in 1 2 3 4 5; do
    docker pull -q "$1" && return 0
    log "retrying the pull of $1 ($attempt)"
    sleep 10
  done
  return 1
}
pull "$LIVEKIT_IMAGE"
pull "$CADDY_IMAGE"
docker rm -f livekit caddy >/dev/null 2>&1 || true
docker run -d --name livekit --restart unless-stopped --network host --log-driver journald \
  -v /etc/livekit:/etc/livekit:ro \
  "$LIVEKIT_IMAGE" --config /etc/livekit/livekit.yaml
docker run -d --name caddy --restart unless-stopped --network host --log-driver journald \
  -v /etc/caddy/caddy.json:/etc/caddy/caddy.json:ro -v /var/lib/circloo/caddy:/data \
  --entrypoint caddy "$CADDY_IMAGE" run --config /etc/caddy/caddy.json
log "started LiveKit for $LK_DOMAIN${TURN_DOMAIN:+ and TURN/TLS for $TURN_DOMAIN}"

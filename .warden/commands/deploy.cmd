#!/usr/bin/env bash
[[ ! ${WARDEN_DIR} ]] && >&2 echo -e "\033[31mThis script is not intended to be run directly!\033[0m" && exit 1

WARDEN_ENV_PATH="$(locateEnvPath)" || exit $?
loadEnvConfig "${WARDEN_ENV_PATH}" || exit $?
assertDockerRunning
[[ $("$WARDEN_BIN" env ps -q app) ]] || fatal "app is not running; run: warden env up"

# Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in .env (plan phase P0).
eval "$(sed 's/\r$//' "${WARDEN_ENV_PATH}/.env" | grep -E '^CLOUDFLARE_')"
[[ -n "${CLOUDFLARE_API_TOKEN}" ]] || fatal "CLOUDFLARE_API_TOKEN is not set in .env"

"$WARDEN_BIN" env exec -T -e CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN}" -e CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID}" app \
  bash -c "npm run build && npx wrangler d1 migrations apply ledger --remote && npx wrangler deploy"

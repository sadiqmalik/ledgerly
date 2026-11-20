#!/usr/bin/env bash
[[ ! ${WARDEN_DIR} ]] && >&2 echo -e "\033[31mThis script is not intended to be run directly!\033[0m" && exit 1

WARDEN_ENV_PATH="$(locateEnvPath)" || exit $?
loadEnvConfig "${WARDEN_ENV_PATH}" || exit $?
assertDockerRunning
[[ $("$WARDEN_BIN" env ps -q app) ]] || fatal "app is not running; run: warden env up"

# Same argument handling as account-create: a leading --remote targets the live database.
ARGS=("${WARDEN_PARAMS[@]}" "$@")
REMOTE=()
ENV_ARGS=()
if [[ "${ARGS[0]:-}" == "--remote" ]]; then
  ARGS=("${ARGS[@]:1}")
  REMOTE=(--remote)

  eval "$(sed 's/\r$//' "${WARDEN_ENV_PATH}/.env" | grep -E '^CLOUDFLARE_')"
  [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]] || fatal "CLOUDFLARE_API_TOKEN is not set in .env (needed for --remote)"
  ENV_ARGS=(-e CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN}" -e CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}")
fi

# No -T: the password prompt is hidden and needs a terminal.
"$WARDEN_BIN" env exec "${ENV_ARGS[@]}" app node scripts/reset-password.js "${REMOTE[@]}" "${ARGS[@]}"

#!/usr/bin/env bash
[[ ! ${WARDEN_DIR} ]] && >&2 echo -e "\033[31mThis script is not intended to be run directly!\033[0m" && exit 1

WARDEN_ENV_PATH="$(locateEnvPath)" || exit $?
loadEnvConfig "${WARDEN_ENV_PATH}" || exit $?
assertDockerRunning
[[ $("$WARDEN_BIN" env ps -q app) ]] || fatal "app is not running; run: warden env up"

# Warden passes the first word as WARDEN_PARAMS and everything else as "$@". Join them, then
# take a leading --remote off the front. Without --remote the SQL runs on the local D1 file.
ARGS=("${WARDEN_PARAMS[@]}" "$@")
TARGET="--local"
ENV_ARGS=()
if [[ "${ARGS[0]:-}" == "--remote" ]]; then
  ARGS=("${ARGS[@]:1}")
  TARGET="--remote"

  # Same credentials as deploy.cmd: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in .env.
  eval "$(sed 's/\r$//' "${WARDEN_ENV_PATH}/.env" | grep -E '^CLOUDFLARE_')"
  [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]] || fatal "CLOUDFLARE_API_TOKEN is not set in .env (needed for --remote)"
  ENV_ARGS=(-e CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN}" -e CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}")
fi

SQL="${ARGS[*]}"

# Against the live database, anything that is not a read needs a typed confirmation.
if [[ "${TARGET}" == "--remote" && -n "${SQL}" ]]; then
  FIRST_WORD="$(echo "${SQL}" | awk '{print toupper($1)}')"
  if [[ ! "${FIRST_WORD}" =~ ^(SELECT|PRAGMA|EXPLAIN|WITH)$ ]]; then
    echo -e "\033[33mThis changes the LIVE database (Cloudflare D1, ledger):\033[0m"
    echo "  ${SQL}"
    echo "Take a backup first if it is an UPDATE or DELETE: warden d1-backup <label> (local) or export from the dashboard."
    read -r -p "Type 'live' to run it: " ANSWER
    [[ "${ANSWER}" == "live" ]] || fatal "aborted"
  fi
fi

if [[ -z "${SQL}" ]]; then
  SQL="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
fi

if [[ "${TARGET}" == "--remote" ]]; then
  "$WARDEN_BIN" env exec -T "${ENV_ARGS[@]}" app npx wrangler d1 execute ledger --remote --command "${SQL}"
else
  "$WARDEN_BIN" env exec -T app npx wrangler d1 execute ledger --local --command "${SQL}"
fi

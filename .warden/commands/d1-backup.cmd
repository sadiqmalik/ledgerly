#!/usr/bin/env bash
[[ ! ${WARDEN_DIR} ]] && >&2 echo -e "\033[31mThis script is not intended to be run directly!\033[0m" && exit 1

WARDEN_ENV_PATH="$(locateEnvPath)" || exit $?
loadEnvConfig "${WARDEN_ENV_PATH}" || exit $?
assertDockerRunning
[[ $("$WARDEN_BIN" env ps -q app) ]] || fatal "app is not running; run: warden env up"

# Warden passes the first word as WARDEN_PARAMS and everything else as "$@". Join them, then take a
# leading --remote off the front. Without --remote the LOCAL database is exported.
ARGS=("${WARDEN_PARAMS[@]}" "$@")
TARGET="--local"
KIND=""
ENV_ARGS=()
if [[ "${ARGS[0]:-}" == "--remote" ]]; then
  ARGS=("${ARGS[@]:1}")
  TARGET="--remote"
  KIND="-remote"

  # Same credentials as deploy.cmd: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in .env. Reading only.
  eval "$(sed 's/\r$//' "${WARDEN_ENV_PATH}/.env" | grep -E '^CLOUDFLARE_')"
  [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]] || fatal "CLOUDFLARE_API_TOKEN is not set in .env (needed for --remote)"
  ENV_ARGS=(-e CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN}" -e CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}")
fi

LABEL="${ARGS[0]:-manual}"
# The label is only a name: a path such as backups/x.sql is cut down to x, and odd characters become "-".
LABEL="$(basename "${LABEL}" .sql | tr -c 'A-Za-z0-9._-' '-' | sed 's/^-*//; s/-*$//')"
[[ -n "${LABEL}" ]] || LABEL="manual"
FILE="backups/d1-${WARDEN_ENV_NAME}${KIND}-$(date +%Y%m%d-%H%M%S)-${LABEL}.sql"
mkdir -p "${WARDEN_ENV_PATH}/backups"

"$WARDEN_BIN" env exec -T "${ENV_ARGS[@]}" app npx wrangler d1 export ledger ${TARGET} --output "${FILE}" || fatal "d1 export failed"
[[ -s "${WARDEN_ENV_PATH}/${FILE}" ]] || fatal "backup is empty"
shasum -a 256 "${WARDEN_ENV_PATH}/${FILE}" > "${WARDEN_ENV_PATH}/${FILE}.sha256"
echo "Backup written: ${WARDEN_ENV_PATH}/${FILE}"

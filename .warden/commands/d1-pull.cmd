#!/usr/bin/env bash
[[ ! ${WARDEN_DIR} ]] && >&2 echo -e "\033[31mThis script is not intended to be run directly!\033[0m" && exit 1

WARDEN_ENV_PATH="$(locateEnvPath)" || exit $?
loadEnvConfig "${WARDEN_ENV_PATH}" || exit $?
assertDockerRunning
[[ $("$WARDEN_BIN" env ps -q app) ]] || fatal "app is not running; run: warden env up"

# Copies the LIVE database into the LOCAL one. The live database is only read.
eval "$(sed 's/\r$//' "${WARDEN_ENV_PATH}/.env" | grep -E '^CLOUDFLARE_')"
[[ -n "${CLOUDFLARE_API_TOKEN:-}" ]] || fatal "CLOUDFLARE_API_TOKEN is not set in .env"

LABEL="${WARDEN_PARAMS[0]:-pull}"
LABEL="$(basename "${LABEL}" .sql | tr -c 'A-Za-z0-9._-' '-' | sed 's/^-*//; s/-*$//')"
[[ -n "${LABEL}" ]] || LABEL="pull"
FILE="backups/d1-${WARDEN_ENV_NAME}-remote-$(date +%Y%m%d-%H%M%S)-${LABEL}.sql"
mkdir -p "${WARDEN_ENV_PATH}/backups"

read -r -p "This REPLACES the local D1 database with a copy of the LIVE database. A backup of the local one is taken first. Type 'pull' to continue: " ANSWER
[[ "${ANSWER}" == "pull" ]] || fatal "aborted"

"$WARDEN_BIN" d1-backup before-pull || fatal "could not back up the local database; nothing was changed"

"$WARDEN_BIN" env exec -T -e CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN}" -e CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}" app \
  npx wrangler d1 export ledger --remote --output "${FILE}" || fatal "export of the live database failed; the local database was not changed"
[[ -s "${WARDEN_ENV_PATH}/${FILE}" ]] || fatal "the live export is empty; the local database was not changed"
shasum -a 256 "${WARDEN_ENV_PATH}/${FILE}" > "${WARDEN_ENV_PATH}/${FILE}.sha256"
echo "Live export written: ${WARDEN_ENV_PATH}/${FILE}"

"$WARDEN_BIN" env exec -T app bash -c "rm -rf .wrangler/state/v3/d1 && npx wrangler d1 execute ledger --local --yes --file '${FILE}'" \
  || fatal "loading the export failed (your previous local data is in backups/*-before-pull.sql)"
echo "Local database now matches live. Restarting the app so it reopens the database."
"$WARDEN_BIN" env restart app

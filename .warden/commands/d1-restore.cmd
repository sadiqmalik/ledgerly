#!/usr/bin/env bash
[[ ! ${WARDEN_DIR} ]] && >&2 echo -e "\033[31mThis script is not intended to be run directly!\033[0m" && exit 1

WARDEN_ENV_PATH="$(locateEnvPath)" || exit $?
loadEnvConfig "${WARDEN_ENV_PATH}" || exit $?
assertDockerRunning
[[ $("$WARDEN_BIN" env ps -q app) ]] || fatal "app is not running; run: warden env up"

SRC="${WARDEN_PARAMS[0]:-$1}"
[[ -n "${SRC}" ]] || fatal "usage: warden d1-restore backups/d1-<file>.sql"
[[ -f "${WARDEN_ENV_PATH}/${SRC}" ]] || fatal "not found: ${SRC} (give a path inside the project, e.g. backups/...)"

read -r -p "This REPLACES the local D1 database with ${SRC}. A backup of the current local database is taken first. Type 'restore' to continue: " ANSWER
[[ "${ANSWER}" == "restore" ]] || fatal "aborted"

# Safety copy of what is about to be replaced. Not fatal: a brand-new setup has nothing to save.
"$WARDEN_BIN" d1-backup before-restore || echo "Warning: could not back up the current local database; continuing."

# A full export (d1-backup, d1-pull) has CREATE TABLE statements. A data-only file does not, so the
# migrations are applied to the empty database first.
SCHEMA_STEP="true"
if ! grep -q 'CREATE TABLE' "${WARDEN_ENV_PATH}/${SRC}"; then
  echo "No CREATE TABLE in ${SRC}: treating it as data only and applying the migrations first."
  SCHEMA_STEP="npm run db:migrate:local"
fi

"$WARDEN_BIN" env exec -T app bash -c "rm -rf .wrangler/state/v3/d1 && ${SCHEMA_STEP} && npx wrangler d1 execute ledger --local --yes --file '${SRC}'" || fatal "restore failed (the previous local data is in backups/*-before-restore.sql)"
echo "Restored ${SRC}. Restarting the app so it reopens the database."
"$WARDEN_BIN" env restart app

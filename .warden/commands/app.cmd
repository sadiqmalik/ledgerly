#!/usr/bin/env bash
[[ ! ${WARDEN_DIR} ]] && >&2 echo -e "\033[31mThis script is not intended to be run directly!\033[0m" && exit 1

WARDEN_ENV_PATH="$(locateEnvPath)" || exit $?
loadEnvConfig "${WARDEN_ENV_PATH}" || exit $?
assertDockerRunning

if [[ "${WARDEN_PARAMS[0]}" == "help" ]]; then
  $WARDEN_BIN app --help || exit $? && exit $?
fi

if (( ${#WARDEN_PARAMS[@]} == 0 && $# == 0 )); then
  "$WARDEN_BIN" env exec app bash
else
  "$WARDEN_BIN" env exec app "${WARDEN_PARAMS[@]}" "$@"
fi

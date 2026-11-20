---
name: validate-workspace-changes
description: Select and run the smallest useful validation commands for the changed project without over-testing.
---

## Goal

Validate behavior with minimum cost and maximum signal.

## Step 1 — map changed paths to project

- `**` (the app) → the ledger command set


## Step 2 — choose smallest command(s)

- ledger:
  - API/auth changes: apply test migrations with `npx --no-install wrangler d1 migrations apply ledger --local --persist-to .wrangler/state-test`, then run `node --test --test-concurrency=1 test/api/<related>.test.js test/auth/<related>.test.js` with only existing relevant files.
  - UI/build-impact changes: `npm run build`

Replace `<related>` with actual filenames; do not run placeholders literally. Batch related selectors into one runner invocation. API suites reset the test database: never point them at normal local or remote data. Use the full `npm test` only when targeted coverage is insufficient or fails in a way that requires a broader run.

## Step 3 — report concise evidence

- Command(s) run
- Pass/fail
- Any skipped checks and why

## Guardrails

- Do not install dependencies unless a selected validation command fails due to missing packages.
- Do not run apps/long-lived services unless needed for requested verification.

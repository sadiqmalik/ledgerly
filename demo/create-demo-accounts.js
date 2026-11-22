#!/usr/bin/env node
// Creates the two demo sign-in accounts in the LOCAL D1 (the seed's notes, entries and notebooks refer to their fixed ids).
// Run from the repository root, after demo-seed.sql:   warden app node demo/create-demo-accounts.js
//   demo-super@example.com  super administrator
//   demo-admin@example.com  administrator of the "Family Budget" ledger only
// The password is typed hidden (min 6 characters), never stored in the repo. Add --remote to write to the live demo database.
const { MIN_PASSWORD_LENGTH } = require('../server/auth/accounts');
const { hashPassword } = require('../server/auth/password');
const { parseArgs, readSecret, confirmLive, sqlString, runSql } = require('../scripts/auth-cli');

const ACCOUNTS = [
  { id: 'demosuper0001', email: 'demo-super@example.com', name: 'Demo Super Admin', superAdmin: 1, memberships: [] },
  { id: 'demoadmin0001', email: 'demo-admin@example.com', name: 'Demo Admin', superAdmin: 0, memberships: [{ bookId: 'family-budget', role: 'admin' }] }
];

(async () => {
  const remote = Boolean(parseArgs(process.argv.slice(2)).remote);
  const password = await readSecret(`Demo password (min ${MIN_PASSWORD_LENGTH} characters, hidden): `);
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error('Password too short. Nothing was created.');
  if (password !== await readSecret('Repeat password: ')) throw new Error('The passwords do not match. Nothing was created.');
  if (remote) await confirmLive();
  const hash = await hashPassword(password);
  const now = new Date().toISOString();
  for (const a of ACCOUNTS) {
    runSql(`INSERT INTO accounts (id, email, name, password_hash, is_super_admin, memberships, disabled, failed_logins, locked_until, last_login_at, created_at, updated_at) VALUES (${[
      sqlString(a.id), sqlString(a.email), sqlString(a.name), sqlString(hash), a.superAdmin, sqlString(JSON.stringify(a.memberships)), 0, 0, 'NULL', 'NULL', sqlString(now), sqlString(now)].join(', ')});`, { remote });
    console.log(`Created ${a.email} (${remote ? 'LIVE' : 'local'})`);
  }
})().catch(e => { console.error(`Could not create the accounts: ${e.message}`); process.exit(1); });

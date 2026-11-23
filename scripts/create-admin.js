#!/usr/bin/env node
// Creates a super administrator in D1. Local database by default; --remote writes to the live database.
// Usage (the password is typed hidden, never passed as an argument):
//   warden account-create --email you@example.com --name "Your Name"
//   warden account-create -- --remote --email you@example.com --name "Your Name"
const { MIN_PASSWORD_LENGTH } = require('../server/auth/accounts');
const { hashPassword } = require('../server/auth/password');
const { parseArgs, readSecret, confirmLive, sqlString, newAccountId, validEmail, runSql } = require('./auth-cli');

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const remote = Boolean(args.remote);
  const email = String(args.email || '').trim().toLowerCase();
  const name = String(args.name || '').trim();
  const username = String(args.username || (email ? email.split('@')[0].replace(/[^a-z0-9._-]+/g, '-') : '')).trim().toLowerCase();
  if ((!email && !args.username) || !name) {
    console.error('Usage: create-admin.js [--remote] [--username <name>] [--email <email>] --name "<name>"');
    process.exit(2);
  }
  if (email && !validEmail(email)) throw new Error('A valid email address is required');
  if (!/^[a-z0-9][a-z0-9._-]{1,39}$/.test(username)) throw new Error('Username: 2-40 letters, digits, dots, dashes or underscores');

  const password = await readSecret('New password (min 6 characters, hidden): ');
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`The password has ${password.length} characters; at least ${MIN_PASSWORD_LENGTH} are needed. Nothing was created.`);
  }
  const confirm = await readSecret('Repeat password: ');
  if (password !== confirm) throw new Error('The passwords do not match. Nothing was created.');
  if (remote) await confirmLive();

  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  runSql(`INSERT INTO accounts (id, username, email, name, password_hash, is_super_admin, memberships, disabled, failed_logins, locked_until, last_login_at, created_at, updated_at) VALUES (${[
    sqlString(newAccountId()), sqlString(username), email ? sqlString(email) : 'NULL', sqlString(name), sqlString(passwordHash),
    '1', "'[]'", '0', '0', 'NULL', 'NULL', sqlString(now), sqlString(now)
  ].join(', ')});`, { remote });
  console.log(`Super administrator created: ${username} (${remote ? 'LIVE database' : 'local database'})`);
};

main().catch(error => {
  console.error(`Could not create the account: ${error.message}`);
  process.exit(1);
});

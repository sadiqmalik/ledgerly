#!/usr/bin/env node
// Sets a new password for an account in D1, clears any lockout, and signs it out everywhere.
// Local database by default; --remote changes the live database.
// Usage (the password is typed hidden, never passed as an argument):
//   warden account-reset-password --email you@example.com
//   warden account-reset-password -- --remote --email you@example.com
const { MIN_PASSWORD_LENGTH } = require('../server/auth/accounts');
const { hashPassword } = require('../server/auth/password');
const { parseArgs, readSecret, confirmLive, sqlString, validEmail, runSql } = require('./auth-cli');

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const remote = Boolean(args.remote);
  const email = String(args.email || '').trim().toLowerCase();
  if (!email) {
    console.error('Usage: reset-password.js [--remote] --email <email>');
    process.exit(2);
  }
  if (!validEmail(email)) throw new Error('A valid email address is required');

  const found = runSql(`SELECT id FROM accounts WHERE email = ${sqlString(email)}`, { remote, json: true });
  if (found.length === 0) throw new Error('No account with that email. Nothing was changed.');

  const password = await readSecret('New password (min 6 characters, hidden): ');
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`The password has ${password.length} characters; at least ${MIN_PASSWORD_LENGTH} are needed. Nothing was changed.`);
  }
  const confirm = await readSecret('Repeat password: ');
  if (password !== confirm) throw new Error('The passwords do not match. Nothing was changed.');
  if (remote) await confirmLive();

  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  const accountId = sqlString(found[0].id);
  runSql([
    `UPDATE accounts SET password_hash = ${sqlString(passwordHash)}, failed_logins = 0, locked_until = NULL, updated_at = ${sqlString(now)} WHERE id = ${accountId};`,
    `DELETE FROM sessions WHERE account_id = ${accountId};`
  ].join(' '), { remote });
  console.log(`Password reset for ${email}. Existing sessions were signed out (${remote ? 'LIVE database' : 'local database'}).`);
};

main().catch(error => {
  console.error(`Could not reset the password: ${error.message}`);
  process.exit(1);
});

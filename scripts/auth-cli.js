// Shared helpers for the account scripts (create-admin.js, reset-password.js).
// They write to D1 through wrangler: the local database by default, the live one with --remote.
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const parseArgs = argv => {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      args[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    }
  }
  return args;
};

// Piped input is read once and handed out line by line, so several prompts can be answered.
let pipedLines = null;
const readPipedLine = () => new Promise(resolve => {
  const next = () => resolve(pipedLines.length ? pipedLines.shift() : '');
  if (pipedLines) return next();
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { data += chunk; });
  process.stdin.on('end', () => {
    pipedLines = data.split('\n').map(line => line.replace(/\r$/, ''));
    next();
  });
  return undefined;
});

// Reads a line without echoing it. Interactive use is hidden; piped input is read line by line.
const readSecret = async prompt => {
  const stdin = process.stdin;
  process.stdout.write(prompt);
  if (!stdin.isTTY) {
    const line = await readPipedLine();
    process.stdout.write('\n');
    return line;
  }
  return new Promise(resolve => {
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    let value = '';
    const onData = chunk => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          return resolve(value);
        }
        if (ch === '\u0003') {
          stdin.setRawMode(false);
          process.stdout.write('\n');
          process.exit(130);
        }
        if (ch === '\u007f') value = value.slice(0, -1);
        else value += ch;
      }
      return undefined;
    };
    stdin.on('data', onData);
  });
};

// Against the live database the operator types 'live' first, as with warden d1 --remote.
const confirmLive = async () => {
  const answer = await readSecret("This changes the LIVE database (Cloudflare D1, ledger). Type 'live' to continue: ");
  if (answer.trim() !== 'live') throw new Error('aborted; nothing was changed');
};

const sqlString = value => (value === null || value === undefined ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`);
const newAccountId = () => crypto.randomBytes(12).toString('hex');
const validEmail = email => EMAIL_PATTERN.test(email);

// Runs SQL through wrangler. Returns the parsed rows when json is true (for SELECT).
const runSql = (sql, { remote = false, json = false } = {}) => {
  const args = ['wrangler', 'd1', 'execute', 'ledger', remote ? '--remote' : '--local', '--command', sql];
  if (json) args.push('--json');
  const result = spawnSync('npx', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    // wrangler prints its progress and the error on stderr/stdout; keep only the database error line.
    const text = `${result.stderr || ''}${result.stdout || ''}`.replace(/\x1b\[[0-9;]*m/g, '');
    if (/UNIQUE constraint failed/i.test(text)) throw new Error('An account with this email already exists');
    const line = text.split('\n').find(l => /SQLITE|ERROR/.test(l)) || 'wrangler failed';
    throw new Error(line.replace(/^.*ERROR\]?\s*/, '').trim() || 'wrangler failed');
  }
  if (!json) return null;
  const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf('[')));
  return parsed[0].results || [];
};

module.exports = { parseArgs, readSecret, confirmLive, sqlString, newAccountId, validEmail, runSql };

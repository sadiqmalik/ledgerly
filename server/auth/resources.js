// Page-level permissions. Each account or access code has a global allowlist of resources (pages). It is
// independent of book roles: a request needs the book role AND the resource. Super administrators always have
// every resource, so they cannot be locked out. src/auth/resources.mjs mirrors the lists below for the UI
// (test/auth/resources.test.js keeps them in step).
const RESOURCES = Object.freeze(['dashboard', 'ledger', 'reports', 'items', 'projects', 'documents', 'settings', 'loans']);
// What a new access code gets when it is created without an explicit list.
const DEFAULT_CODE_RESOURCES = Object.freeze(['dashboard', 'ledger', 'reports', 'items']);

// Master data (funds, holders, categories, parties) is shared lookup data: it is readable by every page that
// shows money or names (parties also by Documents). Writing it is Settings-only.
const LOOKUP_READERS = Object.freeze(['dashboard', 'ledger', 'reports', 'projects', 'settings']);
const PARTY_READERS = Object.freeze([...LOOKUP_READERS, 'documents']);
// Project id/name/kind only (no financial summaries), so entries, documents and reports can label projects.
const PROJECT_NAME_READERS = Object.freeze(['dashboard', 'ledger', 'reports', 'projects', 'documents']);

const isResource = key => RESOURCES.includes(key);
// Canonical order, no duplicates, unknown keys dropped.
const normalizeResources = list => RESOURCES.filter(key => Array.isArray(list) && list.includes(key));

// The pages an account may use. Unset (null/undefined) means full access for a regular account (existing
// accounts keep working) and the defaults for an access code.
const effectiveResources = account => {
  if (!account) return [];
  if (account.isSuperAdmin) return [...RESOURCES];
  if (Array.isArray(account.resources)) return normalizeResources(account.resources);
  // A present but non-array value is corrupt: grant nothing.
  if (account.resources !== undefined && account.resources !== null) return [];
  return account.accessCode ? [...DEFAULT_CODE_RESOURCES] : [...RESOURCES];
};

const hasResource = (account, key) => effectiveResources(account).includes(key);
const hasAnyResource = (account, keys) => {
  const have = effectiveResources(account);
  return keys.some(key => have.includes(key));
};

// Which resources open a book API call: any one of the returned keys is enough. An empty list means no
// resource can (unknown paths fail closed). null means no resource gate (book-level guards still apply).
// rest is the path after /api/books/:b, e.g. '/entries/abc'.
const requiredResources = (method, rest, query = {}) => {
  const read = method === 'GET' || method === 'HEAD';
  const parts = rest.split('/').filter(Boolean);
  const [head, second] = parts;
  if (!head) return method === 'PUT' ? ['settings'] : null;
  switch (head) {
    case 'summary': return read ? ['dashboard'] : [];
    case 'entries': return read ? ['ledger', ...(query.project ? ['projects'] : [])] : ['ledger', 'projects'];
    case 'transfers': return ['ledger'];
    case 'funds': case 'holders': case 'categories': return read ? [...LOOKUP_READERS] : ['settings'];
    case 'parties': return read ? [...PARTY_READERS] : ['settings'];
    case 'project-names': return read ? [...PROJECT_NAME_READERS] : [];
    case 'projects': return ['projects'];
    case 'years': return parts.length === 1 && read ? ['ledger', 'projects', 'settings'] : ['settings'];
    case 'reports': return second === 'profit' ? ['dashboard', 'reports'] : ['reports'];
    case 'documents': return ['documents'];
    case 'items': case 'item-locations': return ['items'];
    case 'profit':
      if (read) return ['ledger', 'settings'];
      if (second === 'preview' || second === 'fetch-rate') return ['ledger'];
      return second === 'rates' && method === 'PUT' ? ['ledger', 'settings'] : ['settings'];
    case 'appearance': return read ? null : ['settings'];
    case 'entry-counts': return read ? ['settings'] : [];
    case 'export': return ['settings'];
    case 'members': case 'active': return ['settings'];
    default: return [];
  }
};

module.exports = {
  RESOURCES, DEFAULT_CODE_RESOURCES, LOOKUP_READERS, PARTY_READERS, PROJECT_NAME_READERS,
  isResource, normalizeResources, effectiveResources, hasResource, hasAnyResource, requiredResources
};

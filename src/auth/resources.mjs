// Page permissions in the UI. Mirrors server/auth/resources.js (test/auth/resources.test.js checks the lists
// match). The server is what enforces them; this only hides pages and avoids requests it would refuse.
export const RESOURCES = ['dashboard', 'ledger', 'reports', 'items', 'projects', 'documents', 'diary', 'settings', 'loans'];
export const OPT_IN_RESOURCES = ['diary'];
export const DEFAULT_ALL_RESOURCES = RESOURCES.filter(key => !OPT_IN_RESOURCES.includes(key));
// Access codes are view-only, so they never get the Settings page.
export const CODE_RESOURCES = RESOURCES.filter(key => key !== 'settings');
export const DEFAULT_CODE_RESOURCES = ['dashboard', 'ledger', 'reports', 'items'];
export const RESOURCE_LABELS = {
  dashboard: 'Dashboard', ledger: 'Ledger', reports: 'Reports', items: 'Item Vault',
  projects: 'Projects', documents: 'Documents', diary: 'Notebook', settings: 'Settings', loans: 'Loans'
};
export const LOOKUP_READERS = ['dashboard', 'ledger', 'reports', 'projects', 'settings'];
export const PARTY_READERS = [...LOOKUP_READERS, 'documents'];
export const PROJECT_NAME_READERS = ['dashboard', 'ledger', 'reports', 'projects', 'documents', 'diary'];

// Hash route -> the resource that opens it, or null when it is not a real route. Only the root, the single
// pages and /projects/<id> exist (no trailing slash); anything else is unknown.
// /admin is for super administrators (no resource) and is handled by decideRoute.
export const routeResource = route => {
  const [head, id, ...more] = String(route || '/').split('?')[0].replace(/^\//, '').split('/');
  if (!head && id === undefined) return 'dashboard';
  if (head === 'loans') return more.length === 0 && id !== '' ? 'loans' : null;
  if (head === 'projects') return more.length === 0 && id !== '' ? 'projects' : null;
  if (head === 'diary') return more.length <= 1 && id !== '' ? 'diary' : null; // /diary, /diary/<notebook>, /diary/<notebook>/<category>
  if (id !== undefined) return null;
  return ['ledger', 'reports', 'items', 'documents', 'settings'].includes(head) ? head : null;
};
export const isAdminRoute = route => String(route || '').split('?')[0] === '/admin';

export const resourcesOf = account => {
  if (!account) return [];
  if (account.isSuperAdmin) return [...RESOURCES];
  const list = account.accessCode ? CODE_RESOURCES : RESOURCES;
  return Array.isArray(account.resources) ? list.filter(key => account.resources.includes(key)) : [];
};
// The account as seen inside one ledger: its own page list there (if the membership has one) replaces the global list.
export const forBook = (account, bookId) => {
  if (!account || account.isSuperAdmin) return account;
  const m = (account.memberships || []).find(x => x.bookId === bookId);
  return m && Array.isArray(m.resources) ? { ...account, resources: m.resources } : account;
};

export const hasResource = (account, key) => resourcesOf(account).includes(key);
export const hasAnyResource = (account, keys) => keys.some(key => hasResource(account, key));

export const canReadLookups = account => hasAnyResource(account, LOOKUP_READERS);
export const canReadParties = account => hasAnyResource(account, PARTY_READERS);
export const canReadProjectNames = account => hasAnyResource(account, PROJECT_NAME_READERS);
// Closed years: used by the ledger, the project entry form and Settings.
export const canReadYears = account => hasAnyResource(account, ['ledger', 'projects', 'settings']);

// Order of the pages a person lands on when their current route is not allowed.
const LANDING = [['dashboard', '/'], ['ledger', '/ledger'], ['reports', '/reports'], ['items', '/items'],
  ['projects', '/projects'], ['documents', '/documents'], ['diary', '/diary'], ['settings', '/settings'], ['loans', '/loans']];

// Decides what to show for a hash route (path without '#'): { allowed, redirect, none }.
// redirect is a permitted route to use instead; none is true when no page is permitted at all.
export const decideRoute = (route, account) => {
  const key = routeResource(route);
  if (isAdminRoute(route)) {
    return account?.isSuperAdmin ? { allowed: true } : { allowed: false, redirect: firstAllowed(account), none: !firstAllowed(account) };
  }
  if (key && hasResource(account, key)) return { allowed: true };
  const redirect = firstAllowed(account);
  return { allowed: false, redirect, none: redirect === null };
};

export const firstAllowed = account => {
  const hit = LANDING.find(([key]) => hasResource(account, key));
  return hit ? hit[1] : null;
};

// Roles per book. A super administrator has the admin role everywhere.
const RANK = { viewer: 1, editor: 2, admin: 3 };

const roleFor = (account, bookId) => {
  if (account.isSuperAdmin) return 'admin';
  const membership = (account.memberships || []).find(m => m.bookId === bookId);
  return membership ? membership.role : null;
};

const canAccess = (account, bookId, minRole) => {
  const role = roleFor(account, bookId);
  return Boolean(role) && RANK[role] >= RANK[minRole];
};

const visibleBookIds = account => (account.isSuperAdmin ? null : (account.memberships || []).map(m => m.bookId));

// Loan registers: same ranks, separate memberships (accounts.loan_memberships). Super admin is admin everywhere.
const loanRoleFor = (account, registerId) => {
  if (account.isSuperAdmin) return 'admin';
  const membership = (account.loanMemberships || []).find(m => m.registerId === registerId);
  return membership ? membership.role : null;
};

const canAccessLoan = (account, registerId, minRole) => {
  const role = loanRoleFor(account, registerId);
  return Boolean(role) && RANK[role] >= RANK[minRole];
};

// null means every register (super admin).
const visibleLoanIds = account => (account.isSuperAdmin ? null : (account.loanMemberships || []).map(m => m.registerId));

// Which notebooks of a ledger this account may open: { only?: [ids], exclude?: [ids] } or null for every notebook it may see.
// An admin's membership carries notebooksExcluded; a code session carries the combined rule in `notebooks`.
const notebookRuleOf = (account, bookId) => {
  if (account.isSuperAdmin) return null;
  const m = (account.memberships || []).find(x => x.bookId === bookId);
  if (!m) return null;
  if (m.notebooks) return m.notebooks;
  return Array.isArray(m.notebooksExcluded) && m.notebooksExcluded.length ? { exclude: m.notebooksExcluded } : null;
};
const notebookAllowed = (rule, notebookId) => !rule || ((!rule.only || rule.only.includes(notebookId)) && !(rule.exclude || []).includes(notebookId));

module.exports = { notebookRuleOf, notebookAllowed, RANK, roleFor, canAccess, visibleBookIds, loanRoleFor, canAccessLoan, visibleLoanIds };

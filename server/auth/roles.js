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

module.exports = { RANK, roleFor, canAccess, visibleBookIds, loanRoleFor, canAccessLoan, visibleLoanIds };

// Same rules as the server (server/auth/roles.js): a super administrator is an admin everywhere.
const RANK = { viewer: 1, editor: 2, admin: 3 };

export const roleFor = (account, bookId) => {
  if (!account) return null;
  if (account.isSuperAdmin) return 'admin';
  const membership = (account.memberships || []).find(m => m.bookId === bookId);
  return membership ? membership.role : null;
};

export const canAccess = (account, bookId, minRole) => {
  const role = roleFor(account, bookId);
  return Boolean(role) && RANK[role] >= RANK[minRole];
};

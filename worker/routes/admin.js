// Account administration: super administrators only.
const { canManageCodes } = require('../../server/auth/accessCodes');

const registerAdminRoutes = (app, { accountAdmin, auth }) => {
  const account = c => c.get('account');
  // Access codes: super administrators (all) and ledger Admins (only the codes they own, for their own ledgers).
  const requireCodeManager = async (c, next) => (canManageCodes(account(c))
    ? next()
    : c.json({ success: false, error: 'Only a super administrator or a ledger Admin can manage access codes' }, 403));
  const requireSuperAdmin = async (c, next) => (account(c) && account(c).isSuperAdmin
    ? next()
    : c.json({ success: false, error: 'Only a super administrator can manage accounts' }, 403));

  app.get('/api/admin/accounts', requireSuperAdmin, async c => c.json({ success: true, accounts: await accountAdmin.list() }));

  // Access codes: create/reset (the code is returned once), list (never the code), revoke.
  app.get('/api/admin/access-codes', requireCodeManager, async c => c.json({ success: true, accessCodes: await auth.accessCodes.list(account(c)) }));

  app.get('/api/admin/access-codes/:id/reveal', requireSuperAdmin, async c => c.json({
    success: true, code: await auth.accessCodes.reveal(account(c), c.req.param('id'))
  }));

  app.post('/api/admin/access-codes', requireCodeManager, async c => c.json(
    { success: true, accessCode: await auth.accessCodes.create(account(c), c.get('body')) }, 201
  ));

  app.put('/api/admin/access-codes/:id/resources', requireCodeManager, async c => c.json({
    success: true, accessCode: await auth.accessCodes.setResources(account(c), c.req.param('id'), c.get('body'))
  }));

  app.post('/api/admin/access-codes/:id/reset', requireCodeManager, async c => c.json({
    success: true, accessCode: await auth.accessCodes.reset(account(c), c.req.param('id'), c.get('body'))
  }));

  app.post('/api/admin/access-codes/:id/revoke', requireCodeManager, async c => c.json({
    success: true, accessCode: await auth.accessCodes.revoke(account(c), c.req.param('id'))
  }));

  app.post('/api/admin/access-codes/:id/restore', requireCodeManager, async c => c.json({
    success: true, accessCode: await auth.accessCodes.restore(account(c), c.req.param('id'))
  }));

  app.delete('/api/admin/access-codes/:id', requireCodeManager, async c => c.json({
    success: true, deleted: await auth.accessCodes.remove(account(c), c.req.param('id'))
  }));

  app.post('/api/admin/accounts', requireSuperAdmin, async c => c.json(
    { success: true, account: await accountAdmin.create(account(c), c.get('body')) }, 201
  ));

  app.put('/api/admin/accounts/:id/memberships', requireSuperAdmin, async c => c.json({
    success: true, account: await accountAdmin.setMemberships(account(c), c.req.param('id'), c.get('body'))
  }));

  app.put('/api/admin/accounts/:id/loan-memberships', requireSuperAdmin, async c => c.json({
    success: true, account: await accountAdmin.setLoanMemberships(account(c), c.req.param('id'), c.get('body'))
  }));

  app.put('/api/admin/accounts/:id/resources', requireSuperAdmin, async c => c.json({
    success: true, account: await accountAdmin.setResources(account(c), c.req.param('id'), c.get('body'))
  }));

  app.put('/api/admin/accounts/:id/profile', requireSuperAdmin, async c => c.json({
    success: true, account: await accountAdmin.setProfile(account(c), c.req.param('id'), c.get('body'))
  }));

  app.put('/api/admin/accounts/:id/type', requireSuperAdmin, async c => c.json({
    success: true, account: await accountAdmin.setType(account(c), c.req.param('id'), c.get('body'))
  }));

  app.put('/api/admin/accounts/:id/status', requireSuperAdmin, async c => c.json({
    success: true, account: await accountAdmin.setDisabled(account(c), c.req.param('id'), c.get('body'))
  }));

  app.post('/api/admin/accounts/:id/password', requireSuperAdmin, async c => {
    await accountAdmin.resetPassword(account(c), c.req.param('id'), c.get('body'));
    return c.json({ success: true, message: 'Password reset. Their sessions were signed out.' });
  });

  app.delete('/api/admin/accounts/:id', requireSuperAdmin, async c => {
    await accountAdmin.remove(account(c), c.req.param('id'));
    return c.json({ success: true, message: 'Account deleted. Their sessions were signed out.' });
  });
};

module.exports = { registerAdminRoutes };

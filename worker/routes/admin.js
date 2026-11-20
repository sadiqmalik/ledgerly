// Account administration: super administrators only.
const registerAdminRoutes = (app, { accountAdmin, auth }) => {
  const account = c => c.get('account');
  const requireSuperAdmin = async (c, next) => (account(c) && account(c).isSuperAdmin
    ? next()
    : c.json({ success: false, error: 'Only a super administrator can manage accounts' }, 403));

  app.get('/api/admin/accounts', requireSuperAdmin, async c => c.json({ success: true, accounts: await accountAdmin.list() }));

  // Access codes: create/reset (the code is returned once), list (never the code), revoke.
  app.get('/api/admin/access-codes', requireSuperAdmin, async c => c.json({ success: true, accessCodes: await auth.accessCodes.list() }));

  app.post('/api/admin/access-codes', requireSuperAdmin, async c => c.json(
    { success: true, accessCode: await auth.accessCodes.create(account(c), c.get('body')) }, 201
  ));

  app.put('/api/admin/access-codes/:id/resources', requireSuperAdmin, async c => c.json({
    success: true, accessCode: await auth.accessCodes.setResources(account(c), c.req.param('id'), c.get('body'))
  }));

  app.post('/api/admin/access-codes/:id/reset', requireSuperAdmin, async c => c.json({
    success: true, accessCode: await auth.accessCodes.reset(account(c), c.req.param('id'), c.get('body'))
  }));

  app.post('/api/admin/access-codes/:id/revoke', requireSuperAdmin, async c => c.json({
    success: true, accessCode: await auth.accessCodes.revoke(account(c), c.req.param('id'))
  }));

  app.delete('/api/admin/access-codes/:id', requireSuperAdmin, async c => c.json({
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

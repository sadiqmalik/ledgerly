// Sign-in, sign-out, current account, change password.
const { publicAccount } = require('../../server/auth/service');
const { ForbiddenError } = require('../../server/errors');

const registerAuthRoutes = (app, { auth }) => {
  const account = c => c.get('account');

  app.post('/api/auth/login', async c => {
    const body = c.get('body');
    const { sid, account: signed } = await auth.login(body.email, body.password);
    c.header('Set-Cookie', auth.setCookie(sid, auth.idleSeconds));
    return c.json({ success: true, account: publicAccount(signed) });
  });

  // Access code sign-in: viewer access to the books the code names. Guesses are throttled per client.
  app.post('/api/auth/access-code', async c => {
    const clientId = c.req.header('cf-connecting-ip') || 'unknown';
    const { sid, account: signed } = await auth.loginWithCode(c.get('body').code, clientId);
    c.header('Set-Cookie', auth.setCookie(sid, auth.idleSeconds));
    return c.json({ success: true, account: publicAccount(signed) });
  });

  app.post('/api/auth/logout', async c => {
    await auth.logout(auth.readCookie(c.req.header('cookie')));
    c.header('Set-Cookie', auth.clearCookie());
    return c.json({ success: true });
  });

  app.get('/api/auth/me', async c => c.json({ success: true, account: publicAccount(account(c)) }));

  app.post('/api/auth/password', async c => {
    if (account(c).accessCode) throw new ForbiddenError('Access codes have no password to change');
    const { current, new: next } = c.get('body') || {};
    // Checks the current password (rate limited), changes it, and signs out every session.
    const signed = await auth.accounts.authenticate(account(c).email, current);
    await auth.accounts.resetPassword(account(c).email, next);
    const sid = await auth.createSession(signed.id);
    c.header('Set-Cookie', auth.setCookie(sid, auth.idleSeconds));
    return c.json({ success: true, message: 'Password changed. Other sessions were signed out.' });
  });
};

module.exports = { registerAuthRoutes };

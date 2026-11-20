// Cloudflare Worker entry. Serves /api/* from the Hono app (worker/api.js) over D1.
// Static files come from dist/ (wrangler [assets]). The nightly cron backs up every book to R2 (BACKUPS) and purges expired sessions.
import { createApi } from './api.js';
import { createRepo } from '../server/repo/index.js';
import { createAuthService } from '../server/auth/service.js';
import { runNightly } from '../server/backup.js';

// A repository and auth service per request: both are cheap, and the cookie flag depends on the request.
const buildApi = (env, request) => {
  const repo = createRepo(env.DB);
  // Cookies are Secure except over plain http (local development).
  const plainHttp = new URL(request.url).protocol === 'http:' && request.headers.get('x-forwarded-proto') !== 'https';
  const auth = createAuthService(repo.authStore, {
    idleMinutes: Number(env.SESSION_IDLE_MINUTES) || 720,
    absoluteDays: Number(env.SESSION_ABSOLUTE_DAYS) || 7,
    cookieSecure: env.COOKIE_SECURE !== 'false' && !plainHttp
  });
  // Over plain http (wrangler dev) the Vite dev server on :3100 is also an allowed origin, so `npm run dev` works without Warden.
  const allowedOrigin = [env.ALLOWED_ORIGIN || 'https://app.ledgerly.test'];
  if (plainHttp) allowedOrigin.push('http://localhost:3100', 'http://127.0.0.1:3100');
  return createApi({ repo, auth, allowedOrigin, env });
};

export default {
  fetch(request, env, ctx) {
    return buildApi(env, request).fetch(request, env, ctx);
  },
  // Cron "0 2 * * *" (see wrangler.toml). Locally: `wrangler dev --test-scheduled`, then GET /__scheduled.
  scheduled(controller, env, ctx) {
    ctx.waitUntil(runNightly({ repo: createRepo(env.DB), bucket: env.BACKUPS, everyDays: Number(env.BACKUP_EVERY_DAYS) || 10 }));
  }
};

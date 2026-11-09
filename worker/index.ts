import type { Env, ExecutionContext } from './types';
import { handleProxy } from './handlers/proxy';
import { handleLinkPreview } from './handlers/link-preview';
import { handleAuthLogin } from './handlers/auth-login';
import { handleTelegramSync } from './handlers/telegram-sync';

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // API Routing
    if (url.pathname === '/api/proxy' || url.pathname.startsWith('/api/proxy/')) {
      return handleProxy(request, env);
    }

    if (url.pathname === '/api/link-preview' || url.pathname.startsWith('/api/link-preview/')) {
      return handleLinkPreview(request, env);
    }

    if (url.pathname === '/api/auth/login' || url.pathname.startsWith('/api/auth/login/')) {
      return handleAuthLogin(request, env);
    }

    if (url.pathname === '/api/sync-telegram' || url.pathname.startsWith('/api/sync-telegram/')) {
      return handleTelegramSync(request, env);
    }

    // Serve static assets from Next.js export (./out)
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};

/// <reference types="vitest" />

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

function resortFetchProxy(): Plugin {
  const ALLOWED_HOSTS = new Set([
    'www.onthesnow.com',
    // later: 'snocountry.com', 'www.snocountry.com', etc.
  ]);

  async function handler(req: any, res: any) {
    try {
      const urlObj = new URL(req.url, 'http://localhost');
      if (urlObj.pathname !== '/api/fetch') return false;

      const target = urlObj.searchParams.get('url');
      if (!target) {
        res.statusCode = 400;
        res.end('Missing ?url=');
        return true;
      }

      let targetUrl: URL;
      try {
        targetUrl = new URL(target);
      } catch {
        res.statusCode = 400;
        res.end('Invalid url');
        return true;
      }

      if (!['http:', 'https:'].includes(targetUrl.protocol)) {
        res.statusCode = 400;
        res.end('Invalid protocol');
        return true;
      }

      if (!ALLOWED_HOSTS.has(targetUrl.host)) {
        res.statusCode = 403;
        res.end('Host not allowed');
        return true;
      }

      const r = await fetch(targetUrl.toString(), {
        headers: {
          // Some sites are picky; keep it simple
          'User-Agent': 'ski-resort-snow-totals-dev',
          'Accept': 'text/html,*/*',
        },
      });

      const text = await r.text();
      res.statusCode = r.status;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(text);
      return true;
    } catch (e: any) {
      res.statusCode = 500;
      res.end(`Proxy error: ${e?.message ?? String(e)}`);
      return true;
    }
  }

  return {
    name: 'resort-fetch-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const handled = await handler(req, res);
        if (!handled) next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const handled = await handler(req, res);
        if (!handled) next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), resortFetchProxy()],
});


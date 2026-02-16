/// <reference types="vitest" />

import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

function resortFetchProxy(): Plugin {
  const ALLOWED_HOSTS = new Set([
    "www.onthesnow.com",
    "www.patspeak.com",
    "patspeak.com",
    "api.weather.gov",
    "www.weather.gov",
    // later: 'snocountry.com', 'www.snocountry.com', etc.
  ]);

  async function handler(req: any, res: any) {
    try {
      const urlObj = new URL(req.url, "http://localhost");
      if (urlObj.pathname !== "/api/fetch") return false;

      const target = urlObj.searchParams.get("url");
      if (!target) {
        res.statusCode = 400;
        res.end("Missing ?url=");
        return true;
      }

      let targetUrl: URL;

      try {
        targetUrl = new URL(target);
      } catch {
        res.statusCode = 400;
        res.end("Invalid url");
        return true;
      }

      if (!["http:", "https:"].includes(targetUrl.protocol)) {
        res.statusCode = 400;
        res.end("Invalid protocol");
        return true;
      }

      if (!ALLOWED_HOSTS.has(targetUrl.host)) {
        console.log("[proxy] blocked host:", targetUrl.host);
        res.statusCode = 403;
        res.end("Host not allowed");
        return true;
      }

      console.log("[proxy] ->", targetUrl.toString());

      const r = await fetch(targetUrl.toString(), {
        headers: {
          // Use a clean UA for NWS
          "User-Agent": "ski-resort-snow-totals/1.0 (+http://localhost)",
          Accept:
            targetUrl.host === "api.weather.gov"
              ? "application/geo+json"
              : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      // If upstream fails, forward that failure clearly
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        console.log(
          "[proxy] upstream NOT ok",
          r.status,
          r.statusText,
          targetUrl.host,
          body.slice(0, 200),
        );

        res.statusCode = r.status;
        res.setHeader(
          "Content-Type",
          r.headers.get("content-type") ?? "text/plain; charset=utf-8",
        );
        res.end(body);
        return true;
      }

      const ab = await r.arrayBuffer();

      res.statusCode = 200;
      const ct = r.headers.get("content-type");
      if (ct) res.setHeader("Content-Type", ct);

      // Important: convert ArrayBuffer properly for Node
      res.end(Buffer.from(ab));
      return true;
    } catch (e: any) {
      console.log("[proxy] ERROR", e?.stack ?? e);
      res.statusCode = 500;
      res.end(`Proxy error: ${e?.message ?? String(e)}`);
      return true;
    }
  }

  return {
    name: "resort-fetch-proxy",

    configureServer(server) {
      console.log("[resort-fetch-proxy] configureServer ACTIVE");
      server.middlewares.use(async (req, res, next) => {
        const handled = await handler(req, res);
        if (!handled) next();
      });
    },

    configurePreviewServer(server) {
      console.log("[resort-fetch-proxy] configurePreviewServer ACTIVE");
      server.middlewares.use(async (req, res, next) => {
        const handled = await handler(req, res);
        if (!handled) next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), resortFetchProxy()],
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/vendor/**",
      "**/.dd/**",
      "**/ios/**",
      "**/android/**",
    ],
  },
});

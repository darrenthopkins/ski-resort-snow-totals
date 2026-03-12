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

  async function fetchWithRedirectTrace(
    startUrl: string,
    headers: Record<string, string>,
    maxHops = 6,
  ) {
    const chain: Array<{
      url: string;
      status: number;
      location?: string | null;
      contentType?: string | null;
    }> = [];

    let cur = startUrl;

    for (let hop = 0; hop <= maxHops; hop++) {
      const resp = await fetch(cur, { headers, redirect: "manual" });
      const loc = resp.headers.get("location");
      const ct = resp.headers.get("content-type");

      chain.push({
        url: cur,
        status: resp.status,
        location: loc,
        contentType: ct,
      });

      // follow 3xx
      if (resp.status >= 300 && resp.status < 400 && loc) {
        cur = new URL(loc, cur).toString();
        continue;
      }

      return { resp, chain };
    }

    // too many hops: return last attempt
    const resp = await fetch(cur, { headers, redirect: "manual" });
    chain.push({
      url: cur,
      status: resp.status,
      location: resp.headers.get("location"),
      contentType: resp.headers.get("content-type"),
    });
    return { resp, chain };
  }

  async function handler(req: any, res: any) {
    try {
      const urlObj = new URL(req.url, "http://localhost");
      if (urlObj.pathname !== "/api/fetch") return false;

      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return true;
      }

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

      const isOnTheSnow = targetUrl.host === "www.onthesnow.com";
      const isNWS =
        targetUrl.host === "api.weather.gov" ||
        targetUrl.host === "www.weather.gov";

      const headers: Record<string, string> = isNWS
        ? {
            "User-Agent": "ski-resort-snow-totals/1.0 (+http://localhost)",
            Accept: "application/geo+json",
            "Accept-Language": "en-US,en;q=0.9",
          }
        : isOnTheSnow
        ? {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            Referer: "https://www.onthesnow.com/",
            "Upgrade-Insecure-Requests": "1",
          }
        : {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
          };

      const { resp: r, chain } = await fetchWithRedirectTrace(
        targetUrl.toString(),
        headers,
      );

      const finalUrl = chain[chain.length - 1]?.url ?? targetUrl.toString();
      const finalCt = r.headers.get("content-type");

      res.setHeader("x-proxy-upstream-status", String(r.status));
      res.setHeader("x-proxy-final-url", finalUrl);
      res.setHeader("x-proxy-content-type", finalCt ?? "");
      res.setHeader(
        "x-proxy-redirect-chain",
        JSON.stringify(
          chain.map((s) => ({
            status: s.status,
            location: s.location ?? undefined,
          })),
        ),
      );

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
      if (finalCt) res.setHeader("Content-Type", finalCt);
      res.end(Buffer.from(ab));
      return true;
    } catch (e: any) {
      console.log("[proxy] ERROR", e?.stack ?? e);
      res.setHeader("Access-Control-Allow-Origin", "*");
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

import { getOnTheSnowLast48 } from "./resortProviders/onthesnow";
import type { SnowMetrics, SnowService, GetSnowOptions } from "./types";
import { getNext24SnowInches } from "./nwsClient";
import { MockSnowService } from "./mockSnowService";
import type { MetricMeta, MetricStatus, SnowSource } from "./types";

function meta(params: {
  source: SnowSource;
  status: MetricStatus;
  sourceUrl: string;
  updatedAt: string;
  provenance?: Record<string, unknown>;
}): MetricMeta {
  return params;
}

const CACHE_MS = 10 * 60 * 1000; // 10 minutes
const LS_KEY = "srs_snow_cache_v1";

type CacheEntry = { at: number; v: SnowMetrics };
type CacheMap = Record<string, CacheEntry>;

function readCache(): CacheMap {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CacheMap;
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeCache(cache: CacheMap) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

const memCache: CacheMap = readCache();

function isFresh(entry: CacheEntry) {
  return Date.now() - entry.at < CACHE_MS;
}

export class RealSnowService implements SnowService {
  private mock = new MockSnowService();

  async getSnow(options: GetSnowOptions): Promise<Record<string, SnowMetrics>> {
    const out: Record<string, SnowMetrics> = {};

    for (const r of options.resorts) {
      // DEBUG: optional cache bypass
      const noCache = (() => {
        try {
          return localStorage.getItem("srs_debug_nocache") === "1";
        } catch {
          return false;
        }
      })();

      if (!noCache) {
        const cached = memCache[r.id];
        if (cached && isFresh(cached)) {
          console.log(
            "[snow] cache HIT",
            r.id,
            cached.v.last48In,
            cached.v.next24In,
          );
          out[r.id] = cached.v;
          continue;
        }
      } else {
        console.log("[snow] cache BYPASSED for", r.id);
      }

      try {
        const nws = await getNext24SnowInches(r);

        let last48: {
          last48In: number | null;
          updatedAt: string;
          sourceUrl: string;
        } | null = null;
        try {
          last48 = await getOnTheSnowLast48(r);
          console.log(
            "[snow] onthesnow result",
            r.id,
            last48?.last48In,
            last48?.sourceUrl,
          );
        } catch {
          // ignore provider failure
        }

        const v: SnowMetrics = {
          last48In: last48?.last48In ?? null,
          next24In: nws.next24In,

          minTempF: nws.minTempF ?? null,
          maxTempF: nws.maxTempF ?? null,
          maxWindMph: nws.maxWindMph ?? null,

          last48Meta: meta({
            source: "onthesnow",
            status: last48?.last48In == null ? "missing" : "measured",
            sourceUrl: last48?.sourceUrl ?? "",
            updatedAt: last48?.updatedAt ?? new Date().toISOString(),
            provenance:
              last48?.last48In == null ? { reason: "parse_null" } : undefined,
          }),
          next24Meta: meta({
            source: "nws",
            status: nws.next24In == null ? "missing" : "derived",
            sourceUrl: nws.sourceUrl ?? "", // depends on your nwsClient return; add if missing
            updatedAt: nws.updatedAt ?? new Date().toISOString(),
          }),
          minTempMeta: meta({
            source: "nws",
            status: nws.minTempF == null ? "missing" : "derived",
            sourceUrl: nws.sourceUrl ?? "",
            updatedAt: nws.updatedAt ?? new Date().toISOString(),
          }),
        };

        memCache[r.id] = { at: Date.now(), v };
        writeCache(memCache);
        out[r.id] = v;
      } catch {
        const mock = await this.mock.getSnow();
        const mv =
          mock[r.id] ??
          ({
            last48In: null,
            next24In: null,
            updatedAt: "—",
            source: "unknown",
          } as SnowMetrics);

        memCache[r.id] = { at: Date.now(), v: mv };
        writeCache(memCache);
        out[r.id] = mv;
      }
    }

    return out;
  }
}

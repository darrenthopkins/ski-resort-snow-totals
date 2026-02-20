import { getOnTheSnowLast48 } from "./resortProviders/onthesnow";
import type { SnowMetrics, SnowService, GetSnowOptions } from "./types";
import { MockSnowService } from "./mockSnowService";
import type { MetricMeta, MetricStatus, SnowSource } from "./types";
import {
  getNext24SnowInches,
  getWeekSnowDaily,
  getWeekWeatherDaily,
} from "./nwsClient";

function meta(params: {
  source: SnowSource;
  status: MetricStatus;
  sourceUrl: string;
  updatedAt: string;
  provenance?: Record<string, unknown>;
}): MetricMeta {
  return params;
}

function lsFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

const DBG = () => lsFlag("srs_debug"); // master
const DBG_VERBOSE = () => lsFlag("srs_debug_verbose");
const NO_CACHE = () => lsFlag("srs_debug_nocache");

function dlog(...args: any[]) {
  if (DBG()) console.log(...args);
}
function dvlog(...args: any[]) {
  if (DBG() && DBG_VERBOSE()) console.log(...args);
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
const inflightByResort = new Map<string, Promise<SnowMetrics>>();

function isFresh(entry: CacheEntry) {
  return Date.now() - entry.at < CACHE_MS;
}

export class RealSnowService implements SnowService {
  private mock = new MockSnowService();

  async getSnow(options: GetSnowOptions): Promise<Record<string, SnowMetrics>> {
    const out: Record<string, SnowMetrics> = {};

    const nowISO = new Date().toISOString();
    const safeISO = (s?: string | null) =>
      s && !Number.isNaN(new Date(s).getTime()) ? s : nowISO;

    const noCache = (() => {
      try {
        return localStorage.getItem("srs_debug_nocache") === "1";
      } catch {
        return false;
      }
    })();

    for (const r of options.resorts) {
      // ----------------------------
      // 1) Cache
      // ----------------------------
      if (!noCache) {
        const cached = memCache[r.id];
        if (cached && isFresh(cached)) {
          out[r.id] = cached.v;
          continue;
        }
      }

      // ----------------------------
      // 2) In-flight dedupe (per resort)
      // ----------------------------
      if (!("inflightByResort" in globalThis)) {
        (globalThis as any).inflightByResort = new Map<
          string,
          Promise<SnowMetrics>
        >();
      }
      const inflightMap = (globalThis as any).inflightByResort as Map<
        string,
        Promise<SnowMetrics>
      >;

      const existing = inflightMap.get(r.id);
      if (existing) {
        out[r.id] = await existing;
        continue;
      }

      const p = (async (): Promise<SnowMetrics> => {
        try {
          // Fetch in parallel
          const [nws, last48, week, weekWx] = await Promise.all([
            getNext24SnowInches(r),
            getOnTheSnowLast48(r).catch(() => null),
            getWeekSnowDaily(r, 7).catch(() => null),
            getWeekWeatherDaily(r as any, 7).catch(() => null),
          ]);

          const v: SnowMetrics = {
            last48In: last48?.last48In ?? null,
            next24In: nws.next24In,

            minTempF: nws.minTempF ?? null,
            maxTempF: nws.maxTempF ?? null,
            maxWindMph: nws.maxWindMph ?? null,

            weekWeatherDaily: weekWx?.daily,
            weekWeatherMeta: weekWx
              ? meta({
                  source: "nws",
                  status: "derived",
                  sourceUrl: weekWx.sourceUrl ?? "",
                  updatedAt: safeISO(weekWx.updatedAt),
                  provenance: { kind: "forecast_periods_daily_bins", days: 7 },
                })
              : undefined,

            last48Meta: meta({
              source: "onthesnow",
              status: last48?.last48In == null ? "missing" : "measured",
              sourceUrl: last48?.sourceUrl ?? "",
              updatedAt: safeISO(last48?.updatedAt),
              provenance:
                last48?.last48In == null ? { reason: "parse_null" } : undefined,
            }),

            next24Meta: meta({
              source: "nws",
              status: nws.next24In == null ? "missing" : "derived",
              sourceUrl: nws.sourceUrl ?? "",
              updatedAt: safeISO(nws.updatedAt),
              provenance: { kind: "gridpoint" },
            }),

            minTempMeta: meta({
              source: "nws",
              status: nws.minTempF == null ? "missing" : "derived",
              sourceUrl: nws.sourceUrl ?? "",
              updatedAt: safeISO(nws.updatedAt),
            }),

            maxTempMeta: meta({
              source: "nws",
              status: nws.maxTempF == null ? "missing" : "derived",
              sourceUrl: nws.sourceUrl ?? "",
              updatedAt: safeISO(nws.updatedAt),
            }),

            maxWindMeta: meta({
              source: "nws",
              status: nws.maxWindMph == null ? "missing" : "derived",
              sourceUrl: nws.sourceUrl ?? "",
              updatedAt: safeISO(nws.updatedAt),
            }),

            weekSnowDaily: week?.daily,
            weekSnowMeta: week
              ? meta({
                  source: "nws",
                  status: "derived",
                  sourceUrl: week.sourceUrl ?? "",
                  updatedAt: safeISO(week.updatedAt),
                  provenance: { kind: "gridpoint_daily_bins", days: 7 },
                })
              : undefined,
          };
          dvlog("[SRS updatedAt check]", r.id, {
            nws_updatedAt_raw: (nws as any).updatedAt,
            nws_updatedAt_safe: safeISO((nws as any).updatedAt),
            last48_updatedAt_raw: last48?.updatedAt,
            last48_updatedAt_safe: safeISO(last48?.updatedAt),
            v_next24Meta_updatedAt: v.next24Meta?.updatedAt,
            v_last48Meta_updatedAt: v.last48Meta?.updatedAt,
          });

          if (week?.daily?.length) dvlog("[weekbins]", r.id, week.daily);

          memCache[r.id] = { at: Date.now(), v };
          writeCache(memCache);

          return v;
        } catch {
          const mock = await this.mock.getSnow();
          const mv =
            mock[r.id] ??
            ({
              last48In: null,
              next24In: null,
            } as SnowMetrics);

          memCache[r.id] = { at: Date.now(), v: mv };
          writeCache(memCache);

          return mv;
        } finally {
          inflightMap.delete(r.id);
        }
      })();

      inflightMap.set(r.id, p);
      out[r.id] = await p;
    }

    return out;
  }
}

// src/services/snow/realSnowService.ts

import {
  getOnTheSnowLast48,
  getOnTheSnowForecastDaily,
  type OnTheSnowForecastDailyBin,
} from "./resortProviders/onthesnow";
import type { SnowMetrics, SnowService, GetSnowOptions } from "./types";
import { MockSnowService } from "./mockSnowService";
import type { MetricMeta, MetricStatus, SnowSource } from "./types";
import {
  getNext24SnowInches,
  getWeekSnowDaily,
  getWeekWeatherDaily,
} from "./nwsClient";

type DailySnowBin = { dateISO: string; inches: number };

function localNoon(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

function addLocalDays(base: Date, days: number): Date {
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + days,
    12,
    0,
    0,
    0,
  );
}

function toISODateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function zeroSnowWindow(days = 7, now = new Date()): DailySnowBin[] {
  const base = localNoon(now);
  return Array.from({ length: days }, (_, i) => ({
    dateISO: toISODateLocal(addLocalDays(base, i)),
    inches: 0,
  }));
}

function mergeFutureSnowDaily(
  ots: OnTheSnowForecastDailyBin[] | null | undefined,
  nws: DailySnowBin[] | null | undefined,
  days = 7,
  now = new Date(),
): DailySnowBin[] {
  const otsBins = (ots ?? []).filter(
    (bin): bin is OnTheSnowForecastDailyBin =>
      typeof bin?.dateISO === "string" &&
      bin.dateISO.length > 0 &&
      typeof bin.inches === "number" &&
      Number.isFinite(bin.inches),
  );

  const nwsBins = (nws ?? []).filter(
    (bin): bin is DailySnowBin =>
      typeof bin?.dateISO === "string" &&
      bin.dateISO.length > 0 &&
      typeof bin.inches === "number" &&
      Number.isFinite(bin.inches),
  );

  const mergedDates = Array.from(
    new Set([
      ...nwsBins.map((bin) => bin.dateISO),
      ...otsBins.map((bin) => bin.dateISO),
    ]),
  )
    .sort()
    .slice(0, days);

  if (mergedDates.length === 0) {
    return zeroSnowWindow(days, now);
  }

  const map = new Map<string, number>();

  for (const dateISO of mergedDates) {
    map.set(dateISO, 0);
  }

  for (const bin of nwsBins) {
    if (!map.has(bin.dateISO)) continue;
    map.set(bin.dateISO, Math.max(map.get(bin.dateISO) ?? 0, bin.inches));
  }

  for (const bin of otsBins) {
    if (!map.has(bin.dateISO)) continue;
    map.set(bin.dateISO, Math.max(map.get(bin.dateISO) ?? 0, bin.inches));
  }

  return mergedDates.map((dateISO) => ({
    dateISO,
    inches: map.get(dateISO) ?? 0,
  }));
}

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

const NO_CACHE = () => lsFlag("srs_debug_nocache");

const SNOW_DEBUG = import.meta.env.VITE_SNOW_DEBUG === "true";

const dlog = (...args: unknown[]) => {
  if (!SNOW_DEBUG) return;
  console.log(...args);
};

const dvlog = (...args: unknown[]) => {
  if (!SNOW_DEBUG) return;
  console.debug(...args);
};

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

function recentWeekdayLabelToDateISO(
  label: string,
  now = new Date(),
): string | null {
  const map: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };

  const short = label.trim().toLowerCase().slice(0, 3);
  const targetDow = map[short];
  if (targetDow == null) return null;

  const base = localNoon(now);

  for (let back = 0; back < 7; back += 1) {
    const d = addLocalDays(base, -back);
    if (d.getDay() === targetDow) {
      return toISODateLocal(d);
    }
  }

  return null;
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

    const noCache = NO_CACHE();

    for (const r of options.resorts) {
      dlog("[snow] resort start", { id: r.id, name: r.name, noCache });
      // ----------------------------
      // 1) Cache
      // ----------------------------
      if (!noCache) {
        const cached = memCache[r.id];
        if (cached && isFresh(cached)) {
          dlog("[snow] cache hit", { id: r.id, name: r.name });
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
        dlog("[snow] inflight hit", { id: r.id, name: r.name });
        out[r.id] = await existing;
        continue;
      }
      // dlog("[snow] fresh fetch", { id: r.id, name: r.name });
      const p = (async (): Promise<SnowMetrics> => {
        try {
          const [
            otsLast48Result,
            otsForecastDailyResult,
            next24Result,
            nwsWeekSnowDailyResult,
            weekWeatherDailyResult,
          ] = await Promise.allSettled([
            getOnTheSnowLast48(r),
            getOnTheSnowForecastDaily(r, 7),
            getNext24SnowInches(r),
            getWeekSnowDaily(r, 7),
            getWeekWeatherDaily(r, 7),
          ]);

          const otsLast48 =
            otsLast48Result.status === "fulfilled"
              ? otsLast48Result.value
              : null;

          const otsForecastDaily =
            otsForecastDailyResult.status === "fulfilled"
              ? otsForecastDailyResult.value
              : [];

          const next24 =
            next24Result.status === "fulfilled" ? next24Result.value : null;

          const nwsWeekSnowDaily =
            nwsWeekSnowDailyResult.status === "fulfilled"
              ? nwsWeekSnowDailyResult.value
              : null;

          const weekWeatherDaily =
            weekWeatherDailyResult.status === "fulfilled"
              ? weekWeatherDailyResult.value
              : null;

          dlog("[snow source status]", {
            resortId: r.id,
            resortName: r.name,
            otsLast48:
              otsLast48Result.status === "fulfilled"
                ? "ok"
                : String(otsLast48Result.reason),
            otsForecastDaily:
              otsForecastDailyResult.status === "fulfilled"
                ? "ok"
                : String(otsForecastDailyResult.reason),
            next24:
              next24Result.status === "fulfilled"
                ? "ok"
                : String(next24Result.reason),
            nwsWeekSnowDaily:
              nwsWeekSnowDailyResult.status === "fulfilled"
                ? "ok"
                : String(nwsWeekSnowDailyResult.reason),
            weekWeatherDaily:
              weekWeatherDailyResult.status === "fulfilled"
                ? "ok"
                : String(weekWeatherDailyResult.reason),
          });

          const normalizedRecentSnowDaily = otsLast48?.recentDaily
            ? Object.entries(otsLast48.recentDaily)
                .map(([label, inches]) => ({
                  dateISO: recentWeekdayLabelToDateISO(label),
                  label,
                  inches:
                    typeof inches === "number" && Number.isFinite(inches)
                      ? inches
                      : 0,
                }))
                .filter(
                  (
                    d,
                  ): d is { dateISO: string; label: string; inches: number } =>
                    typeof d.dateISO === "string" && d.dateISO.length > 0,
                )
            : undefined;

          const normalizedNwsWeekSnowDaily: DailySnowBin[] = (
            nwsWeekSnowDaily?.daily ?? []
          ).map((d) => ({
            dateISO: d.dateISO,
            inches:
              typeof d.inches === "number" && Number.isFinite(d.inches)
                ? d.inches
                : 0,
          }));

          const mergedWeekSnowDaily = mergeFutureSnowDaily(
            otsForecastDaily,
            normalizedNwsWeekSnowDaily,
            7,
          );

          const weatherDaily = weekWeatherDaily?.daily ?? [];

          const allMinTemps = weatherDaily
            .map((d) => d?.minTempF)
            .filter(
              (n): n is number => typeof n === "number" && Number.isFinite(n),
            );

          const allMaxTemps = weatherDaily
            .map((d) => d?.maxTempF)
            .filter(
              (n): n is number => typeof n === "number" && Number.isFinite(n),
            );

          const allMaxWinds = weatherDaily
            .map((d) => d?.maxWindMph)
            .filter(
              (n): n is number => typeof n === "number" && Number.isFinite(n),
            );

          const weekMinTempF = allMinTemps.length
            ? Math.min(...allMinTemps)
            : null;
          const weekMaxTempF = allMaxTemps.length
            ? Math.max(...allMaxTemps)
            : null;
          const weekMaxWindMph = allMaxWinds.length
            ? Math.max(...allMaxWinds)
            : null;

          const weekSnowSourceUrl =
            nwsWeekSnowDaily?.sourceUrl ?? otsLast48?.sourceUrl ?? "";

          const weekSnowUpdatedAt = safeISO(
            nwsWeekSnowDaily?.updatedAt ?? otsLast48?.updatedAt,
          );

          const next24In =
            typeof next24 === "number" && Number.isFinite(next24)
              ? next24
              : typeof next24?.next24In === "number" &&
                Number.isFinite(next24.next24In)
              ? next24.next24In
              : null;

          const v: SnowMetrics = {
            last48In: otsLast48?.last48In ?? null,
            next24In,

            recentSnowDaily: normalizedRecentSnowDaily,

            minTempF: weekMinTempF,
            maxTempF: weekMaxTempF,
            maxWindMph: weekMaxWindMph,

            weekWeatherDaily: weatherDaily,
            weekWeatherMeta: weekWeatherDaily
              ? meta({
                  source: "nws",
                  status: "derived",
                  sourceUrl: weekWeatherDaily.sourceUrl ?? "",
                  updatedAt: safeISO(weekWeatherDaily.updatedAt),
                  provenance: { kind: "forecast_periods_daily_bins", days: 7 },
                })
              : undefined,

            last48Meta: meta({
              source: "onthesnow",
              status: otsLast48?.last48In == null ? "missing" : "measured",
              sourceUrl: otsLast48?.sourceUrl ?? "",
              updatedAt: safeISO(otsLast48?.updatedAt),
              provenance:
                otsLast48?.last48In == null
                  ? { reason: "parse_null" }
                  : undefined,
            }),

            next24Meta: meta({
              source: "nws",
              status: next24In == null ? "missing" : "derived",
              sourceUrl:
                (typeof next24 === "object" && next24?.sourceUrl) ||
                weekWeatherDaily?.sourceUrl ||
                "",
              updatedAt: safeISO(
                (typeof next24 === "object" && next24?.updatedAt) ||
                  weekWeatherDaily?.updatedAt,
              ),
              provenance: { kind: "gridpoint_next24" },
            }),

            minTempMeta: meta({
              source: "nws",
              status: weekMinTempF == null ? "missing" : "derived",
              sourceUrl: weekWeatherDaily?.sourceUrl ?? "",
              updatedAt: safeISO(weekWeatherDaily?.updatedAt),
            }),

            maxTempMeta: meta({
              source: "nws",
              status: weekMaxTempF == null ? "missing" : "derived",
              sourceUrl: weekWeatherDaily?.sourceUrl ?? "",
              updatedAt: safeISO(weekWeatherDaily?.updatedAt),
            }),

            maxWindMeta: meta({
              source: "nws",
              status: weekMaxWindMph == null ? "missing" : "derived",
              sourceUrl: weekWeatherDaily?.sourceUrl ?? "",
              updatedAt: safeISO(weekWeatherDaily?.updatedAt),
            }),

            weekSnowDaily: mergedWeekSnowDaily,

            weekSnowMeta: meta({
              source: "nws",
              status:
                (otsForecastDaily?.length ?? 0) > 0 ||
                normalizedNwsWeekSnowDaily.length > 0
                  ? "derived"
                  : "missing",
              sourceUrl: weekSnowSourceUrl,
              updatedAt: weekSnowUpdatedAt,
              provenance: {
                kind: "merged_future_daily_bins",
                days: 7,
                merge: "max(onthesnow,nws)",
                otsDays: otsForecastDaily?.length ?? 0,
                nwsDays: normalizedNwsWeekSnowDaily.length,
              },
            }),
          };

          dlog("[snow merge]", {
            resortId: r.id,
            otsForecastDaily,
            nwsWeekSnowDaily,
            mergedWeekSnowDaily,
          });

          dlog("[snow assembly]", {
            resortId: r.id,
            resortName: r.name,
            recentSnowDaily_raw: otsLast48?.recentDaily ?? null,
            recentSnowDaily_final: v.recentSnowDaily ?? null,
            weekSnowDaily_final: v.weekSnowDaily ?? null,
            finalSnowMetrics: r.id === "sunapee" ? v : undefined,
          });

          dvlog("[SRS updatedAt check]", r.id, {
            weekWeather_updatedAt_raw: weekWeatherDaily?.updatedAt,
            weekWeather_updatedAt_safe: safeISO(weekWeatherDaily?.updatedAt),
            last48_updatedAt_raw: otsLast48?.updatedAt,
            last48_updatedAt_safe: safeISO(otsLast48?.updatedAt),
            next24_updatedAt_raw:
              typeof next24 === "object" ? next24?.updatedAt : null,
            next24_updatedAt_safe: safeISO(
              (typeof next24 === "object" && next24?.updatedAt) ||
                weekWeatherDaily?.updatedAt,
            ),
            v_next24Meta_updatedAt: v.next24Meta?.updatedAt,
            v_last48Meta_updatedAt: v.last48Meta?.updatedAt,
          });

          if (mergedWeekSnowDaily?.length) {
            dvlog("[weekbins]", r.id, mergedWeekSnowDaily);
          }
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

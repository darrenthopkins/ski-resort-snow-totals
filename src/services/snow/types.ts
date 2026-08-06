import type { Resort } from "../../data/resorts";

export type SnowDayBucket = {
  label: string;
  inches: number;
};

export type SnowSource =
  | "nws"
  | "nohrsc"
  | "mock"
  | "resort"
  | "onthesnow"
  | "unknown";

export type MetricStatus = "measured" | "derived" | "missing";

export type MetricMeta = {
  source: SnowSource;
  status: MetricStatus;

  // keep your existing fields (still useful UI/debug)
  sourceUrl: string;
  updatedAt: string;

  // NEW: optional metadata
  provenance?: Record<string, unknown>;
};

export type RecentSnowDailyBucket = {
  dateISO: string; // YYYY-MM-DD in resort/local calendar context
  label: string; // e.g. "Wed"
  inches: number;
};

export type WeekSnowDailyBucket = {
  isoDate: string; // YYYY-MM-DD
  label: string; // e.g. "Fri"
  inches: number;
};

export type SnowMetrics = {
  last48In: number | null;
  next24In: number | null;

  // NWS-derived next-24 weather facts for confidence scoring
  minTempF?: number | null;
  maxTempF?: number | null;
  maxWindMph?: number | null;

  last48Meta?: MetricMeta;
  next24Meta?: MetricMeta;

  // Optional: visibility for derived/missing weather inputs too
  minTempMeta?: MetricMeta;
  maxTempMeta?: MetricMeta;
  maxWindMeta?: MetricMeta;

  weekSnowDaily?: Array<{ dateISO: string; inches: number | null }>;
  weekSnowMeta?: MetricMeta;

  weekWeatherDaily?: Array<{
    dateISO: string;
    minTempF: number | null;
    maxTempF: number | null;
    maxWindMph: number | null;
  }>;
  weekWeatherMeta?: MetricMeta;
  recentSnowDaily?: RecentSnowDailyBucket[];
};

export type GetSnowOptions = {
  resorts: Resort[];
  forceRefresh?: boolean;
};

export interface SnowService {
  getSnow(options: GetSnowOptions): Promise<Record<string, SnowMetrics>>;
}

import type { Resort } from "../../data/resorts";

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
};

export type GetSnowOptions = {
  resorts: Resort[];
};

export interface SnowService {
  getSnow(options: GetSnowOptions): Promise<Record<string, SnowMetrics>>;
}

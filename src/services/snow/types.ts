import type { Resort } from "../../data/resorts";

export type SnowSource = "nws" | "mock" | "resort" | "unknown";

export type MetricMeta = {
  source: SnowSource;
  sourceUrl: string;
  updatedAt: string;
};

export type SnowMetrics = {
  last48In: number | null;
  next24In: number | null;

  // NEW: NWS-derived next-24 weather facts for confidence scoring
  minTempF?: number | null;
  maxTempF?: number | null;
  maxWindMph?: number | null;

  last48Meta?: MetricMeta;
  next24Meta?: MetricMeta;
};

export type GetSnowOptions = {
  resorts: Resort[];
};

export interface SnowService {
  getSnow(options: GetSnowOptions): Promise<Record<string, SnowMetrics>>;
}

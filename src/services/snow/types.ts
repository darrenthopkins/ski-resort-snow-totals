import type { Resort } from '../../data/resorts';

export type SnowSource = 'nws' | 'mock' | 'resort' | 'unknown';

export type SnowMetrics = {
  last48In: number | null;
  next24In: number | null;
  updatedAt: string;         // human-friendly
  source: SnowSource;
  sourceUrl?: string;
};

export type GetSnowOptions = {
  resorts: Resort[];
};

export interface SnowService {
  getSnow(options: GetSnowOptions): Promise<Record<string, SnowMetrics>>;
}

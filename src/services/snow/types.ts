import type { Resort } from '../../data/resorts';

export type SnowMetrics = {
  last48In: number | null;
  next24In: number | null;
  updatedAt: string; // human-friendly for now
};

export type SnowRow = {
  resort: Resort;
  miles: number | null;
  snow: SnowMetrics;
};

export type GetSnowOptions = {
  resorts: Resort[];
};

export interface SnowService {
  getSnow(options: GetSnowOptions): Promise<Record<string, SnowMetrics>>;
}

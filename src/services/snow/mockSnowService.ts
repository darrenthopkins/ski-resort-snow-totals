import type { SnowMetrics, SnowService } from './types';

const PLACEHOLDER: Record<string, Omit<SnowMetrics, 'source'>> = {
  waterville: { last48In: 6, next24In: 3, updatedAt: 'just now' },
  gunstock: { last48In: 2, next24In: 1, updatedAt: 'just now' },
  sunapee: { last48In: 4, next24In: 2, updatedAt: 'just now' },
  ragged: { last48In: 8, next24In: 4, updatedAt: 'just now' },
  patspeak: { last48In: 1, next24In: 0, updatedAt: 'just now' },
};

export class MockSnowService implements SnowService {
  async getSnow(): Promise<Record<string, SnowMetrics>> {
    await new Promise((r) => setTimeout(r, 600));
    const out: Record<string, SnowMetrics> = {};
    for (const [id, v] of Object.entries(PLACEHOLDER)) {
      out[id] = { ...v, source: 'mock' };
    }
    return out;
  }
}

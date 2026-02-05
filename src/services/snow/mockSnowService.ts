import type { SnowMetrics, SnowService } from './types';

type MockRow = {
  last48In: number | null;
  next24In: number | null;
};

const PLACEHOLDER: Record<string, MockRow> = {
  waterville: { last48In: 6, next24In: 3 },
  gunstock: { last48In: 2, next24In: 1 },
  sunapee: { last48In: 4, next24In: 2 },
  ragged: { last48In: 8, next24In: 4 },
  patspeak: { last48In: 1, next24In: 0 },
};

export class MockSnowService implements SnowService {
  async getSnow(): Promise<Record<string, SnowMetrics>> {
    await new Promise((r) => setTimeout(r, 200));
    const out: Record<string, SnowMetrics> = {};
    for (const [id, v] of Object.entries(PLACEHOLDER)) {
      out[id] = {
        last48In: v.last48In,
        next24In: v.next24In,
        last48Meta: { source: 'mock', sourceUrl: '', updatedAt: '—' },
        next24Meta: { source: 'mock', sourceUrl: '', updatedAt: '—' },
      };
    }
    return out;
  }
}

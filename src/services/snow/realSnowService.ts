import type { SnowMetrics, SnowService } from './types';
import type { GetSnowOptions } from './types';
import { getNext24SnowInches } from './nwsClient';
import { MockSnowService } from './mockSnowService';

// Simple in-memory cache to avoid hammering NWS while you develop
const CACHE_MS = 10 * 60 * 1000; // 10 minutes
const cache: Record<string, { at: number; v: SnowMetrics }> = {};

export class RealSnowService implements SnowService {
  private mock = new MockSnowService();

  async getSnow(options: GetSnowOptions): Promise<Record<string, SnowMetrics>> {
    const out: Record<string, SnowMetrics> = {};

    for (const r of options.resorts) {
      const cached = cache[r.id];
      if (cached && Date.now() - cached.at < CACHE_MS) {
        out[r.id] = cached.v;
        continue;
      }

      try {
        const nws = await getNext24SnowInches(r);
        const v: SnowMetrics = {
          last48In: null,              // TODO: resort report providers next
          next24In: nws.next24In,
          updatedAt: nws.updatedAt,
          source: 'nws',
          sourceUrl: nws.sourceUrl,
        };
        cache[r.id] = { at: Date.now(), v };
        out[r.id] = v;
      } catch {
        // Fallback to mock (so UI never breaks while we iterate)
        const mock = await this.mock.getSnow({ resorts: [r] });
        const v = mock[r.id] ?? { last48In: null, next24In: null, updatedAt: '—', source: 'unknown' as const };
        out[r.id] = v;
      }
    }

    return out;
  }
}

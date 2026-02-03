import type { SnowMetrics, SnowService, GetSnowOptions } from './types';
import { getNext24SnowInches } from './nwsClient';
import { MockSnowService } from './mockSnowService';

const CACHE_MS = 10 * 60 * 1000; // 10 minutes
const LS_KEY = 'srs_snow_cache_v1';

type CacheEntry = { at: number; v: SnowMetrics };
type CacheMap = Record<string, CacheEntry>;

function readCache(): CacheMap {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CacheMap;

    // basic shape validation
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeCache(cache: CacheMap) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cache));
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }
}

// Module-scoped cache so it survives across service calls during the session
const memCache: CacheMap = readCache();

function isFresh(entry: CacheEntry) {
  return Date.now() - entry.at < CACHE_MS;
}

export class RealSnowService implements SnowService {
  private mock = new MockSnowService();

  async getSnow(options: GetSnowOptions): Promise<Record<string, SnowMetrics>> {
    const out: Record<string, SnowMetrics> = {};

    for (const r of options.resorts) {
      const cached = memCache[r.id];
      if (cached && isFresh(cached)) {
        out[r.id] = cached.v;
        continue;
      }

      try {
        const nws = await getNext24SnowInches(r);

        const v: SnowMetrics = {
          last48In: null, // TODO next: resort report providers
          next24In: nws.next24In,
          updatedAt: nws.updatedAt,
          source: 'nws',
          sourceUrl: nws.sourceUrl,
        };

        memCache[r.id] = { at: Date.now(), v };
        writeCache(memCache);

        out[r.id] = v;
      } catch {
        // Fallback to mock (keeps UI stable during iteration)
        const mock = await this.mock.getSnow({ resorts: [r] });
        const mv =
          mock[r.id] ?? ({ last48In: null, next24In: null, updatedAt: '—', source: 'unknown' } as SnowMetrics);

        memCache[r.id] = { at: Date.now(), v: mv };
        writeCache(memCache);

        out[r.id] = mv;
      }
    }

    return out;
  }
}

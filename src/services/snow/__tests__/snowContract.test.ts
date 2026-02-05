/// <reference types="vitest" />
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { MockSnowService } from '../mockSnowService';
import { RealSnowService } from '../realSnowService';
import { RESORTS, RESORT_PROVIDER_IDS } from '../../../data/resorts';

// --- Mock network/provider dependencies so RealSnowService is deterministic ---
vi.mock('../nwsClient', () => {
  return {
    getNext24SnowInches: vi.fn(async () => ({
      next24In: 1,
      updatedAt: 'TEST-NWS',
      sourceUrl: 'https://example.test/nws',
    })),
  };
});

vi.mock('../resortProviders/onthesnow', () => {
  return {
    getOnTheSnowLast48: vi.fn(async () => ({
      last48In: 2,
      updatedAt: 'TEST-RESORT',
      sourceUrl: 'https://example.test/onthesnow',
    })),
  };
});

function expectMetricMeta(meta: any) {
  expect(meta).toBeTruthy();
  expect(meta).toHaveProperty('source');
  expect(meta).toHaveProperty('sourceUrl');
  expect(meta).toHaveProperty('updatedAt');
  expect(typeof meta.source).toBe('string');
  expect(typeof meta.sourceUrl).toBe('string');
  expect(typeof meta.updatedAt).toBe('string');
}

function expectSnowMetricsShape(v: any) {
  expect(v).toHaveProperty('last48In');
  expect(v).toHaveProperty('next24In');

  expect(v.last48In === null || typeof v.last48In === 'number').toBe(true);
  expect(v.next24In === null || typeof v.next24In === 'number').toBe(true);

  // Meta is optional (e.g., no last48 provider), but if present it must be valid.
  if (v.last48Meta != null) expectMetricMeta(v.last48Meta);
  if (v.next24Meta != null) expectMetricMeta(v.next24Meta);
}

describe('SnowService contract', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('RESORTS ids are unique and non-empty', () => {
    const ids = RESORTS.map(r => r.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach(id => expect(id.trim().length).toBeGreaterThan(0));
  });

  it('RESORT_PROVIDER_IDS only references known resort ids', () => {
    const resortIds = new Set(RESORTS.map(r => r.id));
    for (const p of RESORT_PROVIDER_IDS) {
      expect(resortIds.has(p.id)).toBe(true);
    }
  });

  it('MockSnowService returns SnowMetrics for its keys (and each entry matches shape)', async () => {
    const svc = new MockSnowService();
    const out = await svc.getSnow();

    expect(typeof out).toBe('object');
    for (const [id, v] of Object.entries(out)) {
      expect(typeof id).toBe('string');
      expectSnowMetricsShape(v);
    }
  });

  it('RealSnowService returns SnowMetrics for requested resorts (matches shape)', async () => {
    const svc = new RealSnowService();
    const out = await svc.getSnow({ resorts: RESORTS });

    for (const r of RESORTS) {
      const v = out[r.id];
      expect(v).toBeTruthy();
      expectSnowMetricsShape(v);
    }
  });

  it('RealSnowService caches results (second call returns same next24Meta.updatedAt/sourceUrl)', async () => {
    const svc = new RealSnowService();
    const out1 = await svc.getSnow({ resorts: RESORTS });
    const out2 = await svc.getSnow({ resorts: RESORTS });

    for (const r of RESORTS) {
      expect(out2[r.id].next24Meta?.updatedAt).toBe(out1[r.id].next24Meta?.updatedAt);
      expect(out2[r.id].next24Meta?.sourceUrl).toBe(out1[r.id].next24Meta?.sourceUrl);
    }
  });
});

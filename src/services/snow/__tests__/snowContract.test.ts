//src/services/snow/__tests__/snowContract.test.ts
/// <reference types="vitest" />
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";

import { MockSnowService } from "../mockSnowService";
import { RealSnowService } from "../realSnowService";
import { RESORTS, RESORT_PROVIDER_IDS } from "../../../data/resorts";

// --- Mock network/provider dependencies so RealSnowService is deterministic ---
vi.mock("../nwsClient", () => {
  return {
    getNext24SnowInches: vi.fn(async () => 1),
    getWeekSnowDaily: vi.fn(async () => ({
      daily: [
        { dateISO: "2026-03-09", inches: 0 },
        { dateISO: "2026-03-10", inches: 0 },
        { dateISO: "2026-03-11", inches: 1 },
        { dateISO: "2026-03-12", inches: 0 },
        { dateISO: "2026-03-13", inches: 2 },
        { dateISO: "2026-03-14", inches: 0 },
        { dateISO: "2026-03-15", inches: 0 },
      ],
      updatedAt: "2026-03-09T12:00:00.000Z",
      sourceUrl: "https://example.test/nws-grid-snow",
    })),
    getWeekWeatherDaily: vi.fn(async () => ({
      daily: [
        { dateISO: "2026-03-09", minTempF: 18, maxTempF: 30, maxWindMph: 10 },
        { dateISO: "2026-03-10", minTempF: 20, maxTempF: 32, maxWindMph: 12 },
        { dateISO: "2026-03-11", minTempF: 16, maxTempF: 28, maxWindMph: 15 },
      ],
      updatedAt: "2026-03-09T12:00:00.000Z",
      sourceUrl: "https://example.test/nws-forecast",
    })),
  };
});

vi.mock("../resortProviders/onthesnow", () => {
  return {
    getOnTheSnowLast48: vi.fn(async () => ({
      last48In: 2,
      updatedAt: "2026-03-09T12:00:00.000Z",
      sourceUrl: "https://example.test/onthesnow",
      recentDaily: {
        Mon: 1,
        Tue: 1,
      },
    })),
    getOnTheSnowForecastDaily: vi.fn(async () => [
      { dateISO: "2026-03-09", inches: 0, label: "Mon" },
      { dateISO: "2026-03-10", inches: 0, label: "Tue" },
      { dateISO: "2026-03-11", inches: 0, label: "Wed" },
      { dateISO: "2026-03-12", inches: 3, label: "Thu" },
      { dateISO: "2026-03-13", inches: 1, label: "Fri" },
      { dateISO: "2026-03-14", inches: 0, label: "Sat" },
      { dateISO: "2026-03-15", inches: 0, label: "Sun" },
    ]),
  };
});

function expectMetricMeta(meta: any) {
  expect(meta).toBeTruthy();
  expect(meta).toHaveProperty("source");
  expect(meta).toHaveProperty("sourceUrl");
  expect(meta).toHaveProperty("updatedAt");
  expect(typeof meta.source).toBe("string");
  expect(typeof meta.sourceUrl).toBe("string");
  expect(typeof meta.updatedAt).toBe("string");
}

function expectSnowMetricsShape(v: any) {
  expect(v).toHaveProperty("last48In");
  expect(v).toHaveProperty("next24In");

  expect(v.last48In === null || typeof v.last48In === "number").toBe(true);
  expect(v.next24In === null || typeof v.next24In === "number").toBe(true);

  if (v.recentSnowDaily != null) {
    expect(Array.isArray(v.recentSnowDaily)).toBe(true);
    for (const row of v.recentSnowDaily) {
      expect(typeof row.dateISO).toBe("string");
      expect(typeof row.inches).toBe("number");
    }
  }

  if (v.weekSnowDaily != null) {
    expect(Array.isArray(v.weekSnowDaily)).toBe(true);
    for (const row of v.weekSnowDaily) {
      expect(typeof row.dateISO).toBe("string");
      expect(typeof row.inches).toBe("number");
    }
  }

  if (v.weekWeatherDaily != null) {
    expect(Array.isArray(v.weekWeatherDaily)).toBe(true);
  }

  if (v.last48Meta != null) expectMetricMeta(v.last48Meta);
  if (v.next24Meta != null) expectMetricMeta(v.next24Meta);
  if (v.weekSnowMeta != null) expectMetricMeta(v.weekSnowMeta);
  if (v.weekWeatherMeta != null) expectMetricMeta(v.weekWeatherMeta);
}

describe("SnowService contract", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("srs_debug_nocache", "1");
  });

  it("RESORTS ids are unique and non-empty", () => {
    const ids = RESORTS.map((r) => r.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id.trim().length).toBeGreaterThan(0));
  });

  it("RESORT_PROVIDER_IDS only references known resort ids", () => {
    const resortIds = new Set(RESORTS.map((r) => r.id));
    for (const p of RESORT_PROVIDER_IDS) {
      expect(resortIds.has(p.id)).toBe(true);
    }
  });

  it("MockSnowService returns SnowMetrics for its keys (and each entry matches shape)", async () => {
    const svc = new MockSnowService();
    const out = await svc.getSnow();

    expect(typeof out).toBe("object");
    for (const [id, v] of Object.entries(out)) {
      expect(typeof id).toBe("string");
      expectSnowMetricsShape(v);
    }
  });

  it("RealSnowService returns SnowMetrics for requested resorts (matches shape)", async () => {
    const svc = new RealSnowService();
    const out = await svc.getSnow({ resorts: RESORTS });

    for (const r of RESORTS) {
      const v = out[r.id];
      expect(v).toBeTruthy();
      expectSnowMetricsShape(v);
    }
  }, 15000);

  it("RealSnowService caches results (second call returns same next24Meta.updatedAt/sourceUrl)", async () => {
    const svc = new RealSnowService();
    const out1 = await svc.getSnow({ resorts: RESORTS });
    const out2 = await svc.getSnow({ resorts: RESORTS });

    for (const r of RESORTS) {
      expect(out2[r.id].next24Meta?.updatedAt).toBe(
        out1[r.id].next24Meta?.updatedAt,
      );
      expect(out2[r.id].next24Meta?.sourceUrl).toBe(
        out1[r.id].next24Meta?.sourceUrl,
      );
    }
  });

  it("RealSnowService uses merged future snowfall bins with max(OnTheSnow, NWS)", async () => {
    const svc = new RealSnowService();
    const out = await svc.getSnow({ resorts: [RESORTS[0]] });

    const first = out[RESORTS[0].id];
    expect(first).toBeTruthy();
    expect(first.weekSnowDaily).toBeTruthy();

    const byDate = new Map(
      (first.weekSnowDaily ?? []).map((row: any) => [row.dateISO, row.inches]),
    );

    console.log(
      "weekSnowDaily",
      first.weekSnowDaily?.map((d) => `${d.dateISO}:${d.inches}`),
    );
    expect(byDate.get("2026-03-12")).toBe(3); // OTS beats NWS 0
    expect(byDate.get("2026-03-13")).toBe(2); // NWS beats OTS 1
    expect(first.next24In).toBe(1);
    expect(first.last48In).toBe(2);
  });
});

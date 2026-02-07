import { describe, it, expect } from "vitest";
import { MockSnowService } from "../services/snow/mockSnowService";
import { RESORTS } from "../data/resorts";
import { snowMetricsToCandidates, isoDateIsWeekend } from "./snowMetricsAdapter";

describe("isoDateIsWeekend", () => {
  it("identifies weekends deterministically", () => {
    expect(isoDateIsWeekend("2026-02-21")).toBe(true);  // Sat
    expect(isoDateIsWeekend("2026-02-22")).toBe(true);  // Sun
    expect(isoDateIsWeekend("2026-02-16")).toBe(false); // Mon
  });
});

describe("snowMetricsToCandidates", () => {
  it("maps SnowService output to ResortDayCandidate[] with deterministic DayFacts", async () => {
    const svc = new MockSnowService();
    const metrics = await svc.getSnow();

    const dateISO = "2026-02-16"; // Mon (weekday)
    const candidates = snowMetricsToCandidates({
      resorts: RESORTS,
      metricsByResortId: metrics,
      dateISO,
    });

    expect(candidates.length).toBe(RESORTS.length);

    // Each resort should produce a candidate with same date and weekday flag
    for (const c of candidates) {
      expect(c.dateISO).toBe(dateISO);
      expect(c.facts.isWeekend).toBe(false);
      expect(typeof c.resortId).toBe("string");
      expect(typeof c.resortName).toBe("string");
      expect(typeof c.facts.newSnowInches).toBe("number");
    }

    // Spot check ragged from mock: last48=8, next24=4 => estLast24=4, newSnow=8
    const ragged = candidates.find((c) => c.resortId === "ragged");
    expect(ragged).toBeTruthy();
    expect(ragged!.facts.newSnowInches).toBe(8);
  });

  it("sets isWeekend=true for weekend dates", async () => {
    const svc = new MockSnowService();
    const metrics = await svc.getSnow();

    const dateISO = "2026-02-21"; // Sat
    const candidates = snowMetricsToCandidates({
      resorts: RESORTS,
      metricsByResortId: metrics,
      dateISO,
    });

    expect(candidates[0].facts.isWeekend).toBe(true);
  });
});

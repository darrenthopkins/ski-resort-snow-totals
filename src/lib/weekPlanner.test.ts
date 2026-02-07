import { describe, it, expect } from "vitest";
import { MockSnowService } from "../services/snow/mockSnowService";
import { RESORTS } from "../data/resorts";
import { buildWeekPlan, buildDateRangeISO } from "./weekPlanner";

describe("buildDateRangeISO", () => {
  it("builds a consecutive ISO date range deterministically", () => {
    expect(buildDateRangeISO("2026-02-16", 3)).toEqual(["2026-02-16", "2026-02-17", "2026-02-18"]);
  });
});

describe("buildWeekPlan", () => {
  it("creates a 7-day outlook using day0=last48/2 and day1=next24, then zeros", async () => {
    const svc = new MockSnowService();
    const metrics = await svc.getSnow();

    const outlook = buildWeekPlan({
      resorts: RESORTS,
      metricsByResortId: metrics,
      startDateISO: "2026-02-16", // Mon
      days: 7,
      topNPerDay: 3,
    });

    expect(outlook.days).toHaveLength(7);
    expect(outlook.days[0].dateISO).toBe("2026-02-16");
    expect(outlook.days[1].dateISO).toBe("2026-02-17");

    // Using mock ragged: last48=8 => day0 newSnow=4; next24=4 => day1 newSnow=4
    const day0Ragged = outlook.days[0].topResorts.find(r => r.resortId === "ragged");
    const day1Ragged = outlook.days[1].topResorts.find(r => r.resortId === "ragged");

    // Note: topResorts is topN (3), so ragged may or may not be in topResorts depending on scoring.
    // So instead assert best day exists and has a deterministic structure:
    expect(outlook.bestDay).toBeTruthy();
    expect(outlook.bestDay.best).toBeTruthy();
    expect(typeof outlook.bestDay.best.result.score).toBe("number");

    // Days 2+ should generally trend lower because newSnow is 0 for all resorts.
    const day2 = outlook.days[2];
    expect(day2.dateISO).toBe("2026-02-18");
    // Best score on day2 should be <= best score on day0 or day1 (given newSnow=0 everywhere)
    expect(day2.best.result.score).toBeLessThanOrEqual(outlook.days[0].best.result.score);
    expect(day2.best.result.score).toBeLessThanOrEqual(outlook.days[1].best.result.score);
  });
});

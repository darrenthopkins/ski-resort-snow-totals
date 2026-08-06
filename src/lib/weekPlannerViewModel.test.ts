import { describe, it, expect } from "vitest";

import { RESORTS } from "../data/resorts";
import { MockSnowService } from "../services/snow/mockSnowService";
import { buildWeekPlan } from "./weekPlanner";
import { buildWeekPlanViewModel } from "./weekPlannerViewModel";

describe("buildWeekPlanViewModel", () => {
  it("produces a UI-ready view model with summary + per-day picks", async () => {
    const svc = new MockSnowService();
    const metrics = await svc.getSnow();

    const outlook = buildWeekPlan({
      resorts: RESORTS,
      metricsByResortId: metrics,
      startDateISO: "2026-02-16",
      days: 7,
      topNPerDay: 3,
      driveMilesByResortId: {
        patspeak: 35,
        gunstock: 90,
        sunapee: 75,
        ragged: 65,
        waterville: 105,
      },
    });

    const vm = buildWeekPlanViewModel({
      outlook,
      resorts: RESORTS,
      driveMilesByResortId: {
        patspeak: 35,
        gunstock: 90,
        sunapee: 75,
        ragged: 65,
        waterville: 105,
      },
    });

    // Decision contract (single UI boundary)
    expect(vm.summary.decision).toBeTruthy();

    const decision = vm.summary.decision;

    // decision.picks: 1–2 items with correct shape
    expect(Array.isArray(decision.picks)).toBe(true);
    expect(decision.picks.length).toBeGreaterThanOrEqual(1);
    expect(decision.picks.length).toBeLessThanOrEqual(2);

    for (const p of decision.picks) {
      expect(p.dateISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof p.resortId).toBe("string");
      expect(typeof p.resortName).toBe("string");
      expect(["green", "yellow", "red"]).toContain(p.label);
      expect(typeof p.score).toBe("number");
    }

    // decision.window should reflect the pick date range (not a single bestISO)
    expect(decision.window.startISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(decision.window.endISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof decision.window.label).toBe("string");
    expect(decision.window.label.length).toBeGreaterThan(0);

    const pickISOs = decision.picks.map((p) => p.dateISO).sort();
    expect(decision.window.startISO).toBe(pickISOs[0]);
    expect(decision.window.endISO).toBe(pickISOs[pickISOs.length - 1]);

    // While bestWindow still exists, it must match the decision window
    expect(vm.summary.bestWindow).toEqual(decision.window);

    // decision.why: bullet-safe (max 3) and non-empty strings
    expect(Array.isArray(decision.why)).toBe(true);
    expect(decision.why.length).toBeGreaterThan(0);
    expect(decision.why.length).toBeLessThanOrEqual(3);
    for (const b of decision.why) {
      expect(typeof b).toBe("string");
      expect(b.trim().length).toBeGreaterThan(0);
    }

    // Summary contract
    expect(vm.summary.bestWindow.startISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    expect(vm.summary.topPicks.length).toBeGreaterThanOrEqual(1);
    expect(vm.summary.topPicks.length).toBeLessThanOrEqual(2);
    expect(typeof vm.summary.topPicks[0].dateISO).toBe("string");
    expect(typeof vm.summary.topPicks[0].resortName).toBe("string");
    expect(vm.summary.bestWindow.endISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof vm.summary.narrative).toBe("string");
    expect(vm.summary.narrative.length).toBeGreaterThan(0);

    expect(typeof vm.summary.bestOverallResort.id).toBe("string");
    expect(typeof vm.summary.bestOverallResort.name).toBe("string");
    expect(typeof vm.summary.backupResort.id).toBe("string");
    expect(typeof vm.summary.backupResort.name).toBe("string");
    expect(typeof vm.summary.backupResort.reason).toBe("string");

    // Days contract
    expect(vm.days.length).toBe(7);
    for (const d of vm.days) {
      expect(d.dateISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(["green", "yellow", "red"]).toContain(d.label);
      expect(typeof d.topPick.resortId).toBe("string");
      expect(typeof d.topPick.resortName).toBe("string");
      expect(typeof d.topPick.score).toBe("number");
      expect(["green", "yellow", "red"]).toContain(d.topPick.label);
      expect(Array.isArray(d.runnersUp)).toBe(true);
      expect(d.runnersUp.length).toBeLessThanOrEqual(2);
      expect(Array.isArray(d.bullets)).toBe(true);
      expect(d.bullets.length).toBeLessThanOrEqual(3);
    }

    // Resorts contract
    expect(vm.resorts.length).toBeGreaterThan(0);
    for (const r of vm.resorts) {
      expect(typeof r.resortId).toBe("string");
      expect(typeof r.resortName).toBe("string");
      expect(["steady", "peaky", "skip"]).toContain(r.weekTag);
    }
  });

  it("does not throw when geolocation leaves no resorts in radius", async () => {
    const svc = new MockSnowService();
    const metrics = await svc.getSnow();
    const outlook = buildWeekPlan({
      resorts: RESORTS,
      metricsByResortId: metrics,
      startDateISO: "2026-02-16",
      days: 7,
      topNPerDay: 3,
    });

    const vm = buildWeekPlanViewModel({
      outlook,
      resorts: [],
      driveMilesByResortId: {},
    });

    expect(vm.summary.backupResort.reason).toBe("No in-radius backup option");
    expect(vm.summary.backupResort.id).toBe(vm.summary.bestOverallResort.id);
  });
});

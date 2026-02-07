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

    // Summary contract
    expect(vm.summary.bestWindow.startISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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
      expect(d.bullets.length).toBeGreaterThan(0);
    }

    // Resorts contract
    expect(vm.resorts.length).toBeGreaterThan(0);
    for (const r of vm.resorts) {
      expect(typeof r.resortId).toBe("string");
      expect(typeof r.resortName).toBe("string");
      expect(["steady", "peaky", "skip"]).toContain(r.weekTag);
    }
  });
});

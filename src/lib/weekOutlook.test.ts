import { describe, it, expect } from "vitest";
import { buildWeekOutlook, type ResortDayCandidate } from "./weekOutlook";
import type { DayFacts } from "./confidence";

function facts(overrides: Partial<DayFacts> = {}): DayFacts {
  return {
    newSnowInches: 0,
    baseDepthInches: 30,
    minTempF: 15,
    maxTempF: 28,
    maxWindMph: 8,
    isWeekend: false,
    ...overrides,
  };
}

describe("buildWeekOutlook", () => {
  it("groups by date, ranks resorts per day, and selects best day across window", () => {
    const input: ResortDayCandidate[] = [
      // 2026-02-16 (Mon) - strong day at Resort A
      {
        resortId: "a",
        resortName: "Resort A",
        dateISO: "2026-02-16",
        facts: facts({ newSnowInches: 8, baseDepthInches: 45, maxTempF: 28, maxWindMph: 8, isWeekend: false }),
      },
      {
        resortId: "b",
        resortName: "Resort B",
        dateISO: "2026-02-16",
        facts: facts({ newSnowInches: 2, baseDepthInches: 30, maxTempF: 28, maxWindMph: 8, isWeekend: false }),
      },

      // 2026-02-17 (Tue) - decent day at Resort C, but not as good as Monday
      {
        resortId: "c",
        resortName: "Resort C",
        dateISO: "2026-02-17",
        facts: facts({ newSnowInches: 5, baseDepthInches: 32, maxTempF: 36, maxWindMph: 18, isWeekend: false }),
      },

      // 2026-02-21 (Sat) - weekend + warm + windy (bad)
      {
        resortId: "d",
        resortName: "Resort D",
        dateISO: "2026-02-21",
        facts: facts({ newSnowInches: 0.5, baseDepthInches: 25, maxTempF: 42, maxWindMph: 35, isWeekend: true }),
      },
    ];

    const outlook = buildWeekOutlook(input, 2);

    // Dates sorted
    expect(outlook.days.map((d) => d.dateISO)).toEqual(["2026-02-16", "2026-02-17", "2026-02-21"]);

    // 2 resorts on 2/16 => topResorts length 2
    const day1 = outlook.days[0];
    expect(day1.topResorts).toHaveLength(2);

    // Best resort on 2/16 should be Resort A (100)
    expect(day1.best.resortName).toBe("Resort A");
    expect(day1.best.result.label).toBe("green");
    expect(day1.best.result.score).toBe(100);

    // 2/17 should be yellow (62) for Resort C
    const day2 = outlook.days[1];
    expect(day2.best.resortName).toBe("Resort C");
    expect(day2.best.result.label).toBe("yellow");
    expect(day2.best.result.score).toBe(62);

    // Overall best day across window should be 2/16
    expect(outlook.bestDay.dateISO).toBe("2026-02-16");
    expect(outlook.bestDay.best.resortName).toBe("Resort A");
  });

  it("throws on empty input", () => {
    expect(() => buildWeekOutlook([])).toThrow(/non-empty/);
  });

  it("uses stable resort tie-breakers (name asc) when scores equal", () => {
    const sameFacts = facts({ newSnowInches: 2, baseDepthInches: 30, maxTempF: 28, maxWindMph: 8, isWeekend: false });

    const input: ResortDayCandidate[] = [
      { resortId: "x", resortName: "Beta",  dateISO: "2026-02-18", facts: sameFacts },
      { resortId: "y", resortName: "Alpha", dateISO: "2026-02-18", facts: sameFacts },
    ];

    const outlook = buildWeekOutlook(input, 2);
    expect(outlook.days[0].best.resortName).toBe("Alpha"); // name asc tie-breaker
  });
});

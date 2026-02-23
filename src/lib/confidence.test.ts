import { describe, it, expect } from "vitest";
import { calculateConfidence, type DayFacts } from "./confidence";

function baseFacts(overrides: Partial<DayFacts> = {}): DayFacts {
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

describe("calculateConfidence", () => {
  it("returns green for a strong weekday day", () => {
    const result = calculateConfidence(
      baseFacts({
        newSnowInches: 8,
        baseDepthInches: 45,
        maxTempF: 28,
        maxWindMph: 8,
        isWeekend: false,
      }),
    );

    expect(result.score).toBe(100); // 20 + 50 + 20 + 10 = 100
    expect(result.label).toBe("green");
  });

  it("returns yellow for a decent weekday day with caveats", () => {
    const result = calculateConfidence(
      baseFacts({
        newSnowInches: 5, // 38
        baseDepthInches: 32, // 14
        maxTempF: 36, // -5
        maxWindMph: 18, // -5
        isWeekend: false, // 0
      }),
    );

    expect(result.score).toBe(62); // 20 + 38 + 14 - 5 - 5 = 62
    expect(result.label).toBe("green");
  });

  it("returns red for a warm, windy weekend with little new snow", () => {
    const result = calculateConfidence(
      baseFacts({
        newSnowInches: 0.5, // 10
        baseDepthInches: 25, // 7
        maxTempF: 42, // -20
        maxWindMph: 35, // -20
        isWeekend: true, // -15
      }),
    );

    expect(result.score).toBe(0); // clamps
    expect(result.label).toBe("red");
  });

  it("applies a drive penalty when driveMiles is provided", () => {
    const near = calculateConfidence(
      baseFacts({
        newSnowInches: 5,
        baseDepthInches: 32,
        maxTempF: 28,
        maxWindMph: 8,
        driveMiles: 47,
      }),
    );
    const far = calculateConfidence(
      baseFacts({
        newSnowInches: 5,
        baseDepthInches: 32,
        maxTempF: 28,
        maxWindMph: 8,
        driveMiles: 90,
      }),
    );

    // same conditions except drive distance => far should score lower
    expect(far.score).toBeLessThan(near.score);
  });

  it("clamps score to [0, 100] even with odd inputs", () => {
    const veryBad = calculateConfidence(
      baseFacts({
        newSnowInches: -10,
        baseDepthInches: -1,
        maxTempF: 60,
        maxWindMph: 200,
        isWeekend: true,
      }),
    );
    expect(veryBad.score).toBeGreaterThanOrEqual(0);
    expect(veryBad.score).toBeLessThanOrEqual(100);

    const veryGood = calculateConfidence(
      baseFacts({
        newSnowInches: 50,
        baseDepthInches: 100,
        maxTempF: 25,
        maxWindMph: 0,
        isWeekend: false,
      }),
    );
    expect(veryGood.score).toBe(100);
    expect(veryGood.label).toBe("green");
  });

  it("scores differently when only maxWindMph differs", () => {
    const calm = baseFacts({
      newSnowInches: 2,
      baseDepthInches: 30,
      maxTempF: 28,
      maxWindMph: 5,
      driveMiles: 60,
    });
    const windy = baseFacts({
      newSnowInches: 2,
      baseDepthInches: 30,
      maxTempF: 28,
      maxWindMph: 35,
      driveMiles: 60,
    });

    const a = calculateConfidence(calm);
    const b = calculateConfidence(windy);

    expect(a.score).toBeGreaterThan(b.score);
  });
  it('applies storm floor: >=6" cannot be red; >=8" is at least green', () => {
    // Force "bad" conditions that would normally go red
    const badBase = baseFacts({
      baseDepthInches: 5,
      maxTempF: 60,
      maxWindMph: 200,
      driveMiles: 200,
      newSnowInches: 0,
    });

    const baseline = calculateConfidence(badBase);
    expect(baseline.label).toBe("red");

    const six = calculateConfidence({ ...badBase, newSnowInches: 6 });
    expect(six.label).not.toBe("red");

    const eight = calculateConfidence({ ...badBase, newSnowInches: 8 });
    expect(eight.label).toBe("green");
  });
  it("drive penalty is smooth (no cliffs)", () => {
    const f = (miles: number) =>
      calculateConfidence(
        baseFacts({
          newSnowInches: 2,
          baseDepthInches: 30,
          maxTempF: 28,
          maxWindMph: 8,
          driveMiles: miles,
        }),
      ).score;

    const s49 = f(49);
    const s51 = f(51);
    const s79 = f(79);
    const s81 = f(81);

    // still monotonic worse as distance increases
    expect(s49).toBeGreaterThanOrEqual(s51);
    expect(s79).toBeGreaterThanOrEqual(s81);

    // no huge discontinuity right at boundaries
    expect(Math.abs(s49 - s51)).toBeLessThanOrEqual(3);
    expect(Math.abs(s79 - s81)).toBeLessThanOrEqual(3);
  });

  it("changes score when only minTempF/maxWindMph change within the same maxTemp bucket", () => {
    const dayColdAM = baseFacts({
      newSnowInches: 0,
      baseDepthInches: 24,
      minTempF: 8,
      maxTempF: 29,
      maxWindMph: 10,
      isWeekend: false,
      driveMiles: 60,
    });

    const dayMildAM = baseFacts({
      newSnowInches: 0,
      baseDepthInches: 24,
      minTempF: 26,
      maxTempF: 32,
      maxWindMph: 5,
      isWeekend: false,
      driveMiles: 60,
    });

    const a = calculateConfidence(dayColdAM);
    const b = calculateConfidence(dayMildAM);

    expect(b.score).toBeGreaterThan(a.score);
  });
  it('storm floor: 5" is green even with thin base', () => {
    const f = baseFacts({
      newSnowInches: 5,
      baseDepthInches: 10, // thin base
      minTempF: 10,
      maxTempF: 28,
      maxWindMph: 15,
      isWeekend: false,
      driveMiles: 60,
    });

    expect(calculateConfidence(f).label).toBe("green");
  });
  it('storm floor: >=2" new snow cannot be red (skip)', () => {
    const f = baseFacts({
      newSnowInches: 2.1,
      baseDepthInches: 10,
      minTempF: 14,
      maxTempF: 30,
      maxWindMph: 5,
      isWeekend: true,
      driveMiles: 89,
    });

    const r = calculateConfidence(f);
    expect(r.label).not.toBe("red");
  });
});

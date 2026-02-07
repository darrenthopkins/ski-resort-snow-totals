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
      })
    );

    expect(result.score).toBe(100); // 20 + 50 + 20 + 10 = 100
    expect(result.label).toBe("green");
  });

  it("returns yellow for a decent weekday day with caveats", () => {
    const result = calculateConfidence(
      baseFacts({
        newSnowInches: 5,        // 38
        baseDepthInches: 32,     // 14
        maxTempF: 36,            // -5
        maxWindMph: 18,          // -5
        isWeekend: false,        // 0
      })
    );

    expect(result.score).toBe(62); // 20 + 38 + 14 - 5 - 5 = 62
    expect(result.label).toBe("yellow");
  });

  it("returns red for a warm, windy weekend with little new snow", () => {
    const result = calculateConfidence(
      baseFacts({
        newSnowInches: 0.5,      // 10
        baseDepthInches: 25,     // 7
        maxTempF: 42,            // -20
        maxWindMph: 35,          // -20
        isWeekend: true,         // -15
      })
    );

    expect(result.score).toBe(0);   // clamps
    expect(result.label).toBe("red");
  });

  it("applies a drive penalty when driveMiles is provided", () => {
    const near = calculateConfidence(
      baseFacts({ newSnowInches: 5, baseDepthInches: 32, maxTempF: 28, maxWindMph: 8, driveMiles: 47 })
    );
    const far = calculateConfidence(
      baseFacts({ newSnowInches: 5, baseDepthInches: 32, maxTempF: 28, maxWindMph: 8, driveMiles: 90 })
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
      })
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
      })
    );
    expect(veryGood.score).toBe(100);
    expect(veryGood.label).toBe("green");
  });
});

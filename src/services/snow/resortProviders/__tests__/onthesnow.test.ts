import { describe, expect, it } from "vitest";
import { __test__ } from "../onthesnow";

it("parses Recent Snowfall daily buckets", () => {
  const html = `
    <h2>Recent Snowfall</h2>
    <div>Tue Wed Thu Fri Sat 24h</div>
    <div>0" 5" 0" 3" 0" 0"</div>
    <div>Forecasted Snow</div>
  `;

  expect(__test__.parseRecentSnowfallDaily(html)).toEqual({
    Tue: 0,
    Wed: 5,
    Thu: 0,
    Fri: 3,
    Sat: 0,
    "24h": 0,
  });
});

it("derives recent total from the last two daily buckets", () => {
  const html = `
    <h2>Recent Snowfall</h2>
    <div>Tue Wed Thu Fri Sat 24h</div>
    <div>0" 5" 0" 3" 0" 0"</div>
    <div>Forecasted Snow</div>
  `;

  expect(__test__.parseLast48FromRecentSnowfall(html)).toBe(3);
});

describe("OnTheSnow numeric parsing", () => {
  describe("parseSnowInchesToken", () => {
    it("parses leading-decimal inch values", () => {
      expect(__test__.parseSnowInchesToken('.4"')).toBe(0.4);
      expect(__test__.parseSnowInchesToken(".5 in")).toBe(0.5);
      expect(__test__.parseSnowInchesToken(".8")).toBe(0.8);
    });

    it("parses standard inch values", () => {
      expect(__test__.parseSnowInchesToken('0.4"')).toBe(0.4);
      expect(__test__.parseSnowInchesToken('2"')).toBe(2);
      expect(__test__.parseSnowInchesToken("2.5 in")).toBe(2.5);
    });

    it("parses trace values as zero", () => {
      expect(__test__.parseSnowInchesToken("Trace")).toBe(0);
      expect(__test__.parseSnowInchesToken("T")).toBe(0);
    });
  });

  describe("toInches", () => {
    it("parses leading-decimal inch strings", () => {
      expect(__test__.toInches('.4"')).toBe(0.4);
      expect(__test__.toInches(".5 in")).toBe(0.5);
    });

    it("parses standard inch strings", () => {
      expect(__test__.toInches('2"')).toBe(2);
      expect(__test__.toInches("2.5 in")).toBe(2.5);
      expect(__test__.toInches('0.4"')).toBe(0.4);
    });

    it("converts metric strings correctly", () => {
      expect(__test__.toInches("5.08 cm")).toBe(2);
      expect(__test__.toInches("5.08 mm")).toBeCloseTo(0.2, 6);
      expect(__test__.toInches("0.254 m")).toBeCloseTo(10, 6);
    });

    it("parses trace strings as zero", () => {
      expect(__test__.toInches("Trace")).toBe(0);
      expect(__test__.toInches("T")).toBe(0);
      expect(__test__.toInches("tr")).toBe(0);
    });

    it("preserves current numeric heuristic behavior", () => {
      expect(__test__.toInches(5.08)).toBe(2);
      expect(__test__.toInches(7.62)).toBe(3);
    });
  });
});

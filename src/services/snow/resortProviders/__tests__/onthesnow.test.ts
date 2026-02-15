import { describe, expect, test } from "vitest";
import fs from "node:fs";
import { __test__ } from "../onthesnow";

function readFixture(name: string) {
  const url = new URL(`../__fixtures__/${name}`, import.meta.url);
  return fs.readFileSync(url, "utf8");
}

describe("OnTheSnow parsing", () => {
  test("gunstock: uses 24h + previous day", () => {
    const html = readFixture("onthesnow_gunstock.html");
    const v = __test__.parseLast48FromRecentSnowfall(html);
    expect(v).toBe(2);
  });

  test("pats peak: sums last two daily values when no 24h column", () => {
    const html = readFixture("onthesnow_pats-peak.html");
    const v = __test__.parseLast48FromRecentSnowfall(html);
    expect(v).toBe(0);
  });

  test("returns null when markup doesn't contain recent snowfall values", () => {
    const html = `<html><body><h1>No Recent Snowfall Here</h1></body></html>`;
    const v = __test__.parseLast48FromRecentSnowfall(html);
    expect(v).toBeNull();
  });

  test("handles decimals", () => {
    const html = `
    ### Recent Snowfall
    Mon <span>0.1"</span>
    Tue <span>2.5"</span>
    24h <span>1"</span>
    ### Forecasted Snow
  `;
    const v = __test__.parseLast48FromRecentSnowfall(html);
    // 24h + previous day (Tue=2.5, 24h=1) => 3.5
    expect(v).toBeCloseTo(3.5, 5);
  });
});

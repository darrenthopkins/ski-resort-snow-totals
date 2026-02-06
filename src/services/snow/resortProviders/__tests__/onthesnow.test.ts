/// <reference types="vitest" />

import { describe, it, expect, vi } from "vitest";
import { RESORTS } from "../../../../data/resorts";
import { getOnTheSnowLast48 } from "../onthesnow";

vi.mock("../../../http/fetchViaProxy", () => {
  return {
    fetchTextViaProxy: vi.fn(async () => {
      // Minimal fixture that resembles OnTheSnow structure:
      // - Recent Snowfall day buckets include Tue 0", Wed 1"
      // - Base/Summit include 24" and 36" which must NOT affect last48
      return `
        <html>
          <body>
            <h3>Recent Snowfall</h3>
            <div class="recent">
              <div>Sat</div><div>0"</div>
              <div>Sun</div><div>0"</div>
              <div>Mon</div><div>0"</div>
              <div>Tue</div><div>0"</div>
              <div>Wed</div><div>1"</div>
              <div>24h</div><div>0"</div>
            </div>

            <h3>Forecasted Snow</h3>
            <div class="forecast">
              <div>Thu</div><div>0"</div>
            </div>

            <div class="cards">
              <div>Base</div><div>24"</div>
              <div>Summit</div><div>36"</div>
            </div>

            <div>Snow Report Last Updated: Feb 05</div>
          </body>
        </html>
      `;
    }),
  };
});

describe("onthesnow provider parsing", () => {
  it("computes last48 from the last two day buckets (ignores Base/Summit inches)", async () => {
    const waterville = RESORTS.find(r => r.id === "waterville");
    expect(waterville).toBeTruthy();

    const out = await getOnTheSnowLast48(waterville!);
    expect(out).toBeTruthy();
    expect(out!.last48In).toBe(null); // demo-safe: provider may suppress unreliable last48
    expect(out!.updatedAt).toBe("Feb 05");
  });
});

/// <reference types="vitest" />
// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  LS_SNOW_UI_CACHE,
  readSnowUiCache,
  writeSnowUiCache,
} from "./Snow";
import type { SnowMetrics } from "../services/snow/types";

const validMetrics: SnowMetrics = {
  last48In: 2,
  next24In: 1,
};

describe("Snow UI hydration cache", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("ignores malformed JSON", () => {
    localStorage.setItem(LS_SNOW_UI_CACHE, "{bad json");

    expect(readSnowUiCache()).toEqual({});
  });

  it("ignores the incompatible RealSnowService cache schema", () => {
    localStorage.setItem(
      LS_SNOW_UI_CACHE,
      JSON.stringify({
        patspeak: {
          at: Date.now(),
          v: validMetrics,
        },
      }),
    );

    expect(readSnowUiCache()).toEqual({});
  });

  it("hydrates valid cached snow metrics", () => {
    writeSnowUiCache({ patspeak: validMetrics });

    expect(readSnowUiCache()).toEqual({ patspeak: validMetrics });
  });

  it("ignores records with malformed optional metric arrays", () => {
    localStorage.setItem(
      LS_SNOW_UI_CACHE,
      JSON.stringify({
        version: 1,
        at: Date.now(),
        snowById: {
          patspeak: {
            last48In: 2,
            next24In: 1,
            weekSnowDaily: [{ dateISO: "2026-03-09", inches: "2" }],
          },
        },
      }),
    );

    expect(readSnowUiCache()).toEqual({});
  });

  it("does not overwrite good cached data with an empty refresh result", () => {
    writeSnowUiCache({ patspeak: validMetrics });
    const before = localStorage.getItem(LS_SNOW_UI_CACHE);

    writeSnowUiCache({});

    expect(localStorage.getItem(LS_SNOW_UI_CACHE)).toBe(before);
    expect(readSnowUiCache()).toEqual({ patspeak: validMetrics });
  });
});

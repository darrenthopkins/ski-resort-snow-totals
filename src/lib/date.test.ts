import { describe, it, expect } from "vitest";
import { todayISO } from "./date";

describe("todayISO", () => {
  it("formats a provided Date as YYYY-MM-DD using local components", () => {
    const dt = new Date(2026, 1, 16, 12, 0, 0);
    expect(todayISO(dt)).toBe("2026-02-16");
  });
});

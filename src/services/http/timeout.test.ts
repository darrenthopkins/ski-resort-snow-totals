/// <reference types="vitest" />

import { describe, expect, it, vi, afterEach } from "vitest";
import { RequestTimeoutError, withTimeout } from "./timeout";

describe("withTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("terminates a promise that never resolves", async () => {
    vi.useFakeTimers();

    const p = withTimeout(
      new Promise<string>(() => {}),
      250,
      "never resolves",
    );
    const assertion = expect(p).rejects.toMatchObject({
      name: "RequestTimeoutError",
      label: "never resolves",
      timeoutMs: 250,
    } satisfies Partial<RequestTimeoutError>);

    await vi.advanceTimersByTimeAsync(250);
    await assertion;
  });
});

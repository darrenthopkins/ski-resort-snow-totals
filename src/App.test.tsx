// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, test } from "vitest";
import { cleanup } from "@testing-library/react";
import App from "./App";

afterEach(() => {
  cleanup();
});

test("renders without crashing", () => {
  const { unmount } = render(<App />);
  unmount();
});

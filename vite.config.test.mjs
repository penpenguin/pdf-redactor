/** @vitest-environment node */

import { describe, expect, it } from "vitest";

import viteConfig from "./vite.config.js";

describe("vite config", () => {
  it("GitHub Pages project subpath 向けに relative base を使う", () => {
    expect(viteConfig.base).toBe("./");
  });
});

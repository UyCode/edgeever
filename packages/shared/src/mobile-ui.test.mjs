import { describe, expect, test } from "bun:test";
import { MOBILE_UI_METRICS, toggleMobileMemoFilterMode } from "./mobile-ui.ts";

describe("mobile UI contract", () => {
  test("keeps core touch targets and navigation metrics stable", () => {
    expect(MOBILE_UI_METRICS.minimumTouchTarget).toBeGreaterThanOrEqual(44);
    expect(MOBILE_UI_METRICS.bottomNavigationHeight).toBe(52);
    expect(MOBILE_UI_METRICS.floatingCreateButtonSize).toBe(52);
  });

  test("toggles an exclusive memo filter off when pressed again", () => {
    expect(toggleMobileMemoFilterMode("all", "pinned")).toBe("pinned");
    expect(toggleMobileMemoFilterMode("pinned", "pinned")).toBe("all");
    expect(toggleMobileMemoFilterMode("tagged", "untagged")).toBe("untagged");
  });
});

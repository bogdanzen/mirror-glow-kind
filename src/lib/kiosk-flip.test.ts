import { describe, expect, it } from "vitest";
import { shouldFlip } from "./kiosk-flip";

describe("upside-down compensation", () => {
  it("auto flips only when the OS reports 180°", () => {
    expect(shouldFlip("auto", 180)).toBe(true);
    expect(shouldFlip("auto", 0)).toBe(false);
  });
  it("remote override wins", () => {
    expect(shouldFlip("on", 0)).toBe(true);
    expect(shouldFlip("off", 180)).toBe(false);
  });
});

import { expect, test } from "bun:test";
import { CAPTURE_SETTLE_MS } from "./capture-timing";

test("capture allows one extra second beyond the previous 1500ms settling pause", () => {
  expect(CAPTURE_SETTLE_MS).toBe(1500 + 1000);
});
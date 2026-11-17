import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CAPTURE_SETTLE_MS, COUNTDOWN_START_DELAY_MS } from "./capture-timing";

test("frame is captured 2 seconds after ACCEPTĂ", () => {
  assert.equal(CAPTURE_SETTLE_MS, 2000);
});
test("countdown waits before starting", () => {
  assert.ok(COUNTDOWN_START_DELAY_MS > 0);
});

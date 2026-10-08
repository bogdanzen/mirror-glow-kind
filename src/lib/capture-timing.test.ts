import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CAPTURE_SETTLE_MS } from "./capture-timing";

test("capture allows one extra second beyond the previous 1500ms settling pause", () => {
  assert.equal(CAPTURE_SETTLE_MS, 1500 + 1000);
});
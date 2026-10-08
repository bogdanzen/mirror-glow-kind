import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CAPTURE_SETTLE_MS, CONSENT_CAPTURE_MS } from "./capture-timing";

test("consent capture happens 3 seconds after the consent screen appears", () => {
  assert.equal(CONSENT_CAPTURE_MS, 3000);
  assert.ok(CONSENT_CAPTURE_MS - CAPTURE_SETTLE_MS >= 0);
});

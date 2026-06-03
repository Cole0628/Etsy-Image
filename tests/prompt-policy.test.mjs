import assert from "node:assert/strict";
import test from "node:test";

import promptPolicy from "../lib/prompt-policy.js";

const { referenceIsolationPolicy } = promptPolicy;

test("reference isolation policy protects product identity from reference images", () => {
  const text = referenceIsolationPolicy();

  assert.match(text, /Target product identity must come only from PRODUCT source images/);
  assert.match(text, /Reference images are for background atmosphere/);
  assert.match(text, /Do not copy.*products.*from reference images/i);
});

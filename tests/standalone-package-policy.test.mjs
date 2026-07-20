import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import policy from "../scripts/standalone-package-policy.mjs";

const { sanitizeStandaloneOutput, assertStandaloneOutputSafe } = policy;

test("removes local data and uploaded images from standalone output", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kie-standalone-policy-"));
  try {
    fs.mkdirSync(path.join(root, "data", "runtime-logs"), { recursive: true });
    fs.writeFileSync(path.join(root, "data", "store.json"), '{"apiKey":"secret"}');
    fs.writeFileSync(path.join(root, "data", "runtime-logs", "runtime.ndjson"), "secret");
    fs.mkdirSync(path.join(root, "public", "uploads", "kie-workbench"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(root, "public", "uploads", "kie-workbench", "private.jpg"),
      "private image"
    );
    fs.writeFileSync(path.join(root, "public", "logo.txt"), "keep me");

    sanitizeStandaloneOutput(root);
    assertStandaloneOutputSafe(root);

    assert.equal(fs.existsSync(path.join(root, "data")), false);
    assert.equal(fs.readFileSync(path.join(root, "public", "logo.txt"), "utf8"), "keep me");
    assert.deepEqual(
      fs.readdirSync(path.join(root, "public", "uploads", "kie-workbench")),
      []
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects standalone output when private runtime files remain", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kie-standalone-policy-"));
  try {
    fs.mkdirSync(path.join(root, "data"), { recursive: true });
    fs.writeFileSync(path.join(root, "data", "store.json"), "secret");

    assert.throws(
      () => assertStandaloneOutputSafe(root),
      /standalone output contains local data/i
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

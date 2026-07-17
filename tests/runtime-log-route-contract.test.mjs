import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("generation creation emits structured runtime boundaries", () => {
  const source = readFileSync(
    new URL("../app/api/jobs/route.ts", import.meta.url),
    "utf8"
  );
  for (const event of [
    "generation.request.accepted",
    "generation.input.prepared",
    "generation.input.failed",
    "kie.task.create.request",
    "kie.task.create.response",
    "kie.task.create.failed",
  ]) {
    assert.match(
      source,
      new RegExp(`appendRuntimeEvent\\(\\s*[\"']${event}[\"']`)
    );
  }
  assert.doesNotMatch(source, /appendRuntimeEvent\([^;]*apiKey/s);
});

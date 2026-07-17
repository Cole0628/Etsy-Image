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
  assert.match(source, /buildTaskEventDetails/);
  assert.match(source, /localGenerationId/);
  assert.doesNotMatch(source, /appendRuntimeEvent\([^;]*apiKey/s);
});

test("generation polling logs KIE query and integrity findings", () => {
  const source = readFileSync(
    new URL("../app/api/jobs/[taskId]/route.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /kie\.task\.query\.request/);
  assert.match(source, /kie\.task\.query\.failed/);
  assert.match(source, /kie\.task\.query\.response/);
  assert.match(source, /buildTaskIntegrityFindings/);
  assert.match(source, /buildLocalTaskExpectations/);
  assert.match(source, /buildTaskEventDetails/);
  assert.ok(
    source.indexOf("const info = await kieRecordInfo")
      < source.indexOf("parseInputPayload(expected.input_urls)"),
    "stored inputs must not be parsed before the existing upstream success boundary"
  );
  assert.doesNotMatch(source, /appendRuntimeEvent\([^;]*apiKey/s);
});

test("runtime export route constructs validated success and safe error responses", () => {
  const source = readFileSync(
    new URL("../app/api/settings/logs/export/route.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /buildDiagnosticExportResponse/);
  assert.match(source, /buildDiagnosticExportErrorResponse/);
});

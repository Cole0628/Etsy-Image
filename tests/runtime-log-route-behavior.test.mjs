import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

function routeBehavior() {
  return require("../lib/runtime-log-route.js");
}

test("builds whitelisted privacy-safe task correlation details", () => {
  const { buildTaskEventDetails } = routeBehavior();
  const prompt = "keep verbatim https://prompt.example.com/?token=user-authored";
  const details = buildTaskEventDetails({
    requestId: "request-1",
    localGenerationId: "generation-1",
    batchId: "batch-1",
    batchIndex: 2,
    requestedTaskId: "requested-task",
    returnedTaskId: "returned-task",
    expectedModel: "expected-model",
    returnedModel: "returned-model",
    aspectRatio: "4:3",
    resolution: "2K",
    submittedPrompt: prompt,
    inputUrls: ["https://cdn.example.com/product.png?token=input-secret"],
    resultUrls: ["https://cdn.example.com/result.png?signature=result-secret"],
    apiKey: "must-not-copy",
    request: { headers: { authorization: "must-not-copy" } },
    upstream: { url: "https://upstream.example.com/private" },
  });

  assert.equal(details.requestId, "request-1");
  assert.equal(details.localGenerationId, "generation-1");
  assert.equal(details.batchId, "batch-1");
  assert.equal(details.batchIndex, 2);
  assert.equal(details.requestedTaskId, "requested-task");
  assert.equal(details.returnedTaskId, "returned-task");
  assert.equal(details.expectedModel, "expected-model");
  assert.equal(details.returnedModel, "returned-model");
  assert.equal(details.aspectRatio, "4:3");
  assert.equal(details.resolution, "2K");
  assert.equal(details.submittedPrompt, prompt);
  assert.deepEqual(details.inputImages[0].host, "cdn.example.com");
  assert.equal(details.inputImages[0].filename, "product.png");
  assert.deepEqual(details.resultImages[0].host, "cdn.example.com");
  assert.equal(details.resultImages[0].filename, "result.png");
  assert.equal(Object.hasOwn(details, "apiKey"), false);
  assert.equal(Object.hasOwn(details, "request"), false);
  assert.equal(Object.hasOwn(details, "upstream"), false);
  assert.doesNotMatch(
    JSON.stringify({ ...details, submittedPrompt: "prompt intentionally omitted from scan" }),
    /input-secret|result-secret|https:\/\//
  );
});

test("keeps missing local expectations distinct from an expected empty input list", () => {
  const { buildLocalTaskExpectations } = routeBehavior();
  assert.deepEqual(buildLocalTaskExpectations(null, []), {});
  assert.deepEqual(
    buildLocalTaskExpectations(
      { submitted_model: "model-a", submitted_prompt: "", input_urls: "stored" },
      []
    ),
    {
      expectedModel: "model-a",
      expectedPrompt: "",
      expectedInputUrls: [],
    }
  );
});

test("contains unexpected logging adapter failures", () => {
  const { appendRuntimeEventSafely } = routeBehavior();
  const result = appendRuntimeEventSafely(() => {
    throw new Error("adapter failed");
  }, "kie.task.query.request", { localGenerationId: "generation-1" });
  assert.deepEqual(result, { ok: false });
});

test("constructs an attachment no-store response for an empty diagnostic bundle", () => {
  const { buildDiagnosticExportResponse } = routeBehavior();
  const bundle = {
    schemaVersion: 1,
    exportedAt: "2026-07-17T12:34:56.000Z",
    app: { version: "test-version" },
    runtime: { node: "test", platform: "win32", arch: "x64" },
    logHealth: { filesRead: 0, malformedLines: 0, message: "暂无运行记录" },
    anomalySummary: { countUnit: "event_occurrences", deduplicated: false },
    anomalies: {},
    events: [],
  };
  const response = buildDiagnosticExportResponse(
    bundle,
    "kie-runtime-diagnostic-2026-07-17.json"
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.equal(response.headers["Content-Type"], "application/json; charset=utf-8");
  assert.equal(
    response.headers["Content-Disposition"],
    'attachment; filename="kie-runtime-diagnostic-2026-07-17.json"'
  );
  assert.deepEqual(JSON.parse(response.body).events, []);
});

test("rejects null or structurally invalid diagnostic bundles", () => {
  const { buildDiagnosticExportResponse } = routeBehavior();
  assert.equal(typeof buildDiagnosticExportResponse, "function");
  assert.throws(() => buildDiagnosticExportResponse(null, "diagnostic.json"), {
    name: "TypeError",
  });
  assert.throws(
    () => buildDiagnosticExportResponse({ schemaVersion: 1, events: [] }, "diagnostic.json"),
    { name: "TypeError" }
  );
});

test("constructs a safe no-store export error response", () => {
  const { buildDiagnosticExportErrorResponse } = routeBehavior();
  const response = buildDiagnosticExportErrorResponse();
  assert.equal(response.status, 500);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.equal(response.headers["Content-Type"], "application/json; charset=utf-8");
  assert.deepEqual(JSON.parse(response.body), {
    error: "运行日志导出失败，请重试。",
  });
  assert.doesNotMatch(response.body, /https?:\/\/|[A-Z]:\\|token|secret/i);
});

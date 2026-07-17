import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import storeModule from "../lib/runtime-log-store.js";

const { createRuntimeLogStore, diagnosticExportFilename } = storeModule;
const temporaryDirectories = [];

function createLogDir() {
  const logDir = mkdtempSync(join(tmpdir(), "kie-runtime-log-"));
  temporaryDirectories.push(logDir);
  return logDir;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

test("builds a filesystem-safe timestamped export filename", () => {
  assert.equal(
    diagnosticExportFilename(new Date("2026-07-17T12:34:56.000Z")),
    "kie-runtime-diagnostic-2026-07-17T12-34-56-000Z.json"
  );
});

test("rotates bounded NDJSON files and reads events oldest to newest", () => {
  const logDir = createLogDir();
  const store = createRuntimeLogStore({
    logDir,
    maxBytes: 360,
    maxFiles: 3,
    appVersion: "test-version",
  });
  for (let index = 0; index < 20; index += 1) {
    store.appendRuntimeEvent("test.event", { index, prompt: `prompt-${index}` });
  }
  const files = readdirSync(logDir).filter((name) => name.endsWith(".ndjson"));
  assert.ok(files.length <= 3);
  const read = store.readRuntimeEvents();
  assert.ok(read.events.length > 0);
  assert.equal(read.events.at(-1).details.index, 19);
});

test("skips malformed lines and reports them in bundle health", () => {
  const logDir = createLogDir();
  mkdirSync(logDir, { recursive: true });
  writeFileSync(
    join(logDir, "runtime.ndjson"),
    '{"timestamp":"2026-07-17T00:00:00.000Z","event":"ok","details":{}}\nnot-json\n'
  );
  const store = createRuntimeLogStore({ logDir, appVersion: "test-version" });
  const bundle = store.buildDiagnosticBundle();
  assert.equal(bundle.logHealth.malformedLines, 1);
  assert.equal(bundle.events.length, 1);
});

test("exports full prompts, redacts secrets, and aggregates findings", () => {
  const logDir = createLogDir();
  const store = createRuntimeLogStore({ logDir, appVersion: "0.2.6" });
  store.appendRuntimeEvent("kie.task.result", {
    prompt: "完整提示词",
    apiKey: "never-export",
    findings: [{ code: "prompt_mismatch", severity: "error", message: "提示词不一致" }],
  });
  const bundle = store.buildDiagnosticBundle();
  assert.equal(bundle.app.version, "0.2.6");
  assert.equal(bundle.events[0].details.prompt, "完整提示词");
  assert.equal(bundle.events[0].details.apiKey, "[REDACTED]");
  assert.equal(bundle.anomalies.prompt_mismatch.count, 1);
});

test("returns a valid empty bundle when no log directory exists", () => {
  const logDir = join(createLogDir(), "missing");
  const store = createRuntimeLogStore({ logDir, appVersion: "test-version" });
  const bundle = store.buildDiagnosticBundle();
  assert.deepEqual(bundle.events, []);
  assert.equal(bundle.logHealth.message, "暂无运行记录");
});

test("sanitizes public event names and valid externally written NDJSON before export", () => {
  const logDir = createLogDir();
  mkdirSync(logDir, { recursive: true });
  writeFileSync(
    join(logDir, "runtime.ndjson"),
    `${JSON.stringify({
      timestamp: "2026-07-17T00:00:00.000Z",
      event: "https://events.example.com/task?token=event-secret",
      details: {
        prompt: "keep https://example.com because this is the user's prompt",
        apiKey: "disk-secret",
        cookie: "sid=disk-secret",
        error: "fetch https://cdn.example.com/image.png?token=disk-secret",
      },
    })}\n`
  );
  const store = createRuntimeLogStore({ logDir, appVersion: "test-version" });
  store.appendRuntimeEvent("https://events.example.com/live?token=live-secret", { prompt: "live prompt" });
  const bundle = store.buildDiagnosticBundle();
  const external = bundle.events[0];
  const live = bundle.events[1];
  assert.doesNotMatch(external.event, /https:\/\/|event-secret/);
  assert.equal(external.details.apiKey, "[REDACTED]");
  assert.equal(external.details.cookie, "[REDACTED]");
  assert.doesNotMatch(external.details.error, /https:\/\/|disk-secret/);
  assert.equal(external.details.prompt, "keep https://example.com because this is the user's prompt");
  assert.doesNotMatch(live.event, /https:\/\/|live-secret/);
});

test("continues reading newer logs when an older rotated path cannot be read", () => {
  const logDir = createLogDir();
  mkdirSync(join(logDir, "runtime.1.ndjson"), { recursive: true });
  writeFileSync(
    join(logDir, "runtime.ndjson"),
    '{"timestamp":"2026-07-17T00:00:00.000Z","event":"newer","details":{"index":2}}\n'
  );
  const store = createRuntimeLogStore({ logDir, appVersion: "test-version" });
  const read = store.readRuntimeEvents();
  assert.deepEqual(read.events.map((event) => event.event), ["newer"]);
});

test("rejects a single serialized event that exceeds the configured bound", () => {
  const logDir = createLogDir();
  const store = createRuntimeLogStore({ logDir, maxBytes: 64, appVersion: "test-version" });
  const result = store.appendRuntimeEvent("too.large", { prompt: "x".repeat(200) });
  assert.deepEqual(result, { ok: false });
  assert.equal(existsSync(join(logDir, "runtime.ndjson")), false);
});

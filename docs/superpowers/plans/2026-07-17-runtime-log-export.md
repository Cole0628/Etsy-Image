# Runtime Log Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bounded server-side structured logging and a one-click diagnostic JSON export that can identify KIE task, prompt, input-image, and result-image mismatches without exposing credentials or signed URLs.

**Architecture:** A CommonJS core module supplies testable fingerprinting, sanitization, KIE parameter parsing, and integrity detection. A separate CommonJS store owns best-effort NDJSON persistence, rotation, tolerant reads, and diagnostic bundle construction; a small TypeScript facade gives Next.js routes typed access. Generation routes emit events at the KIE boundary, and the existing Network Diagnostics page downloads the export endpoint response.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.7, Node.js built-ins (`crypto`, `fs`, `path`), Node test runner.

## Global Constraints

- Preserve complete prompt text in diagnostic events and exports.
- Never persist or export API keys, Authorization headers, cookies, access tokens, complete image URLs, or readable URL query parameters.
- Safe image references contain only hostname, filename, and a deterministic SHA-256 fingerprint of the complete URL.
- Store logs below `data/runtime-logs/`, using the configured `KIE_WORKBENCH_DATA_DIR` root in packaged builds.
- Rotate at approximately 2 MB and retain the active file plus two rotated files.
- Logging failures must never change image-generation success or failure behavior.
- Do not add a runtime dependency.
- Keep web port `3300` and packaged desktop port `38477` unchanged.
- Preserve all pre-existing dirty worktree changes; in particular, do not automatically stage the existing edits in `app/settings/network/page.tsx`.

---

## File map

- Create `lib/runtime-log-core.js`: pure fingerprint, privacy, KIE-param, and integrity functions.
- Create `lib/runtime-log-store.js`: rolling NDJSON persistence, tolerant reads, bundle construction, and default store.
- Create `lib/runtime-log.ts`: typed facade used by TypeScript routes.
- Modify `lib/db.ts`: retain submitted KIE prompt/model and provide task lookup.
- Modify `app/api/jobs/route.ts`: log normalized input and KIE task creation boundaries.
- Modify `app/api/jobs/[taskId]/route.ts`: compare local expectations with KIE result responses and log findings.
- Create `app/api/settings/logs/export/route.ts`: return a timestamped JSON attachment.
- Modify `app/settings/network/page.tsx`: add export state, action, warning, and button.
- Create `tests/runtime-log-core.test.mjs`: privacy and integrity unit tests.
- Create `tests/runtime-log-store.test.mjs`: rotation, corruption, bundle, and empty-state tests.
- Create `tests/runtime-log-route-contract.test.mjs`: verify both generation routes emit the required boundaries without logging the API key.

### Task 1: Privacy-safe diagnostic primitives

**Files:**
- Create: `tests/runtime-log-core.test.mjs`
- Create: `lib/runtime-log-core.js`

**Interfaces:**
- Produces: `fingerprint(value: unknown): string`
- Produces: `safeImageReference(url: string): { host: string; filename: string; fingerprint: string }`
- Produces: `sanitizeForLog(value: unknown, key?: string): unknown`
- Produces: `parseKieTaskParam(param: unknown): { model?: string; prompt?: string; inputUrls: string[] }`
- Produces: `buildTaskIntegrityFindings(input): Array<{ code: string; severity: "warning" | "error"; message: string; relatedTaskId?: string }>`

- [ ] **Step 1: Write the failing core tests and a non-functional module shell**

Create `tests/runtime-log-core.test.mjs` with tests that assert the exact privacy contract and all required mismatch codes:

```js
import assert from "node:assert/strict";
import test from "node:test";

import core from "../lib/runtime-log-core.js";

const {
  fingerprint,
  safeImageReference,
  sanitizeForLog,
  parseKieTaskParam,
  buildTaskIntegrityFindings,
} = core;

test("creates stable fingerprints and privacy-safe image references", () => {
  const url = "https://cdn.example.com/path/Product%20One.png?token=secret&expires=9";
  assert.equal(fingerprint(url), fingerprint(url));
  assert.match(fingerprint(url), /^[a-f0-9]{64}$/);
  assert.deepEqual(safeImageReference(url), {
    host: "cdn.example.com",
    filename: "Product One.png",
    fingerprint: fingerprint(url),
  });
});

test("keeps full prompts but removes credentials and readable URLs", () => {
  const value = sanitizeForLog({
    prompt: "完整提示词：https://example.com may appear as user-authored text",
    apiKey: "kie-secret",
    Authorization: "Bearer secret",
    cookie: "sid=secret",
    error: "fetch failed for https://cdn.example.com/a.png?token=secret",
  });
  assert.equal(value.prompt, "完整提示词：https://example.com may appear as user-authored text");
  assert.equal(value.apiKey, "[REDACTED]");
  assert.equal(value.Authorization, "[REDACTED]");
  assert.equal(value.cookie, "[REDACTED]");
  assert.doesNotMatch(value.error, /token=secret|https:\/\//);
});

test("parses KIE nested param input", () => {
  const param = JSON.stringify({
    model: "gpt-image-2-image-to-image",
    input: JSON.stringify({
      prompt: "submitted prompt",
      input_urls: ["https://cdn.example.com/a.png"],
    }),
  });
  assert.deepEqual(parseKieTaskParam(param), {
    model: "gpt-image-2-image-to-image",
    prompt: "submitted prompt",
    inputUrls: ["https://cdn.example.com/a.png"],
  });
});

test("detects upstream task, prompt, input, model, and reused-result anomalies", () => {
  const findings = buildTaskIntegrityFindings({
    requestedTaskId: "task-local",
    expectedModel: "model-a",
    expectedPrompt: "prompt-a",
    expectedInputUrls: ["https://cdn.example.com/input-a.png"],
    returnedTaskId: "task-upstream",
    returnedModel: "model-b",
    returnedParam: JSON.stringify({
      input: JSON.stringify({
        prompt: "prompt-b",
        input_urls: ["https://cdn.example.com/input-b.png"],
      }),
    }),
    resultUrls: ["https://cdn.example.com/result.png"],
    otherTaskIds: ["task-upstream"],
    otherResults: [
      { taskId: "older-task", url: "https://cdn.example.com/result.png" },
    ],
  });
  assert.deepEqual(
    new Set(findings.map((item) => item.code)),
    new Set([
      "task_id_mismatch",
      "task_id_reused",
      "model_mismatch",
      "prompt_mismatch",
      "input_images_mismatch",
      "result_image_reused",
    ])
  );
});
```

Create `lib/runtime-log-core.js` with only `module.exports = {};` so the test runner can load the module and report a behavioral assertion failure instead of a module-resolution error.

- [ ] **Step 2: Run the core test and verify RED**

Run: `node --test tests/runtime-log-core.test.mjs`

Expected: FAIL with `fingerprint is not a function`.

- [ ] **Step 3: Implement the pure core module**

Create `lib/runtime-log-core.js`. Use `createHash("sha256")`, recursively redact key names matching `apiKey`, `authorization`, `cookie`, `token`, `secret`, and `credential`, preserve strings under `prompt`, `fullPrompt`, and `submittedPrompt`, and replace URLs in every other string with a non-reversible marker containing the safe host, filename, and fingerprint. `parseKieTaskParam` must parse both the outer `param` and a string-valued nested `input`. `buildTaskIntegrityFindings` must compare complete URL fingerprints in original order and must only report reuse against task IDs supplied as other tasks.

The exported surface must be exactly:

```js
module.exports = {
  fingerprint,
  safeImageReference,
  sanitizeForLog,
  parseKieTaskParam,
  buildTaskIntegrityFindings,
};
```

Finding codes and severities:

```js
const findingDefinitions = {
  task_id_mismatch: "error",
  task_id_reused: "error",
  model_mismatch: "warning",
  prompt_mismatch: "error",
  input_images_mismatch: "error",
  result_image_reused: "error",
};
```

- [ ] **Step 4: Run the core test and verify GREEN**

Run: `node --test tests/runtime-log-core.test.mjs`

Expected: 4 tests pass, 0 fail.

- [ ] **Step 5: Commit the core unit**

Run:

```powershell
git add -- lib/runtime-log-core.js tests/runtime-log-core.test.mjs
git commit -m "feat: add runtime log privacy primitives"
```

Expected: only the two listed files are committed.

### Task 2: Rolling NDJSON store and diagnostic bundle

**Files:**
- Create: `tests/runtime-log-store.test.mjs`
- Create: `lib/runtime-log-store.js`
- Create: `lib/runtime-log.ts`

**Interfaces:**
- Consumes: core functions from Task 1.
- Produces: `createRuntimeLogStore(options)` with methods `appendRuntimeEvent(event, details)`, `readRuntimeEvents()`, and `buildDiagnosticBundle()`.
- Produces through `lib/runtime-log.ts`: typed `appendRuntimeEvent`, `safeImageReferences`, `parseKieTaskParam`, `buildTaskIntegrityFindings`, and `buildDiagnosticBundle`.

- [ ] **Step 1: Write failing store tests and a non-functional module shell**

Create `tests/runtime-log-store.test.mjs`. Use `mkdtempSync(join(tmpdir(), "kie-runtime-log-"))` and remove the directory in `afterEach`. Cover:

```js
test("rotates bounded NDJSON files and reads events oldest to newest", () => {
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
  const store = createRuntimeLogStore({ logDir, appVersion: "test-version" });
  const bundle = store.buildDiagnosticBundle();
  assert.deepEqual(bundle.events, []);
  assert.equal(bundle.logHealth.message, "暂无运行记录");
});
```

Create `lib/runtime-log-store.js` with only `module.exports = {};` so the RED run fails on the missing behavior rather than module loading.

- [ ] **Step 2: Run the store test and verify RED**

Run: `node --test tests/runtime-log-store.test.mjs`

Expected: FAIL with `createRuntimeLogStore is not a function`.

- [ ] **Step 3: Implement the rolling store**

Create `lib/runtime-log-store.js` with these defaults and behavior:

```js
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_FILES = 3;
const ACTIVE_NAME = "runtime.ndjson";

const defaultDataRoot = process.env.KIE_WORKBENCH_DATA_DIR
  ? path.join(process.env.KIE_WORKBENCH_DATA_DIR, "data")
  : path.join(process.cwd(), "data");
const defaultLogDir = path.join(defaultDataRoot, "runtime-logs");
const defaultAppVersion = require("../package.json").version;
```

`appendRuntimeEvent` must sanitize before serializing, attach ISO timestamp and app version, rotate `runtime.1.ndjson` to `runtime.2.ndjson`, rotate the active file to `runtime.1.ndjson`, then append one complete line. Every file operation in append must be contained by `try/catch`, and the public method must return `{ ok: false }` instead of throwing on failure.

`readRuntimeEvents` must read `runtime.2.ndjson`, `runtime.1.ndjson`, then `runtime.ndjson`, skip malformed or blank lines, and return:

```js
{
  events,
  health: {
    filesRead,
    malformedLines,
    message: events.length === 0 ? "暂无运行记录" : "日志读取正常",
  },
}
```

`buildDiagnosticBundle` must return:

```js
{
  schemaVersion: 1,
  exportedAt: new Date().toISOString(),
  app: { version: appVersion },
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  logHealth: health,
  anomalies: aggregateFindings(events),
  events,
}
```

Export both the factory and a default singleton:

```js
module.exports = {
  createRuntimeLogStore,
  appendRuntimeEvent: (...args) => defaultStore.appendRuntimeEvent(...args),
  readRuntimeEvents: (...args) => defaultStore.readRuntimeEvents(...args),
  buildDiagnosticBundle: (...args) => defaultStore.buildDiagnosticBundle(...args),
};
```

- [ ] **Step 4: Add the typed facade**

Create `lib/runtime-log.ts` that imports the two CommonJS modules, declares `RuntimeFinding` and `RuntimeEvent` types, and exports typed wrappers. The wrapper for image URLs must be:

```ts
export function safeImageReferences(urls: string[]) {
  return urls.map((url) => core.safeImageReference(url));
}
```

The wrapper for logging must not throw even if an unexpected adapter error occurs:

```ts
export function appendRuntimeEvent(event: string, details: Record<string, unknown>) {
  try {
    return store.appendRuntimeEvent(event, details);
  } catch {
    return { ok: false };
  }
}
```

- [ ] **Step 5: Run store and core tests**

Run: `node --test tests/runtime-log-core.test.mjs tests/runtime-log-store.test.mjs`

Expected: all tests pass and temporary log directories are removed.

- [ ] **Step 6: Commit the storage unit**

Run:

```powershell
git add -- lib/runtime-log-store.js lib/runtime-log.ts tests/runtime-log-store.test.mjs
git commit -m "feat: add rolling runtime log store"
```

Expected: only the three listed files are committed.

### Task 3: Persist submitted KIE expectations and log task creation

**Files:**
- Create: `tests/runtime-log-route-contract.test.mjs`
- Modify: `lib/db.ts`
- Modify: `app/api/jobs/route.ts`

**Interfaces:**
- Consumes: `appendRuntimeEvent` and `safeImageReferences` from Task 2.
- Produces: `getGenerationByTaskId(taskId: string): GenerationRow | null`.
- Extends `GenerationRow` with optional `submitted_prompt` and `submitted_model` fields for backward compatibility.

- [ ] **Step 1: Add a failing source contract test**

Add `tests/runtime-log-route-contract.test.mjs` with a focused contract that reads the route source and asserts the creation boundaries are present without ever passing `apiKey` to logging:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("generation creation emits structured runtime boundaries", () => {
  const source = readFileSync(new URL("../app/api/jobs/route.ts", import.meta.url), "utf8");
  for (const event of [
    "generation.request.accepted",
    "generation.input.prepared",
    "generation.input.failed",
    "kie.task.create.request",
    "kie.task.create.response",
    "kie.task.create.failed",
  ]) {
    assert.match(source, new RegExp(`appendRuntimeEvent\\(\\s*[\"']${event}[\"']`));
  }
  assert.doesNotMatch(source, /appendRuntimeEvent\([^;]*apiKey/s);
});
```

- [ ] **Step 2: Run the route contract and verify RED**

Run: `node --test tests/runtime-log-route-contract.test.mjs`

Expected: FAIL because the route has not imported or called `appendRuntimeEvent`.

- [ ] **Step 3: Extend generation persistence**

In `lib/db.ts`, add:

```ts
submitted_prompt?: string | null;
submitted_model?: string | null;
```

to `GenerationRow`, and add:

```ts
export function getGenerationByTaskId(taskId: string): GenerationRow | null {
  return readState().generations.find((row) => row.task_id === taskId) ?? null;
}
```

Do not require migration of older `store.json` rows; both fields remain optional.

- [ ] **Step 4: Instrument normalized input and KIE create boundaries**

In `app/api/jobs/route.ts`:

- Import `getGenerationByTaskId`, `appendRuntimeEvent`, and `safeImageReferences`.
- Create a `requestId` immediately after parsing valid JSON.
- Log `generation.request.accepted` after workbench and input-count validation, including the complete user prompt, model ID, workbench ID, and safe product/reference image references.
- Log `generation.input.failed` inside the existing preparation catch and `generation.input.prepared` after both lists are prepared.
- Before each `kieCreateTask` call, log `kie.task.create.request` with `requestId`, `batchId`, batch index, submitted KIE model, complete augmented prompt, aspect, resolution, and safe merged inputs.
- On non-200 creation, log `kie.task.create.failed` with the safe error summary.
- On success, check `getGenerationByTaskId(created.data.taskId)` before insertion and attach a `task_id_reused` finding when present; then log `kie.task.create.response`.
- Insert `submitted_prompt: fullPrompt` and `submitted_model: modelRow.kie_model` in the generation row.

The logging calls must contain only explicit fields. Do not pass `request`, `body`, `kieBody`, `created`, or `apiKey` wholesale.

- [ ] **Step 5: Run the contract and production build**

Run:

```powershell
node --test tests/runtime-log-route-contract.test.mjs
npm run build
```

Expected: the contract passes and Next.js completes a production build with no TypeScript error.

- [ ] **Step 6: Commit the creation instrumentation**

Run:

```powershell
git add -- lib/db.ts app/api/jobs/route.ts tests/runtime-log-route-contract.test.mjs
git commit -m "feat: log KIE task creation boundaries"
```

Expected: only the three listed files are committed.

### Task 4: Validate and log KIE task results

**Files:**
- Modify: `tests/runtime-log-route-contract.test.mjs`
- Modify: `app/api/jobs/[taskId]/route.ts`

**Interfaces:**
- Consumes: `getGenerationByTaskId`, `listGenerations`, and `parseInputPayload`.
- Consumes: `appendRuntimeEvent`, `safeImageReferences`, `parseKieTaskParam`, and `buildTaskIntegrityFindings`.

- [ ] **Step 1: Extend the route contract test and verify RED**

Add this test:

```js
test("generation polling logs KIE query and integrity findings", () => {
  const source = readFileSync(
    new URL("../app/api/jobs/[taskId]/route.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /kie\.task\.query\.request/);
  assert.match(source, /kie\.task\.query\.failed/);
  assert.match(source, /kie\.task\.query\.response/);
  assert.match(source, /buildTaskIntegrityFindings/);
  assert.doesNotMatch(source, /appendRuntimeEvent\([^;]*apiKey/s);
});
```

Run: `node --test tests/runtime-log-route-contract.test.mjs`

Expected: the new polling test fails.

- [ ] **Step 2: Build expected and historical comparison data**

At the start of `GET`, load the expected generation row and emit `kie.task.query.request`. After a successful response:

```ts
const parsedParam = parseKieTaskParam(data.param);
const expectedInputs = expected
  ? parseInputPayload(expected.input_urls).merged
  : [];
const history = listGenerations(500);
const otherRows = history.filter((row) => row.id !== expected?.id);
const otherResults = otherRows.flatMap((row) => {
  if (!row.result_urls) return [];
  try {
    const parsed = JSON.parse(row.result_urls) as { resultUrls?: unknown };
    return Array.isArray(parsed.resultUrls)
      ? parsed.resultUrls
          .filter((url): url is string => typeof url === "string")
          .map((url) => ({ taskId: row.task_id, url }))
      : [];
  } catch {
    return [];
  }
});
```

- [ ] **Step 3: Detect and log upstream mismatches**

Call `buildTaskIntegrityFindings` with:

```ts
const findings = buildTaskIntegrityFindings({
  requestedTaskId: taskId,
  expectedModel: expected?.submitted_model ?? undefined,
  expectedPrompt: expected?.submitted_prompt ?? undefined,
  expectedInputUrls: expectedInputs,
  returnedTaskId: data.taskId,
  returnedModel: data.model,
  returnedParam: data.param,
  resultUrls,
  otherTaskIds: otherRows.map((row) => row.task_id),
  otherResults,
});
```

Emit `kie.task.query.response` with requested/returned task IDs, state, complete returned prompt, safe returned inputs, safe result images, elapsed time, and findings. On non-200 response emit `kie.task.query.failed`. Keep the existing API response and database-update behavior unchanged.

- [ ] **Step 4: Run tests and build**

Run:

```powershell
node --test tests/runtime-log-core.test.mjs tests/runtime-log-store.test.mjs tests/runtime-log-route-contract.test.mjs
npm run build
```

Expected: all diagnostic tests pass and the production build completes.

- [ ] **Step 5: Commit result validation**

Run:

```powershell
git add -- 'app/api/jobs/[taskId]/route.ts' tests/runtime-log-route-contract.test.mjs
git commit -m "feat: log KIE result integrity findings"
```

Expected: only the polling route and its contract test are committed.

### Task 5: Export endpoint and Network Diagnostics UI

**Files:**
- Modify: `tests/runtime-log-store.test.mjs`
- Modify: `lib/runtime-log-store.js`
- Modify: `lib/runtime-log.ts`
- Create: `app/api/settings/logs/export/route.ts`
- Modify: `app/settings/network/page.tsx`

**Interfaces:**
- Consumes: `buildDiagnosticBundle()` from Task 2.
- Produces: `GET /api/settings/logs/export` returning a JSON attachment.

- [ ] **Step 1: Add and run a failing export filename test**

Extend the destructuring import from `runtime-log-store.js` with `diagnosticExportFilename`, then add:

```js
test("builds a filesystem-safe timestamped export filename", () => {
  assert.equal(
    diagnosticExportFilename(new Date("2026-07-17T12:34:56.000Z")),
    "kie-runtime-diagnostic-2026-07-17T12-34-56-000Z.json"
  );
});
```

Run: `node --test tests/runtime-log-store.test.mjs`

Expected: FAIL because `diagnosticExportFilename` is not exported.

- [ ] **Step 2: Implement the helper and export route**

Add `diagnosticExportFilename` to `lib/runtime-log-store.js` and the TypeScript facade. Create `app/api/settings/logs/export/route.ts`:

```ts
import { NextResponse } from "next/server";
import {
  buildDiagnosticBundle,
  diagnosticExportFilename,
} from "@/lib/runtime-log";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const now = new Date();
    const bundle = buildDiagnosticBundle();
    return new NextResponse(JSON.stringify(bundle, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${diagnosticExportFilename(now)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "运行日志导出失败，请重试。" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
```

- [ ] **Step 3: Add the download interaction to the existing settings page**

In `app/settings/network/page.tsx`, add `exporting` state and this handler:

```tsx
const exportLogs = async () => {
  setExporting(true);
  setStatus(null);
  try {
    const response = await fetch("/api/settings/logs/export", { cache: "no-store" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error || "运行日志导出失败");
    }
    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition") || "";
    const filename =
      disposition.match(/filename="([^"]+)"/)?.[1] || "kie-runtime-diagnostic.json";
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(href);
    setStatus("运行日志已导出。文件包含完整提示词，转发前请确认内容。");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "运行日志导出失败");
  } finally {
    setExporting(false);
  }
};
```

Add a separate `运行日志` card below the flow-test card. Its copy must state that the export includes complete prompts but excludes API keys and complete image URLs. Add a button labelled `导出运行日志`, disabled while exporting and labelled `导出中...` during the request.

- [ ] **Step 4: Run focused tests and build**

Run:

```powershell
node --test tests/runtime-log-store.test.mjs
npm run build
```

Expected: tests pass and `/api/settings/logs/export` appears in the successful Next.js route build.

- [ ] **Step 5: Commit only files that are safe to stage**

Because `app/settings/network/page.tsx` already contains user-owned edits, do not stage that entire file automatically. Commit the clean new endpoint and store/test changes only:

```powershell
git add -- app/api/settings/logs/export/route.ts lib/runtime-log-store.js lib/runtime-log.ts tests/runtime-log-store.test.mjs
git commit -m "feat: add runtime diagnostic export endpoint"
```

Leave the Network Diagnostics page modification in the working tree and report it explicitly in the handoff. Do not use `git checkout`, `git reset`, or any command that discards its pre-existing edits.

### Task 6: Full verification and handoff

**Files:**
- Verify all files listed above.
- Update `CODEX_HANDOFF.md` only if the task duration approaches the session-rotation threshold.

**Interfaces:**
- Consumes the complete feature.
- Produces test/build evidence and a concise user handoff.

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`

Expected: all existing and new Node tests pass with 0 failures.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: Next.js production build succeeds and includes `/api/settings/logs/export`.

- [ ] **Step 3: Inspect privacy and worktree boundaries**

Run:

```powershell
rg -n "apiKey|Authorization|cookie|complete image URL|input_urls|resultUrls" lib/runtime-log* app/api/settings/logs app/api/jobs
git status --short
git diff --check
```

Expected: credentials appear only in sanitization rules or existing KIE transport code, no logger call includes `apiKey`, no whitespace errors are reported, and unrelated dirty files remain intact.

- [ ] **Step 4: Verify the endpoint without changing reserved ports**

If a manual runtime check is needed, first run:

```powershell
Get-Content -LiteralPath 'D:\Codex_Project\PROJECT_PORTS.md' -TotalCount 220
Get-NetTCPConnection -LocalPort 3300 -State Listen -ErrorAction SilentlyContinue
```

Only start `npm run dev` when port `3300` is free. Download `/api/settings/logs/export`, parse the JSON, verify the prompt remains complete, verify no API key or readable signed URL is present, then stop only the dev process started for this check.

- [ ] **Step 5: Final handoff**

Report:

- The export button location.
- The log retention limit: active file plus two rotated files at approximately 2 MB each.
- The exact anomaly types detected.
- The fact that complete prompts are included while credentials and complete image URLs are excluded.
- Test and build results.
- The uncommitted status of `app/settings/network/page.tsx` caused by pre-existing user-owned edits.

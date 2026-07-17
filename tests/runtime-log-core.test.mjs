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

test("drops a percent-encoded nested URL from the exported filename", () => {
  const url =
    "https://cdn.example.com/cache/https%3A%2F%2Fimages.example.net%2Fprivate.png%3Ftoken%3Dnested-secret";
  const reference = safeImageReference(url);
  assert.equal(reference.host, "cdn.example.com");
  assert.equal(reference.filename, "");
  assert.equal(reference.fingerprint, fingerprint(url));
  assert.doesNotMatch(JSON.stringify(reference), /images\.example\.net|token|nested-secret/i);
});

test("drops encoded signed parameters from the exported filename", () => {
  const url =
    "https://cdn.example.com/product.png%3FX-Amz-Credential%3Daccount%252Fscope%26X-Amz-Signature%3Dsigned-secret";
  const reference = safeImageReference(url);
  assert.equal(reference.host, "cdn.example.com");
  assert.equal(reference.filename, "");
  assert.equal(reference.fingerprint, fingerprint(url));
  assert.doesNotMatch(JSON.stringify(reference), /credential|signature|signed-secret/i);
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

test("redacts separator and prefixed credential key names", () => {
  const value = sanitizeForLog({
    api_key: "secret-api-key",
    "X-API-Key": "secret-header-key",
    service_credential: "secret-credential",
  });
  assert.equal(value.api_key, "[REDACTED]");
  assert.equal(value["X-API-Key"], "[REDACTED]");
  assert.equal(value.service_credential, "[REDACTED]");
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

test("preserves an absent upstream input list separately from an empty list", () => {
  const absent = parseKieTaskParam(JSON.stringify({ input: "{}" }));
  const empty = parseKieTaskParam(
    JSON.stringify({ input: JSON.stringify({ input_urls: [] }) })
  );
  assert.equal(Object.hasOwn(absent, "inputUrls"), false);
  assert.deepEqual(empty.inputUrls, []);
});

test("reports absent upstream fields when local expectations exist", () => {
  const findings = buildTaskIntegrityFindings({
    expectedModel: "model-a",
    expectedPrompt: "",
    expectedInputUrls: [],
    returnedParam: JSON.stringify({ input: "{}" }),
  });
  assert.deepEqual(
    new Set(findings.map((item) => item.code)),
    new Set(["model_mismatch", "prompt_mismatch", "input_images_mismatch"])
  );
});

test("skips absent comparisons when no local expectations exist", () => {
  const findings = buildTaskIntegrityFindings({
    returnedParam: JSON.stringify({ input: "{}" }),
  });
  assert.deepEqual(findings, []);
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

test("does not flag reused results without a non-empty explicit other task ID", () => {
  const findings = buildTaskIntegrityFindings({
    resultUrls: ["https://cdn.example.com/result.png"],
    otherTaskIds: ["other-task"],
    otherResults: [
      { url: "https://cdn.example.com/result.png" },
      { taskId: "", url: "https://cdn.example.com/result.png" },
    ],
  });
  assert.equal(findings.some((item) => item.code === "result_image_reused"), false);
});

test("does not flag a result reused by a historical entry for the returned task", () => {
  const findings = buildTaskIntegrityFindings({
    returnedTaskId: "same-upstream-task",
    resultUrls: ["https://cdn.example.com/result.png"],
    otherResults: [
      {
        taskId: "same-upstream-task",
        url: "https://cdn.example.com/result.png",
      },
    ],
  });
  assert.equal(findings.some((item) => item.code === "result_image_reused"), false);
});

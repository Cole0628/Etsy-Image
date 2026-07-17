const { safeImageReference, sanitizeForLog } = require("./runtime-log-core.js");

function compactDefined(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  );
}

function safeReferences(urls) {
  return Array.isArray(urls)
    ? urls.filter((url) => typeof url === "string").map((url) => safeImageReference(url))
    : [];
}

function buildTaskEventDetails(input = {}) {
  const details = compactDefined({
    requestId: input.requestId,
    localGenerationId: input.localGenerationId,
    batchId: input.batchId,
    batchIndex: input.batchIndex,
    requestedTaskId: input.requestedTaskId,
    returnedTaskId: input.returnedTaskId,
    expectedModel: input.expectedModel,
    returnedModel: input.returnedModel,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    prompt: input.prompt,
    submittedPrompt: input.submittedPrompt,
    state: input.state,
    statusCode: input.statusCode,
    error: input.error,
    elapsedMs: input.elapsedMs,
    findings: input.findings,
  });
  if (input.inputUrls !== undefined) details.inputImages = safeReferences(input.inputUrls);
  if (input.resultUrls !== undefined) details.resultImages = safeReferences(input.resultUrls);
  return sanitizeForLog(details);
}

function buildLocalTaskExpectations(expected, expectedInputUrls) {
  if (!expected || typeof expected !== "object") return {};
  return compactDefined({
    expectedModel: expected.submitted_model ?? undefined,
    expectedPrompt: expected.submitted_prompt ?? undefined,
    expectedInputUrls: Array.isArray(expectedInputUrls) ? expectedInputUrls : [],
  });
}

function appendRuntimeEventSafely(append, event, details) {
  try {
    return append(event, details);
  } catch {
    return { ok: false };
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDiagnosticBundle(bundle) {
  return isRecord(bundle)
    && Number.isInteger(bundle.schemaVersion)
    && typeof bundle.exportedAt === "string"
    && isRecord(bundle.app)
    && isRecord(bundle.runtime)
    && isRecord(bundle.logHealth)
    && isRecord(bundle.anomalySummary)
    && bundle.anomalySummary.countUnit === "event_occurrences"
    && bundle.anomalySummary.deduplicated === false
    && isRecord(bundle.anomalies)
    && Array.isArray(bundle.events);
}

function buildDiagnosticExportResponse(bundle, filename) {
  if (!isDiagnosticBundle(bundle)) {
    throw new TypeError("Invalid diagnostic bundle");
  }
  return {
    body: JSON.stringify(bundle, null, 2),
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  };
}

function buildDiagnosticExportErrorResponse() {
  return {
    body: JSON.stringify({ error: "运行日志导出失败，请重试。" }),
    status: 500,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  };
}

module.exports = {
  appendRuntimeEventSafely,
  buildDiagnosticExportErrorResponse,
  buildDiagnosticExportResponse,
  buildLocalTaskExpectations,
  buildTaskEventDetails,
};

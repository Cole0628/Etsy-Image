import core from "./runtime-log-core.js";
import store from "./runtime-log-store.js";
import routeBehavior from "./runtime-log-route.js";

export type RuntimeFinding = {
  code: string;
  severity?: string;
  message?: string;
  relatedTaskId?: string;
};

export type RuntimeEvent = {
  timestamp: string;
  appVersion: string;
  event: string;
  details: Record<string, unknown> & { findings?: RuntimeFinding[] };
};

export type TaskEventDetailsInput = {
  requestId?: string;
  localGenerationId?: string;
  batchId?: string | null;
  batchIndex?: number | null;
  requestedTaskId?: string;
  returnedTaskId?: string;
  expectedModel?: string;
  returnedModel?: string;
  aspectRatio?: string | null;
  resolution?: string | null;
  prompt?: string;
  submittedPrompt?: string;
  inputUrls?: string[];
  resultUrls?: string[];
  state?: string;
  statusCode?: number;
  error?: string;
  elapsedMs?: number;
  findings?: RuntimeFinding[];
};

export type PreparedDiagnosticResponse = {
  body: string;
  status: number;
  headers: Record<string, string>;
};

export function safeImageReferences(urls: string[]) {
  return urls.map((url) => core.safeImageReference(url));
}

export function parseKieTaskParam(param: unknown) {
  return core.parseKieTaskParam(param);
}

export function buildTaskIntegrityFindings(input: Record<string, unknown>): RuntimeFinding[] {
  return core.buildTaskIntegrityFindings(input);
}

export function buildTaskEventDetails(input: TaskEventDetailsInput): Record<string, unknown> {
  return routeBehavior.buildTaskEventDetails(input);
}

export function buildLocalTaskExpectations(
  expected: { submitted_model?: string | null; submitted_prompt?: string | null } | null,
  expectedInputUrls?: string[]
): {
  expectedModel?: string;
  expectedPrompt?: string;
  expectedInputUrls?: string[];
} {
  return routeBehavior.buildLocalTaskExpectations(expected, expectedInputUrls);
}

export function appendRuntimeEvent(event: string, details: Record<string, unknown>) {
  return routeBehavior.appendRuntimeEventSafely(
    store.appendRuntimeEvent,
    event,
    details
  );
}

export function buildDiagnosticBundle() {
  return store.buildDiagnosticBundle();
}

export function diagnosticExportFilename(date: Date) {
  return store.diagnosticExportFilename(date);
}

export function buildDiagnosticExportResponse(
  bundle: unknown,
  filename: string
): PreparedDiagnosticResponse {
  return routeBehavior.buildDiagnosticExportResponse(bundle, filename);
}

export function buildDiagnosticExportErrorResponse(): PreparedDiagnosticResponse {
  return routeBehavior.buildDiagnosticExportErrorResponse();
}

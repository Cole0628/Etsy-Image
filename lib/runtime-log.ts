import core from "./runtime-log-core.js";
import store from "./runtime-log-store.js";

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

export function safeImageReferences(urls: string[]) {
  return urls.map((url) => core.safeImageReference(url));
}

export function parseKieTaskParam(param: unknown) {
  return core.parseKieTaskParam(param);
}

export function buildTaskIntegrityFindings(input: Record<string, unknown>): RuntimeFinding[] {
  return core.buildTaskIntegrityFindings(input);
}

export function appendRuntimeEvent(event: string, details: Record<string, unknown>) {
  try {
    return store.appendRuntimeEvent(event, details);
  } catch {
    return { ok: false };
  }
}

export function buildDiagnosticBundle() {
  try {
    return store.buildDiagnosticBundle();
  } catch {
    return null;
  }
}

export function diagnosticExportFilename(date: Date) {
  return store.diagnosticExportFilename(date);
}

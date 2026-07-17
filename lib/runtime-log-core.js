const { createHash } = require("node:crypto");

const findingDefinitions = {
  task_id_mismatch: "error",
  task_id_reused: "error",
  model_mismatch: "warning",
  prompt_mismatch: "error",
  input_images_mismatch: "error",
  result_image_reused: "error",
};

const sensitiveKeyPattern = /apiKey|authorization|cookie|token|secret|credential/i;
const promptKeyPattern = /^(prompt|fullPrompt|submittedPrompt)$/i;
const urlPattern = /https?:\/\/[^\s"'<>]+/gi;

function printable(value) {
  if (typeof value === "string") return value;
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  try {
    return String(value);
  } catch {
    return "[unprintable]";
  }
}

function fingerprint(value) {
  return createHash("sha256").update(printable(value), "utf8").digest("hex");
}

function safeImageReference(url) {
  const completeUrl = printable(url);
  try {
    const parsed = new URL(completeUrl);
    const rawFilename = parsed.pathname.split("/").filter(Boolean).pop() || "";
    let filename = rawFilename;
    try {
      filename = decodeURIComponent(rawFilename);
    } catch {
      // Keep the URL path segment when it is not valid percent-encoding.
    }
    return { host: parsed.hostname, filename, fingerprint: fingerprint(completeUrl) };
  } catch {
    return { host: "", filename: "", fingerprint: fingerprint(completeUrl) };
  }
}

function redactUrl(value) {
  return value.replace(urlPattern, (match) => {
    const trailing = match.match(/[),.;!?]+$/)?.[0] || "";
    const candidate = trailing ? match.slice(0, -trailing.length) : match;
    const reference = safeImageReference(candidate);
    return `[URL host=${reference.host} filename=${reference.filename} fingerprint=${reference.fingerprint}]${trailing}`;
  });
}

function sanitizeForLog(value, key, seen = new WeakSet()) {
  const preservePrompt = promptKeyPattern.test(key || "");
  if (sensitiveKeyPattern.test(key || "")) return "[REDACTED]";
  if (typeof value === "string") return preservePrompt ? value : redactUrl(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => (preservePrompt ? preservePromptValue(item, seen) : sanitizeForLog(item, undefined, seen)));
  }

  const output = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    output[childKey] = preservePrompt && !sensitiveKeyPattern.test(childKey)
      ? preservePromptValue(childValue, seen)
      : sanitizeForLog(childValue, childKey, seen);
  }
  return output;
}

function preservePromptValue(value, seen) {
  if (typeof value === "string" || value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => preservePromptValue(item, seen));
  const output = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    output[childKey] = sensitiveKeyPattern.test(childKey)
      ? "[REDACTED]"
      : preservePromptValue(childValue, seen);
  }
  return output;
}

function parseKieTaskParam(param) {
  let outer = param;
  try {
    if (typeof outer === "string") outer = JSON.parse(outer);
  } catch {
    return { inputUrls: [] };
  }
  if (!outer || typeof outer !== "object") return { inputUrls: [] };
  let input = outer.input;
  try {
    if (typeof input === "string") input = JSON.parse(input);
  } catch {
    input = {};
  }
  if (!input || typeof input !== "object") input = {};
  const inputUrls = Array.isArray(input.input_urls)
    ? input.input_urls.filter((url) => typeof url === "string")
    : [];
  const result = { inputUrls };
  if (typeof outer.model === "string") result.model = outer.model;
  if (typeof input.prompt === "string") result.prompt = input.prompt;
  return result;
}

function addFinding(findings, code, message, relatedTaskId) {
  const finding = { code, severity: findingDefinitions[code], message };
  if (relatedTaskId !== undefined) finding.relatedTaskId = relatedTaskId;
  findings.push(finding);
}

function sameUrlList(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length
    && left.every((url, index) => fingerprint(url) === fingerprint(right[index]));
}

function buildTaskIntegrityFindings(input = {}) {
  const findings = [];
  const parsed = parseKieTaskParam(input.returnedParam);
  if (input.requestedTaskId !== undefined && input.returnedTaskId !== undefined
    && input.requestedTaskId !== input.returnedTaskId) {
    addFinding(findings, "task_id_mismatch", "Returned task ID does not match the requested task ID.");
  }
  if (Array.isArray(input.otherTaskIds) && input.returnedTaskId !== undefined
    && input.otherTaskIds.includes(input.returnedTaskId)) {
    addFinding(findings, "task_id_reused", "Returned task ID was supplied by another task.", input.returnedTaskId);
  }
  const returnedModel = input.returnedModel !== undefined ? input.returnedModel : parsed.model;
  if (input.expectedModel !== undefined && returnedModel !== undefined
    && input.expectedModel !== returnedModel) {
    addFinding(findings, "model_mismatch", "Returned model does not match the expected model.");
  }
  if (input.expectedPrompt !== undefined && parsed.prompt !== undefined
    && input.expectedPrompt !== parsed.prompt) {
    addFinding(findings, "prompt_mismatch", "Returned prompt does not match the expected prompt.");
  }
  if (input.expectedInputUrls !== undefined && !sameUrlList(input.expectedInputUrls, parsed.inputUrls)) {
    addFinding(findings, "input_images_mismatch", "Returned input images do not match the expected images.");
  }
  const otherResults = Array.isArray(input.otherResults) ? input.otherResults : [];
  for (const resultUrl of Array.isArray(input.resultUrls) ? input.resultUrls : []) {
    const reused = otherResults.find((other) => other && fingerprint(other.url) === fingerprint(resultUrl));
    if (reused) {
      addFinding(findings, "result_image_reused", "Result image was reused by another task.", reused.taskId);
      break;
    }
  }
  return findings;
}

module.exports = {
  fingerprint,
  safeImageReference,
  sanitizeForLog,
  parseKieTaskParam,
  buildTaskIntegrityFindings,
};

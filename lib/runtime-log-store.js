const fs = require("node:fs");
const path = require("node:path");

const { sanitizeForLog } = require("./runtime-log-core.js");

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_FILES = 3;
const ACTIVE_NAME = "runtime.ndjson";

const defaultDataRoot = process.env.KIE_WORKBENCH_DATA_DIR
  ? path.join(process.env.KIE_WORKBENCH_DATA_DIR, "data")
  : path.join(process.cwd(), "data");
const defaultLogDir = path.join(defaultDataRoot, "runtime-logs");
const defaultAppVersion = require("../package.json").version;

function rotatedName(index) {
  return `runtime.${index}.ndjson`;
}

function diagnosticExportFilename(date = new Date()) {
  return `kie-runtime-diagnostic-${date.toISOString().replace(/[:.]/g, "-")}.json`;
}

function aggregateFindings(events) {
  const anomalies = {};
  for (const event of events) {
    const findings = event && event.details && Array.isArray(event.details.findings)
      ? event.details.findings
      : [];
    for (const finding of findings) {
      if (!finding || typeof finding.code !== "string" || finding.code === "") continue;
      const current = anomalies[finding.code] || { count: 0 };
      current.count += 1;
      if (typeof finding.severity === "string") current.severity = finding.severity;
      anomalies[finding.code] = current;
    }
  }
  return anomalies;
}

function createRuntimeLogStore(options = {}) {
  const logDir = options.logDir || defaultLogDir;
  const maxBytes = options.maxBytes || DEFAULT_MAX_BYTES;
  const maxFiles = Math.max(1, options.maxFiles || DEFAULT_MAX_FILES);
  const appVersion = options.appVersion || defaultAppVersion;

  function rotate() {
    const activePath = path.join(logDir, ACTIVE_NAME);
    if (!fs.existsSync(activePath)) return;
    if (maxFiles > 1) {
      const oldestPath = path.join(logDir, rotatedName(maxFiles - 1));
      if (fs.existsSync(oldestPath)) fs.rmSync(oldestPath, { force: true });
      for (let index = maxFiles - 2; index >= 1; index -= 1) {
        const source = path.join(logDir, rotatedName(index));
        if (fs.existsSync(source)) fs.renameSync(source, path.join(logDir, rotatedName(index + 1)));
      }
      fs.renameSync(activePath, path.join(logDir, rotatedName(1)));
      return;
    }
    fs.rmSync(activePath, { force: true });
  }

  function appendRuntimeEvent(event, details) {
    try {
      const entry = {
        timestamp: new Date().toISOString(),
        appVersion,
        event: sanitizeForLog(String(event ?? ""), "event"),
        details: sanitizeForLog(details),
      };
      const line = `${JSON.stringify(entry)}\n`;
      if (Buffer.byteLength(line, "utf8") > maxBytes) return { ok: false };
      fs.mkdirSync(logDir, { recursive: true });
      const activePath = path.join(logDir, ACTIVE_NAME);
      const currentSize = fs.existsSync(activePath) ? fs.statSync(activePath).size : 0;
      if (currentSize > 0 && currentSize + Buffer.byteLength(line, "utf8") > maxBytes) rotate();
      fs.appendFileSync(activePath, line, "utf8");
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  function readRuntimeEvents() {
    const events = [];
    let filesRead = 0;
    let malformedLines = 0;

    function readLogFile(filePath) {
      try {
        if (!fs.existsSync(filePath)) return;
        const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
        filesRead += 1;
        for (const line of lines) {
          if (line.trim() === "") continue;
          try {
            events.push(sanitizeForLog(JSON.parse(line)));
          } catch {
            malformedLines += 1;
          }
        }
      } catch {
        // Continue with newer files when one rotated file cannot be read.
      }
    }

    for (let index = maxFiles - 1; index >= 1; index -= 1) {
      readLogFile(path.join(logDir, rotatedName(index)));
    }
    readLogFile(path.join(logDir, ACTIVE_NAME));

    return {
      events,
      health: {
        filesRead,
        malformedLines,
        message: events.length === 0 ? "暂无运行记录" : "日志读取正常",
      },
    };
  }

  function buildDiagnosticBundle() {
    try {
      const { events, health } = readRuntimeEvents();
      return {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        app: { version: appVersion },
        runtime: { node: process.version, platform: process.platform, arch: process.arch },
        logHealth: health,
        anomalies: aggregateFindings(events),
        events,
      };
    } catch {
      return {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        app: { version: appVersion },
        runtime: { node: process.version, platform: process.platform, arch: process.arch },
        logHealth: { filesRead: 0, malformedLines: 0, message: "暂无运行记录" },
        anomalies: {},
        events: [],
      };
    }
  }

  return { appendRuntimeEvent, readRuntimeEvents, buildDiagnosticBundle };
}

const defaultStore = createRuntimeLogStore();

module.exports = {
  createRuntimeLogStore,
  diagnosticExportFilename,
  appendRuntimeEvent: (...args) => defaultStore.appendRuntimeEvent(...args),
  readRuntimeEvents: (...args) => defaultStore.readRuntimeEvents(...args),
  buildDiagnosticBundle: (...args) => defaultStore.buildDiagnosticBundle(...args),
};

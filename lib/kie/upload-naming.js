const { randomBytes } = require("node:crypto");

function sanitizeFilename(name) {
  const safe = String(name || "")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || "image.jpg";
}

function yyyymmdd(now) {
  return new Date(now).toISOString().slice(0, 10).replace(/-/g, "");
}

function buildKieUploadNames(originalName, options = {}) {
  const now = options.now ?? Date.now();
  const randomHex = options.randomHex ?? randomBytes(8).toString("hex");
  const safeName = sanitizeFilename(originalName);
  return {
    uploadPath: `kie-workbench/${yyyymmdd(now)}`,
    fileName: `${randomHex}_${safeName}`,
  };
}

module.exports = { buildKieUploadNames };

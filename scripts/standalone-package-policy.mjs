import fs from "node:fs";
import path from "node:path";

const UPLOAD_RELATIVE_PATH = path.join("public", "uploads", "kie-workbench");

function removeTree(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

export function sanitizeStandaloneOutput(root) {
  removeTree(path.join(root, "data"));

  const uploadDir = path.join(root, UPLOAD_RELATIVE_PATH);
  removeTree(uploadDir);
  fs.mkdirSync(uploadDir, { recursive: true });
}

export function assertStandaloneOutputSafe(root) {
  if (fs.existsSync(path.join(root, "data"))) {
    throw new Error("Standalone output contains local data");
  }

  const uploadDir = path.join(root, UPLOAD_RELATIVE_PATH);
  if (fs.existsSync(uploadDir) && fs.readdirSync(uploadDir).length > 0) {
    throw new Error("Standalone output contains uploaded images");
  }
}

export default {
  sanitizeStandaloneOutput,
  assertStandaloneOutputSafe,
};

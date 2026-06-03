import assert from "node:assert/strict";
import test from "node:test";

import preflight from "../lib/kie/input-url-preflight.js";

const { classifyInputImageUrl, mapKieFailureMessage } = preflight;

test("blocks local URLs before creating paid Kie tasks", () => {
  const result = classifyInputImageUrl("http://localhost:3300/uploads/image.png");

  assert.equal(result.kind, "blocked");
  assert.match(result.message, /无法被 Kie 云端拉取/);
});

test("requires stale Kie temporary URLs to be re-uploaded", () => {
  const result = classifyInputImageUrl(
    "https://tempfile.redpandaai.co/kieai/1123620/kie-workbench/image.png"
  );

  assert.equal(result.kind, "blocked");
  assert.match(result.message, /临时图片 URL 已失效或缺少上传元信息/);
});

test("accepts fresh Kie uploaded URLs with metadata", () => {
  const result = classifyInputImageUrl(
    "https://tempfile.redpandaai.co/kieai/1123620/kie-workbench/abc_image.png",
    { backend: "kie-file-upload", expiresAt: Date.UTC(2026, 5, 4) },
    { now: Date.UTC(2026, 5, 3) }
  );

  assert.equal(result.kind, "ready");
});

test("marks generic HTTPS URLs for Kie file-url mirroring", () => {
  const result = classifyInputImageUrl("https://example.com/image.png");

  assert.equal(result.kind, "mirror");
});

test("maps common Kie failures into user-facing Chinese messages", () => {
  assert.equal(
    mapKieFailureMessage("Image fetch failed. Check access settings or use our File Upload API instead."),
    "输入图无法被 Kie 云端拉取，请重新上传原图后再试。"
  );
  assert.equal(
    mapKieFailureMessage("Internal Error, Please try again later."),
    "Kie 上游生成失败，请重试本张。"
  );
});

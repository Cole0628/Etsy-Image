import assert from "node:assert/strict";
import test from "node:test";

import uploadNaming from "../lib/kie/upload-naming.js";

const { buildKieUploadNames } = uploadNaming;

test("same original filename receives unique Kie upload names", () => {
  const first = buildKieUploadNames("image.png", {
    now: Date.UTC(2026, 4, 27),
    randomHex: "aaaaaaaaaaaaaaaa",
  });
  const second = buildKieUploadNames("image.png", {
    now: Date.UTC(2026, 4, 27),
    randomHex: "bbbbbbbbbbbbbbbb",
  });

  assert.equal(first.uploadPath, "kie-workbench/20260527");
  assert.equal(second.uploadPath, "kie-workbench/20260527");
  assert.equal(first.fileName, "aaaaaaaaaaaaaaaa_image.png");
  assert.equal(second.fileName, "bbbbbbbbbbbbbbbb_image.png");
  assert.notEqual(first.fileName, second.fileName);
});

const KIE_TEMP_HOSTS = new Set(["tempfile.redpandaai.co"]);
const KIE_UPLOAD_TTL_MS = 3 * 24 * 60 * 60 * 1000;

function parseUrl(raw) {
  try {
    return new URL(String(raw || ""));
  } catch {
    return null;
  }
}

function isLocalHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function kieExpiryFromMeta(meta, now) {
  const expiresAt = numberOrNull(meta?.expiresAt);
  if (expiresAt != null) return expiresAt;
  const uploadedAt = numberOrNull(meta?.uploadedAt);
  if (uploadedAt != null) return uploadedAt + KIE_UPLOAD_TTL_MS;
  return null;
}

function classifyInputImageUrl(rawUrl, meta = {}, options = {}) {
  const parsed = parseUrl(rawUrl);
  const now = numberOrNull(options.now) ?? Date.now();
  if (!parsed || !["http:", "https:"].includes(parsed.protocol)) {
    return {
      kind: "blocked",
      message: "图片地址无效，请重新上传原图。",
    };
  }

  if (isLocalHost(parsed.hostname)) {
    return {
      kind: "blocked",
      message:
        "本机/内网图片 URL 无法被 Kie 云端拉取，请通过上传按钮重新上传原图。",
    };
  }

  if (KIE_TEMP_HOSTS.has(parsed.hostname.toLowerCase())) {
    const expiresAt = kieExpiryFromMeta(meta, now);
    if (meta?.backend === "kie-file-upload" && expiresAt != null && expiresAt > now) {
      return { kind: "ready" };
    }
    return {
      kind: "blocked",
      message:
        "旧的 Kie 临时图片 URL 已失效或缺少上传元信息，请重新上传原图后再试。",
    };
  }

  if (parsed.protocol === "https:" || parsed.protocol === "http:") {
    return { kind: "mirror" };
  }

  return {
    kind: "blocked",
    message: "图片地址协议不支持，请重新上传原图。",
  };
}

function mapKieFailureMessage(message) {
  const text = String(message || "");
  if (/image fetch failed/i.test(text)) {
    return "输入图无法被 Kie 云端拉取，请重新上传原图后再试。";
  }
  if (/internal error|upstream api service timed out|timeout|timed out/i.test(text)) {
    return "Kie 上游生成失败，请重试本张。";
  }
  return text || "Kie 生成失败，请重试本张。";
}

module.exports = {
  KIE_UPLOAD_TTL_MS,
  classifyInputImageUrl,
  mapKieFailureMessage,
};

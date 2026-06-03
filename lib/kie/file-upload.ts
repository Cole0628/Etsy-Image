import uploadNaming from "./upload-naming";

const { buildKieUploadNames } = uploadNaming as {
  buildKieUploadNames: (originalName: string) => {
    uploadPath: string;
    fileName: string;
  };
};

/**
 * Kie「文件上传」服务（与 api.kie.ai 任务接口不同域名）。
 * @see https://docs.kie.ai/file-upload-api/quickstart
 */
const DEFAULT_FILE_UPLOAD_BASE = "https://kieai.redpandaai.co";

function fileUploadBase(): string {
  return (
    process.env.KIE_FILE_UPLOAD_BASE?.trim() || DEFAULT_FILE_UPLOAD_BASE
  ).replace(/\/$/, "");
}

type StreamUploadJson = {
  success?: boolean;
  code?: number;
  msg?: string;
  data?: {
    fileUrl?: string;
    downloadUrl?: string;
    url?: string;
    fileName?: string;
    uploadPath?: string;
    fileSize?: number;
    size?: number;
    mimeType?: string;
    contentType?: string;
    uploadedAt?: string | number;
    expiresAt?: string | number;
    [key: string]: unknown;
  };
};

const KIE_UPLOAD_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export type KieUploadResult = {
  url: string;
  backend: "kie-file-upload";
  originalName: string;
  fileName?: string;
  uploadPath?: string;
  size?: number;
  mimeType?: string;
  uploadedAt: number;
  expiresAt: number;
};

function pickPublicFileUrl(data: StreamUploadJson["data"]): string | null {
  if (!data || typeof data !== "object") return null;
  const candidates = [
    data.downloadUrl,
    data.fileUrl,
    data.url,
    typeof data.file_url === "string" ? data.file_url : undefined,
  ];
  for (const u of candidates) {
    if (typeof u === "string" && /^https?:\/\//i.test(u.trim())) {
      return u.trim();
    }
  }
  for (const v of Object.values(data)) {
    if (typeof v === "string" && /^https:\/\//i.test(v) && v.length > 20) {
      return v.trim();
    }
  }
  return null;
}

function timestampMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function uploadResultFromJson(
  data: StreamUploadJson["data"],
  url: string,
  originalName: string,
  fallback: { fileName?: string; uploadPath?: string; size?: number; mimeType?: string }
): KieUploadResult {
  const uploadedAt = timestampMs(data?.uploadedAt) ?? Date.now();
  const expiresAt =
    timestampMs(data?.expiresAt) ?? uploadedAt + KIE_UPLOAD_TTL_MS;
  const size =
    typeof data?.fileSize === "number"
      ? data.fileSize
      : typeof data?.size === "number"
        ? data.size
        : fallback.size;
  const mimeType =
    typeof data?.mimeType === "string"
      ? data.mimeType
      : typeof data?.contentType === "string"
        ? data.contentType
        : fallback.mimeType;

  return {
    url,
    backend: "kie-file-upload",
    originalName,
    fileName:
      typeof data?.fileName === "string" ? data.fileName : fallback.fileName,
    uploadPath:
      typeof data?.uploadPath === "string" ? data.uploadPath : fallback.uploadPath,
    size,
    mimeType,
    uploadedAt,
    expiresAt,
  };
}

/** 将本地文件以 multipart 上传到 Kie，返回其可公网访问的 URL（用于 createTask 的 input_urls）。 */
export async function kieFileStreamUpload(
  apiKey: string,
  file: File
): Promise<KieUploadResult> {
  if (!file.type.startsWith("image/")) {
    throw new Error("仅支持图片文件");
  }

  const form = new FormData();
  const uploadNames = buildKieUploadNames(file.name || "image.jpg");
  form.append("file", file, uploadNames.fileName);
  form.append("uploadPath", uploadNames.uploadPath);
  form.append("fileName", uploadNames.fileName);

  const res = await fetch(`${fileUploadBase()}/api/file-stream-upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    cache: "no-store",
  });

  const text = await res.text();
  let json: StreamUploadJson;
  try {
    json = JSON.parse(text) as StreamUploadJson;
  } catch {
    throw new Error(
      `Kie 文件上传响应异常 (${res.status}): ${text.slice(0, 240)}`
    );
  }

  const url = pickPublicFileUrl(json.data);
  if (url) {
    return uploadResultFromJson(json.data, url, file.name || uploadNames.fileName, {
      fileName: uploadNames.fileName,
      uploadPath: uploadNames.uploadPath,
      size: file.size,
      mimeType: file.type,
    });
  }

  const ok =
    json.code === 200 ||
    json.success === true ||
    (typeof json.msg === "string" &&
      /success/i.test(json.msg) &&
      res.ok);

  const msg = json.msg || `HTTP ${res.status}`;
  if (ok && !url) {
    throw new Error(
      `Kie 文件上传已返回成功，但未解析到下载地址（downloadUrl / fileUrl）。原始响应片段：${text.slice(0, 400)}`
    );
  }
  throw new Error(`Kie 文件上传失败: ${msg}`);
}

/** 将公网 URL 先镜像到 Kie 文件服务，避免 createTask 时由生成服务直接拉第三方 URL。 */
export async function kieFileUrlUpload(
  apiKey: string,
  fileUrl: string,
  originalName?: string
): Promise<KieUploadResult> {
  const uploadNames = buildKieUploadNames(originalName || "image.jpg");
  const res = await fetch(`${fileUploadBase()}/api/file-url-upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileUrl,
      uploadPath: uploadNames.uploadPath,
      fileName: uploadNames.fileName,
    }),
    cache: "no-store",
  });

  const text = await res.text();
  let json: StreamUploadJson;
  try {
    json = JSON.parse(text) as StreamUploadJson;
  } catch {
    throw new Error(
      `Kie URL 文件上传响应异常 (${res.status}): ${text.slice(0, 240)}`
    );
  }

  const url = pickPublicFileUrl(json.data);
  if (url) {
    return uploadResultFromJson(
      json.data,
      url,
      originalName || uploadNames.fileName,
      {
        fileName: uploadNames.fileName,
        uploadPath: uploadNames.uploadPath,
      }
    );
  }

  const ok =
    json.code === 200 ||
    json.success === true ||
    (typeof json.msg === "string" &&
      /success/i.test(json.msg) &&
      res.ok);
  const msg = json.msg || `HTTP ${res.status}`;
  if (ok && !url) {
    throw new Error(
      `Kie URL 文件上传已返回成功，但未解析到下载地址（downloadUrl / fileUrl）。原始响应片段：${text.slice(0, 400)}`
    );
  }
  throw new Error(`Kie URL 文件上传失败: ${msg}`);
}

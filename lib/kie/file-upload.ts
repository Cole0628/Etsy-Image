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
    [key: string]: unknown;
  };
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

/** 将本地文件以 multipart 上传到 Kie，返回其可公网访问的 URL（用于 createTask 的 input_urls）。 */
export async function kieFileStreamUpload(
  apiKey: string,
  file: File
): Promise<string> {
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
    return url;
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

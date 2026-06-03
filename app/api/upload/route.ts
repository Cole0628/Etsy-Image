import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import { getPublicBaseUrl } from "@/lib/public-base-url";
import { getEffectiveKieApiKey } from "@/lib/settings";
import { kieFileStreamUpload } from "@/lib/kie/file-upload";

export const dynamic = "force-dynamic";

const MAX_BYTES = 20 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

function extFor(file: File): string {
  const fromMime = MIME_EXT[file.type];
  if (fromMime) return fromMime;
  const n = file.name || "";
  const ext = path.extname(n).toLowerCase();
  if (/^\.(jpe?g|png|gif|webp|avif)$/.test(ext)) return ext;
  return ".bin";
}

function uploadMetadata(file: File, backend: "kie-file-upload" | "blob" | "local") {
  return {
    backend,
    originalName: file.name || "image",
    size: file.size,
    uploadedAt: Date.now(),
  };
}

async function saveToPublicUploads(
  file: File,
  request: Request
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("仅支持图片文件");
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`单文件不超过 ${MAX_BYTES / 1024 / 1024}MB`);
  }

  const id = randomBytes(16).toString("hex");
  const ext = extFor(file);
  const relativeDir = path.join("uploads", "kie-workbench");
  const filename = `${id}${ext}`;
  const dirAbs = path.join(process.cwd(), "public", relativeDir);
  fs.mkdirSync(dirAbs, { recursive: true });
  const abs = path.join(dirAbs, filename);
  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(abs, buf);

  const base = getPublicBaseUrl(request);
  return `${base}/${relativeDir.replace(/\\/g, "/")}/${filename}`;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少 file 字段" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "仅支持图片文件" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `单文件不超过 ${MAX_BYTES / 1024 / 1024}MB` },
      { status: 400 }
    );
  }

  const apiKey = getEffectiveKieApiKey();
  if (apiKey) {
    try {
      const uploaded = await kieFileStreamUpload(apiKey, file);
      return NextResponse.json({
        ...uploaded,
        size: uploaded.size ?? file.size,
        mimeType: uploaded.mimeType ?? file.type,
        hint: "已通过 Kie 文件上传托管，生图任务可正常拉取原图。",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Kie 文件上传失败";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_") || "upload";
      const pathname = `kie-workbench/${Date.now()}_${randomBytes(8).toString("hex")}_${safeName}`;
      const blob = await put(pathname, file, {
        access: "public",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      return NextResponse.json({
        url: blob.url,
        ...uploadMetadata(file, "blob"),
        hint: "已上传至 Blob。请确保 Kie 能访问该公网 HTTPS 地址。",
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Blob 上传失败";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  try {
    const url = await saveToPublicUploads(file, request);
    return NextResponse.json({
      url,
      ...uploadMetadata(file, "local"),
      warning:
        "当前未配置 Kie API Key：返回的是本机/内网 URL，Kie 云端无法拉取，生图会报 Image fetch failed。请到「设置」保存 Key，或配置 BLOB_READ_WRITE_TOKEN。",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "上传失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

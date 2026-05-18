import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getEffectiveDownloadDir } from "@/lib/download-settings";

export const dynamic = "force-dynamic";

const MAX_DOWNLOADS = 50;

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/avif": ".avif",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const ALLOWED_IMAGE_EXTS = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".webp",
]);

function isAllowedDownloadUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return false;
  return true;
}

function extFromUrl(raw: string): string | null {
  try {
    const ext = path.extname(new URL(raw).pathname).toLowerCase();
    return ALLOWED_IMAGE_EXTS.has(ext) ? (ext === ".jpeg" ? ".jpg" : ext) : null;
  } catch {
    return null;
  }
}

function extFromContentType(contentType: string | null): string | null {
  if (!contentType) return null;
  const normalized = contentType.split(";")[0]?.trim().toLowerCase();
  return normalized ? EXT_BY_CONTENT_TYPE[normalized] ?? null : null;
}

async function nextOutputIndex(): Promise<number> {
  const outputDir = getEffectiveDownloadDir();
  await fs.mkdir(outputDir, { recursive: true });
  const entries = await fs.readdir(outputDir, { withFileTypes: true });
  let max = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = /^kie-image-(\d+)\.[^.]+$/i.exec(entry.name);
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return max + 1;
}

async function outputIndexExists(index: number): Promise<boolean> {
  const outputDir = getEffectiveDownloadDir();
  const prefix = `kie-image-${String(index).padStart(3, "0")}.`;
  const entries = await fs.readdir(outputDir, { withFileTypes: true });
  return entries.some((entry) => entry.isFile() && entry.name.startsWith(prefix));
}

async function reserveOutputIndex(startIndex: number): Promise<{
  index: number;
  lockPath: string;
}> {
  const outputDir = getEffectiveDownloadDir();
  await fs.mkdir(outputDir, { recursive: true });
  for (let index = Math.max(1, startIndex); index < startIndex + 10000; index++) {
    if (await outputIndexExists(index)) continue;

    const lockPath = path.join(
      outputDir,
      `kie-image-${String(index).padStart(3, "0")}.download`
    );
    try {
      const handle = await fs.open(lockPath, "wx");
      await handle.close();
      return { index, lockPath };
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code === "EEXIST") {
        continue;
      }
      throw e;
    }
  }
  throw new Error("无法生成下载文件名");
}

async function writeOutputImage(body: Buffer, ext: string, startIndex: number) {
  const outputDir = getEffectiveDownloadDir();
  const reservation = await reserveOutputIndex(startIndex);
  const filename = `kie-image-${String(reservation.index).padStart(3, "0")}${ext}`;
  const filePath = path.join(outputDir, filename);
  try {
    await fs.writeFile(filePath, body, { flag: "wx" });
  } catch (e) {
    await fs.unlink(reservation.lockPath).catch(() => undefined);
    if (e instanceof Error && "code" in e && e.code === "EEXIST") {
      return writeOutputImage(body, ext, reservation.index + 1);
    }
    throw e;
  }
  await fs.unlink(reservation.lockPath).catch(() => undefined);

  return {
    index: reservation.index,
    filename,
    path: filePath,
  };
}

async function saveRemoteImage(url: string, startIndex: number) {
  const upstream = await fetch(url, { redirect: "follow" });
  if (!upstream.ok) {
    throw new Error(`上游返回 ${upstream.status}`);
  }

  const contentType =
    upstream.headers.get("content-type") ?? "application/octet-stream";
  const ext = extFromUrl(url) ?? extFromContentType(contentType) ?? ".bin";
  const body = Buffer.from(await upstream.arrayBuffer());
  const file = await writeOutputImage(body, ext, startIndex);

  return {
    url,
    ...file,
    contentType,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url || !isAllowedDownloadUrl(url)) {
    return NextResponse.json({ error: "无效的下载地址" }, { status: 400 });
  }

  const upstream = await fetch(url, { redirect: "follow" });
  if (!upstream.ok) {
    return NextResponse.json(
      { error: `上游返回 ${upstream.status}` },
      { status: 502 }
    );
  }

  const contentType =
    upstream.headers.get("content-type") ?? "application/octet-stream";
  const ext = extFromUrl(url) ?? extFromContentType(contentType) ?? "";
  const disposition = `attachment; filename="kie-image${ext}"`;

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": disposition,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  let body: { url?: unknown; urls?: unknown };
  try {
    body = (await request.json()) as { url?: unknown; urls?: unknown };
  } catch {
    return NextResponse.json({ error: "无效的 JSON" }, { status: 400 });
  }

  const rawUrls = Array.isArray(body.urls) ? body.urls : [body.url];
  const urls = rawUrls.filter(
    (u): u is string => typeof u === "string" && u.trim().length > 0
  );

  if (urls.length === 0) {
    return NextResponse.json({ error: "缺少下载地址" }, { status: 400 });
  }
  if (urls.length > MAX_DOWNLOADS) {
    return NextResponse.json(
      { error: `一次最多下载 ${MAX_DOWNLOADS} 张图片` },
      { status: 400 }
    );
  }
  for (const url of urls) {
    if (!isAllowedDownloadUrl(url)) {
      return NextResponse.json({ error: `无效的下载地址：${url}` }, { status: 400 });
    }
  }

  const files: Awaited<ReturnType<typeof saveRemoteImage>>[] = [];
  const start = await nextOutputIndex();
  try {
    for (let i = 0; i < urls.length; i++) {
      files.push(await saveRemoteImage(urls[i], start + i));
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "下载失败";
    return NextResponse.json(
      { error: message, outputDir: getEffectiveDownloadDir(), files },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    outputDir: getEffectiveDownloadDir(),
    files,
  });
}

import { NextResponse } from "next/server";
import {
  getDefaultDownloadDir,
  getEffectiveDownloadDir,
  getStoredDownloadDir,
  setDownloadDir,
} from "@/lib/download-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    defaultDir: getDefaultDownloadDir(),
    storedDir: getStoredDownloadDir(),
    effectiveDir: getEffectiveDownloadDir(),
  });
}

export async function POST(request: Request) {
  let body: { dir?: unknown };
  try {
    body = (await request.json()) as { dir?: unknown };
  } catch {
    return NextResponse.json({ error: "无效的 JSON" }, { status: 400 });
  }

  if (body.dir != null && typeof body.dir !== "string") {
    return NextResponse.json({ error: "下载目录必须是文本" }, { status: 400 });
  }

  try {
    const effectiveDir = await setDownloadDir(body.dir ?? "");
    return NextResponse.json({
      ok: true,
      defaultDir: getDefaultDownloadDir(),
      storedDir: getStoredDownloadDir(),
      effectiveDir,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "保存失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

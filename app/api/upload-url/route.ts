import { NextResponse } from "next/server";
import { getEffectiveKieApiKey } from "@/lib/settings";
import { kieFileUrlUpload } from "@/lib/kie/file-upload";
import preflight from "@/lib/kie/input-url-preflight";

export const dynamic = "force-dynamic";
const { classifyInputImageUrl } = preflight as {
  classifyInputImageUrl: (url: string) => { kind: "ready" | "mirror" | "blocked"; message?: string };
};

type Body = {
  urls?: string[];
};

function safeOriginalName(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const leaf = parsed.pathname.split("/").filter(Boolean).pop();
    return leaf || "image.jpg";
  } catch {
    return "image.jpg";
  }
}

function isMirrorableUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return false;
  }
  return parsed.protocol === "https:" || parsed.protocol === "http:";
}

export async function POST(request: Request) {
  const apiKey = getEffectiveKieApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "未配置 Kie API Key，无法将 URL 镜像到 Kie 文件服务。" },
      { status: 401 }
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "无效的 JSON" }, { status: 400 });
  }

  const urls = Array.isArray(body.urls)
    ? body.urls.filter((url): url is string => typeof url === "string" && url.trim().length > 0)
    : [];
  if (urls.length === 0) {
    return NextResponse.json({ error: "缺少 urls" }, { status: 400 });
  }
  if (urls.length > 16) {
    return NextResponse.json({ error: "一次最多镜像 16 张图片 URL。" }, { status: 400 });
  }

  const invalid = urls.find((url) => !isMirrorableUrl(url));
  if (invalid) {
    return NextResponse.json(
      {
        error: `该图片 URL 无法被 Kie 云端拉取，请重新上传原图：${invalid}`,
      },
      { status: 400 }
    );
  }
  const blocked = urls
    .map((url) => ({ url, result: classifyInputImageUrl(url) }))
    .find((item) => item.result.kind === "blocked");
  if (blocked) {
    return NextResponse.json(
      {
        error: `${blocked.result.message ?? "图片 URL 不可用"} (${blocked.url})`,
      },
      { status: 400 }
    );
  }

  try {
    const items = [];
    for (const url of urls) {
      const uploaded = await kieFileUrlUpload(apiKey, url, safeOriginalName(url));
      items.push({
        ...uploaded,
        sourceUrl: url,
        hint: "已将 URL 镜像到 Kie 文件服务。",
      });
    }
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "URL 镜像上传失败" },
      { status: 502 }
    );
  }
}

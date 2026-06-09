import { NextResponse } from "next/server";
import {
  getNetworkSettings,
  isValidProxyUrl,
  setNetworkSettings,
  type NetworkProxyMode,
} from "@/lib/network-settings";

export const dynamic = "force-dynamic";

function isProxyMode(value: unknown): value is NetworkProxyMode {
  return value === "none" || value === "env" || value === "manual";
}

export async function GET() {
  return NextResponse.json(getNetworkSettings());
}

export async function POST(request: Request) {
  let body: { proxyMode?: unknown; proxyUrl?: unknown };
  try {
    body = (await request.json()) as { proxyMode?: unknown; proxyUrl?: unknown };
  } catch {
    return NextResponse.json({ error: "无效的 JSON" }, { status: 400 });
  }

  if (!isProxyMode(body.proxyMode)) {
    return NextResponse.json({ error: "无效的代理模式" }, { status: 400 });
  }

  const proxyUrl = typeof body.proxyUrl === "string" ? body.proxyUrl.trim() : "";
  if (body.proxyMode === "manual" && !isValidProxyUrl(proxyUrl)) {
    return NextResponse.json(
      { error: "手动代理地址必须是 http:// 或 https:// 开头，例如 http://127.0.0.1:7890" },
      { status: 400 }
    );
  }

  setNetworkSettings({ proxyMode: body.proxyMode, proxyUrl });
  return NextResponse.json(getNetworkSettings());
}

import { NextResponse } from "next/server";
import {
  getEffectiveKieApiKey,
  getStoredApiKey,
  setStoredApiKey,
} from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const fromEnv = Boolean(process.env.KIE_API_KEY?.trim());
  const stored = getStoredApiKey();
  const configured = Boolean(getEffectiveKieApiKey());
  let masked: string | null = null;
  if (stored && stored.length > 6) {
    masked = `${stored.slice(0, 3)}…${stored.slice(-4)}`;
  } else if (stored) {
    masked = "•••";
  }
  return NextResponse.json({
    configured,
    source: fromEnv ? "env" : stored ? "database" : "none",
    maskedDatabaseKey: fromEnv ? null : masked,
    hint: fromEnv
      ? "当前使用环境变量 KIE_API_KEY；数据库中的 Key 不会覆盖环境变量。"
      : null,
  });
}

export async function POST(request: Request) {
  if (process.env.KIE_API_KEY?.trim()) {
    return NextResponse.json(
      {
        error:
          "已设置环境变量 KIE_API_KEY，无法在界面覆盖。请移除环境变量后再保存。",
      },
      { status: 400 }
    );
  }
  let body: { key?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "无效的 JSON" }, { status: 400 });
  }
  const key = body.key?.trim();
  if (!key) {
    return NextResponse.json({ error: "Key 不能为空" }, { status: 400 });
  }
  setStoredApiKey(key);
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { getEffectiveKieApiKey } from "@/lib/settings";
import { kieRecordInfo } from "@/lib/kie/client";

export const dynamic = "force-dynamic";

export async function POST() {
  const apiKey = getEffectiveKieApiKey();
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "未配置 API Key" }, { status: 400 });
  }

  const res = await kieRecordInfo(apiKey, "__cursor_workbench_probe__");
  if (res.code === 401) {
    return NextResponse.json({ ok: false, error: "鉴权失败（401）" }, { status: 401 });
  }
  if (res.code === 404 || res.code === 422) {
    return NextResponse.json({
      ok: true,
      detail: "已连通 Kie（查询返回任务不存在属预期）",
    });
  }
  return NextResponse.json({
    ok: res.code === 200,
    code: res.code,
    msg: res.msg,
  });
}

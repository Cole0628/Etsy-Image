import { NextResponse } from "next/server";
import { updateGenerationByTaskId } from "@/lib/db";
import {
  kieRecordInfo,
  kieErrorMessage,
  parseResultUrls,
} from "@/lib/kie/client";
import { getEffectiveKieApiKey } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await context.params;
  const apiKey = getEffectiveKieApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "未配置 Kie API Key" }, { status: 401 });
  }

  const info = await kieRecordInfo(apiKey, taskId);
  if (info.code !== 200 || info.data == null) {
    return NextResponse.json(
      { error: kieErrorMessage(info), raw: info },
      { status: 502 }
    );
  }

  const data = info.data;
  const resultUrls = parseResultUrls(data.resultJson);

  const now = Date.now();
  const resultJsonStr =
    data.state === "success" && resultUrls.length > 0
      ? JSON.stringify({ resultUrls })
      : null;

  const patch: Parameters<typeof updateGenerationByTaskId>[1] = {
    state: data.state,
    fail_msg: data.failMsg ?? null,
    fail_code: data.failCode ?? null,
    credits: data.creditsConsumed ?? null,
    updated_at: now,
  };
  if (resultJsonStr != null) {
    patch.result_urls = resultJsonStr;
  }
  updateGenerationByTaskId(taskId, patch);

  return NextResponse.json({
    taskId: data.taskId,
    model: data.model,
    state: data.state,
    param: data.param,
    resultUrls,
    failMsg: data.failMsg,
    failCode: data.failCode,
    progress: data.progress,
    creditsConsumed: data.creditsConsumed,
    costTime: data.costTime,
  });
}

import { NextResponse } from "next/server";
import {
  getGenerationByTaskId,
  listGenerations,
  updateGenerationByTaskId,
} from "@/lib/db";
import { parseInputPayload } from "@/lib/input-payload";
import {
  kieRecordInfo,
  kieErrorMessage,
  parseResultUrls,
} from "@/lib/kie/client";
import preflight from "@/lib/kie/input-url-preflight";
import { getEffectiveKieApiKey } from "@/lib/settings";
import {
  appendRuntimeEvent,
  buildTaskIntegrityFindings,
  parseKieTaskParam,
  safeImageReferences,
} from "@/lib/runtime-log";

export const dynamic = "force-dynamic";
const { mapKieFailureMessage } = preflight as {
  mapKieFailureMessage: (message: string | undefined | null) => string;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await context.params;
  const queryStartedAt = Date.now();
  const expected = getGenerationByTaskId(taskId);
  appendRuntimeEvent("kie.task.query.request", {
    requestedTaskId: taskId,
    expectedModel: expected?.submitted_model ?? undefined,
  });
  const apiKey = getEffectiveKieApiKey();
  if (!apiKey) {
    appendRuntimeEvent("kie.task.query.failed", {
      requestedTaskId: taskId,
      statusCode: 401,
      error: "KIE API key is not configured.",
      elapsedMs: Date.now() - queryStartedAt,
    });
    return NextResponse.json({ error: "未配置 Kie API Key" }, { status: 401 });
  }

  const info = await kieRecordInfo(apiKey, taskId);
  if (info.code !== 200 || info.data == null) {
    appendRuntimeEvent("kie.task.query.failed", {
      requestedTaskId: taskId,
      statusCode: info.code,
      error: "KIE task query failed.",
      elapsedMs: Date.now() - queryStartedAt,
    });
    return NextResponse.json(
      { error: mapKieFailureMessage(kieErrorMessage(info)), raw: info },
      { status: 502 }
    );
  }

  const data = info.data;
  const resultUrls = parseResultUrls(data.resultJson);
  const parsedParam = parseKieTaskParam(data.param) as {
    prompt?: string;
    inputUrls: string[];
  };
  const expectedInputs = expected
    ? parseInputPayload(expected.input_urls).merged
    : [];
  const history = listGenerations(500);
  const otherRows = history.filter((row) => row.id !== expected?.id);
  const otherResults = otherRows.flatMap((row) => {
    if (!row.result_urls) return [];
    try {
      const parsed = JSON.parse(row.result_urls) as { resultUrls?: unknown };
      return Array.isArray(parsed.resultUrls)
        ? parsed.resultUrls
            .filter((url): url is string => typeof url === "string")
            .map((url) => ({ taskId: row.task_id, url }))
        : [];
    } catch {
      return [];
    }
  });
  const findings = buildTaskIntegrityFindings({
    requestedTaskId: taskId,
    expectedModel: expected?.submitted_model ?? undefined,
    expectedPrompt: expected?.submitted_prompt ?? undefined,
    expectedInputUrls: expectedInputs,
    returnedTaskId: data.taskId,
    returnedModel: data.model,
    returnedParam: data.param,
    resultUrls,
    otherTaskIds: otherRows.map((row) => row.task_id),
    otherResults,
  });

  const now = Date.now();
  const successWithoutImages = data.state === "success" && resultUrls.length === 0;
  const state = successWithoutImages ? "fail" : data.state;
  const failMsg = successWithoutImages
    ? "生成成功但没有返回图片 URL，请重试本张。"
    : data.state === "fail"
      ? mapKieFailureMessage(data.failMsg)
      : data.failMsg ?? null;
  const resultJsonStr =
    data.state === "success" && resultUrls.length > 0
      ? JSON.stringify({ resultUrls })
      : null;

  const patch: Parameters<typeof updateGenerationByTaskId>[1] = {
    state,
    fail_msg: failMsg,
    fail_code: data.failCode ?? null,
    credits: data.creditsConsumed ?? null,
    updated_at: now,
  };
  if (resultJsonStr != null) {
    patch.result_urls = resultJsonStr;
  }
  updateGenerationByTaskId(taskId, patch);

  appendRuntimeEvent("kie.task.query.response", {
    requestedTaskId: taskId,
    returnedTaskId: data.taskId,
    state,
    prompt: parsedParam.prompt,
    inputImages: safeImageReferences(parsedParam.inputUrls),
    resultImages: safeImageReferences(resultUrls),
    elapsedMs: Date.now() - queryStartedAt,
    findings,
  });

  return NextResponse.json({
    taskId: data.taskId,
    model: data.model,
    state,
    param: data.param,
    resultUrls,
    failMsg,
    failCode: data.failCode,
    progress: data.progress,
    creditsConsumed: data.creditsConsumed,
    costTime: data.costTime,
  });
}

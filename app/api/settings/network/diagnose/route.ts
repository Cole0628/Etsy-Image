import { NextResponse } from "next/server";
import { getEffectiveKieApiKey } from "@/lib/settings";
import { kieFetch } from "@/lib/kie/proxy-fetch";

export const dynamic = "force-dynamic";

type CheckResult = {
  id: string;
  label: string;
  ok: boolean;
  status?: number;
  code?: number;
  ms?: number;
  detail: string;
  contentType?: string | null;
  responseKind?: "json" | "html" | "text" | "empty";
  sample?: string;
  solution?: string;
};

function classifyText(text: string): CheckResult["responseKind"] {
  const trimmed = text.trim();
  if (!trimmed) return "empty";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  if (/^<!doctype|^<html/i.test(trimmed)) return "html";
  return "text";
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/fetch failed|failed to fetch|networkerror|econnreset|enotfound|etimedout|econnrefused/i.test(message)) {
    return "连接失败：这台电脑目前无法访问 Kie 服务。";
  }
  return message || "连接失败";
}

function solutionForFailure(item: Omit<CheckResult, "solution">): string | undefined {
  if (item.ok) return undefined;
  if (item.id === "api-key" || item.status === 401 || item.code === 401) {
    return "打开「API Key」页面，重新保存正确的 Kie API Key，然后再测试。";
  }
  if (item.responseKind === "html") {
    return "请求被返回成网页，通常是网络网关、登录页、杀毒软件网页防护或 DNS 拦截。换一个网络或关闭网页防护后再测试。";
  }
  if (/连接失败|timeout|timed out|fetch failed|网络|防火墙|杀毒/i.test(item.detail)) {
    return "换一个网络或 VPN 节点后再测试；如果仍失败，把测试结果复制给开发者。";
  }
  if (item.status && item.status >= 500) {
    return "Kie 服务端暂时异常，可以稍后再测试。";
  }
  return "重新测试一次；如果仍失败，把测试结果复制给开发者。";
}

async function checkFetch(params: {
  id: string;
  label: string;
  url: string;
  init?: RequestInit;
  okStatuses?: number[];
  okKieCodes?: number[];
}): Promise<CheckResult> {
  const start = Date.now();
  try {
    const res = await kieFetch(params.url, {
      ...params.init,
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const text = await res.text();
    const responseKind = classifyText(text);
    let kieCode: number | undefined;
    if (responseKind === "json") {
      try {
        const parsed = JSON.parse(text) as { code?: unknown };
        if (typeof parsed.code === "number") kieCode = parsed.code;
      } catch {
        kieCode = undefined;
      }
    }
    const httpOk = res.ok || (params.okStatuses ?? []).includes(res.status);
    const ok =
      params.okKieCodes && kieCode != null
        ? params.okKieCodes.includes(kieCode)
        : httpOk;
    const item: Omit<CheckResult, "solution"> = {
      id: params.id,
      label: params.label,
      ok,
      status: res.status,
      code: kieCode,
      ms: Date.now() - start,
      contentType: res.headers.get("content-type"),
      responseKind,
      sample: text.trim().slice(0, 180),
      detail: ok
        ? kieCode != null
          ? `已通过预期校验（HTTP ${res.status}，Kie code ${kieCode}）。`
          : `已连通（HTTP ${res.status}）。`
        : responseKind === "html"
          ? `返回了网页 HTML（HTTP ${res.status}）。`
          : kieCode === 401
            ? "Kie API Key 鉴权失败（Kie code 401）。"
            : kieCode != null
              ? `Kie 返回异常 code ${kieCode}（HTTP ${res.status}）。`
              : `返回异常（HTTP ${res.status}）。`,
    };
    return { ...item, solution: solutionForFailure(item) };
  } catch (e) {
    const item: Omit<CheckResult, "solution"> = {
      id: params.id,
      label: params.label,
      ok: false,
      ms: Date.now() - start,
      detail: errorMessage(e),
    };
    return { ...item, solution: solutionForFailure(item) };
  }
}

export async function POST() {
  const apiKey = getEffectiveKieApiKey();
  const checks: CheckResult[] = [
    {
      id: "local-service",
      label: "本地服务",
      ok: true,
      detail: "本地服务正常。",
    },
    {
      id: "api-key",
      label: "API Key",
      ok: Boolean(apiKey),
      detail: apiKey ? "已保存 API Key。" : "未保存 API Key。",
      solution: apiKey
        ? undefined
        : "打开「API Key」页面，粘贴 Kie API Key 并保存，然后再测试。",
    },
  ];

  checks.push(
    await checkFetch({
      id: "kie-upload",
      label: "Kie 图片上传服务",
      url: "https://kieai.redpandaai.co/api/file-stream-upload",
      init: { method: "GET" },
      okStatuses: [200, 400, 401, 404, 405],
    })
  );

  if (apiKey) {
    checks.push(
      await checkFetch({
        id: "kie-api",
        label: "Kie 生图 API",
        url: "https://api.kie.ai/api/v1/jobs/recordInfo?taskId=__network_diagnostic__",
        init: {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` },
        },
        okStatuses: [400, 404, 422],
        okKieCodes: [404, 422],
      })
    );
  } else {
    checks.push({
      id: "kie-api",
      label: "Kie 生图 API",
      ok: false,
      detail: "未保存 API Key，跳过 Kie API 测试。",
      solution: "打开「API Key」页面保存有效的 Kie API Key 后再测试。",
    });
  }

  return NextResponse.json({
    ok: checks.every((item) => item.ok),
    checkedAt: new Date().toISOString(),
    checks,
  });
}

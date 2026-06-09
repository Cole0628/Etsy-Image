import { NextResponse } from "next/server";
import { getEffectiveKieApiKey } from "@/lib/settings";
import { getNetworkSettings } from "@/lib/network-settings";
import { getKieProxyInfo, kieFetch } from "@/lib/kie/proxy-fetch";

export const dynamic = "force-dynamic";

type CheckResult = {
  id: string;
  label: string;
  ok: boolean;
  status?: number;
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
    return "连接失败：网络、VPN/代理、防火墙或杀毒软件可能拦截了内置 node.exe。";
  }
  return message || "连接失败";
}

function solutionForFailure(
  item: Omit<CheckResult, "solution">,
  proxy: ReturnType<typeof getKieProxyInfo>
): string | undefined {
  if (item.ok) return undefined;
  if (item.id === "api-key") {
    return "打开「API Key」页面，重新保存有效的 Kie API Key，然后回到这里重新诊断。";
  }
  if (item.id === "proxy") {
    return "如果已经开了 VPN，请在 VPN 软件里找到 HTTP/HTTPS 代理地址，填到「手动代理地址」。常见格式是 http://127.0.0.1:7890、http://127.0.0.1:10809 或 http://127.0.0.1:10808。";
  }
  if (item.status === 401) {
    return "这台电脑已经连到 Kie，但 API Key 没通过鉴权。请重新保存正确的 Kie API Key。";
  }
  if (item.responseKind === "html") {
    return "请求被返回成网页，通常是代理登录页、公司网关、杀毒软件网页防护或 DNS 劫持。优先在本页设置手动代理；如果已经设置，换一个 VPN 节点或关闭杀毒软件的 HTTPS/网页防护后重试。";
  }
  if (/连接失败|timeout|timed out|fetch failed|网络|代理|防火墙|杀毒/i.test(item.detail)) {
    return proxy.enabled
      ? "当前已经启用代理但仍连接失败，通常是代理端口填错、VPN 没开放本地 HTTP 代理，或该节点不能访问 Kie。请换 VPN 节点，并确认代理地址端口正确后重试。"
      : "当前没有启用软件内代理。请在本页选择「手动代理」，填入 VPN 的本地 HTTP/HTTPS 代理地址，保存后重新诊断。";
  }
  if (item.status && item.status >= 500) {
    return "Kie 服务端暂时异常。可以稍后重试；如果只有这台电脑反复出现，请先按上面的代理方案处理。";
  }
  return "按上方代理设置重新测试；如果仍失败，把诊断结果复制给开发者查看。";
}

async function checkFetch(params: {
  id: string;
  label: string;
  url: string;
  init?: RequestInit;
  okStatuses?: number[];
  proxy: ReturnType<typeof getKieProxyInfo>;
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
    const okStatuses = params.okStatuses ?? [];
    const ok = res.ok || okStatuses.includes(res.status);
    const sample = text.trim().slice(0, 180);
    const item: Omit<CheckResult, "solution"> = {
      id: params.id,
      label: params.label,
      ok,
      status: res.status,
      ms: Date.now() - start,
      contentType: res.headers.get("content-type"),
      responseKind,
      sample,
      detail: ok
        ? `已连通（HTTP ${res.status}）`
        : responseKind === "html"
          ? `返回了网页 HTML（HTTP ${res.status}），可能被代理/网关/登录页拦截。`
          : `返回异常（HTTP ${res.status}）`,
    };
    return { ...item, solution: solutionForFailure(item, params.proxy) };
  } catch (e) {
    const item: Omit<CheckResult, "solution"> = {
      id: params.id,
      label: params.label,
      ok: false,
      ms: Date.now() - start,
      detail: errorMessage(e),
    };
    return { ...item, solution: solutionForFailure(item, params.proxy) };
  }
}

export async function POST() {
  const apiKey = getEffectiveKieApiKey();
  const network = getNetworkSettings();
  const proxy = getKieProxyInfo();
  const checks: CheckResult[] = [
    {
      id: "local-service",
      label: "本地服务",
      ok: true,
      detail: "本地服务正常响应诊断请求。",
    },
    {
      id: "api-key",
      label: "API Key",
      ok: Boolean(apiKey),
      detail: apiKey ? "已保存 API Key。" : "未保存 API Key，请先到 API Key 页面保存。",
      solution: apiKey
        ? undefined
        : "打开「API Key」页面，粘贴 Kie API Key 并保存，然后重新诊断。",
    },
    {
      id: "proxy",
      label: "代理设置",
      ok: network.proxyMode !== "manual" || Boolean(proxy.proxyUrl),
      detail: proxy.enabled
        ? `当前使用代理：${proxy.proxyUrl}`
        : network.proxyMode === "env"
          ? "选择了环境变量代理，但没有检测到 HTTPS_PROXY / HTTP_PROXY。"
          : network.proxyMode === "manual"
          ? "选择了手动代理，但地址为空或无效。"
          : "未使用代理。",
      solution:
        network.proxyMode === "manual" && !proxy.proxyUrl
          ? "手动代理必须填写完整地址，例如 http://127.0.0.1:7890。保存后重新诊断。"
          : undefined,
    },
  ];

  checks.push(
    await checkFetch({
      id: "kie-upload",
      label: "Kie 图片上传服务",
      url: "https://kieai.redpandaai.co/api/file-stream-upload",
      init: { method: "GET" },
      okStatuses: [400, 401, 404, 405],
      proxy,
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
        proxy,
      })
    );
  } else {
    checks.push({
      id: "kie-api",
      label: "Kie 生图 API",
      ok: false,
      detail: "未保存 API Key，跳过 Kie API 鉴权测试。",
      solution: "打开「API Key」页面保存有效的 Kie API Key 后再诊断。",
    });
  }

  const ok = checks.every((item) => item.ok);
  return NextResponse.json({
    ok,
    checkedAt: new Date().toISOString(),
    proxy,
    checks,
  });
}

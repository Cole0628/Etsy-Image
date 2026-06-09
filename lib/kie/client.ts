import { kieFetch } from "@/lib/kie/proxy-fetch";

const KIE_BASE = "https://api.kie.ai";

export type KieTaskState =
  | "waiting"
  | "queuing"
  | "generating"
  | "success"
  | "fail";

export type CreateImageTaskInput = {
  model: string;
  callBackUrl?: string;
  input: {
    prompt: string;
    input_urls: string[];
    aspect_ratio?: string;
    resolution?: string;
  };
};

export type CreateTaskResponse = {
  code: number;
  msg: string;
  data?: { taskId: string };
};

export type RecordInfoData = {
  taskId: string;
  model?: string;
  state: KieTaskState;
  param?: string;
  resultJson?: string;
  failCode?: string;
  failMsg?: string;
  costTime?: number;
  completeTime?: number;
  createTime?: number;
  updateTime?: number;
  progress?: number;
  creditsConsumed?: number;
};

export type RecordInfoResponse = {
  code: number;
  msg: string;
  data?: RecordInfoData | null;
};

function headers(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  } as const;
}

function networkFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/fetch failed|failed to fetch|networkerror|econnreset|enotfound|etimedout|econnrefused/i.test(message)) {
    return "无法连接 Kie 服务，请检查这台电脑的网络、VPN/代理、防火墙或杀毒软件。";
  }
  return message || "连接 Kie 服务失败。";
}

async function parseKieJson<T extends { code: number; msg: string }>(
  res: Response,
  fallbackCode: number
): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.trim().slice(0, 80);
    return {
      code: res.status || fallbackCode,
      msg:
        preview.startsWith("<")
          ? "Kie 接口返回了网页而不是 JSON，通常是网络代理、登录页、防火墙或网关拦截导致。"
          : `Kie 接口响应异常：${preview || "空响应"}`,
    } as T;
  }
}

export async function kieCreateTask(
  apiKey: string,
  body: CreateImageTaskInput
): Promise<CreateTaskResponse> {
  try {
    const res = await kieFetch(`${KIE_BASE}/api/v1/jobs/createTask`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return await parseKieJson<CreateTaskResponse>(res, 502);
  } catch (e) {
    return { code: 0, msg: networkFailureMessage(e) };
  }
}

export async function kieRecordInfo(
  apiKey: string,
  taskId: string
): Promise<RecordInfoResponse> {
  const url = new URL(`${KIE_BASE}/api/v1/jobs/recordInfo`);
  url.searchParams.set("taskId", taskId);
  try {
    const res = await kieFetch(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    return await parseKieJson<RecordInfoResponse>(res, 502);
  } catch (e) {
    return { code: 0, msg: networkFailureMessage(e), data: null };
  }
}

export function parseResultUrls(resultJson: string | undefined): string[] {
  if (!resultJson) return [];
  try {
    const parsed = JSON.parse(resultJson) as { resultUrls?: string[] };
    if (!Array.isArray(parsed.resultUrls)) return [];
    return parsed.resultUrls.filter((u) => typeof u === "string");
  } catch {
    return [];
  }
}

export function kieErrorMessage(res: { code: number; msg: string }): string {
  if (res.msg) return `${res.msg} (${res.code})`;
  return `Kie error ${res.code}`;
}

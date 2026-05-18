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

export async function kieCreateTask(
  apiKey: string,
  body: CreateImageTaskInput
): Promise<CreateTaskResponse> {
  const res = await fetch(`${KIE_BASE}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json()) as CreateTaskResponse;
  return json;
}

export async function kieRecordInfo(
  apiKey: string,
  taskId: string
): Promise<RecordInfoResponse> {
  const url = new URL(`${KIE_BASE}/api/v1/jobs/recordInfo`);
  url.searchParams.set("taskId", taskId);
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  const json = (await res.json()) as RecordInfoResponse;
  return json;
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

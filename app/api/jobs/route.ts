import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { insertGeneration, getModelById } from "@/lib/db";
import { isAllowedInputImageUrl } from "@/lib/input-url";
import {
  buildAugmentedPrompt,
  buildInputUrlsStorage,
} from "@/lib/input-payload";
import {
  kieCreateTask,
  kieErrorMessage,
  type CreateImageTaskInput,
} from "@/lib/kie/client";
import { getEffectiveKieApiKey } from "@/lib/settings";
import {
  isWorkbenchId,
  LEGACY_WORKBENCH_ID,
  type WorkbenchId,
} from "@/lib/workbenches";

export const dynamic = "force-dynamic";

const ASPECTS = new Set(["auto", "1:1", "9:16", "16:9", "4:3", "3:4"]);
const RESOLUTIONS = new Set(["1K", "2K", "4K"]);
const MAX_INPUTS = 16;
const MAX_BATCH = 10;

type Body = {
  prompt: string;
  modelId: string;
  workbench_id?: string;
  workbench_definition?: string;
  aspect_ratio?: string;
  resolution?: string;
  /** 新版：产品图（至少 1 张） */
  product_urls?: string[];
  reference_urls?: string[];
  /** 1–10，默认 1 */
  image_count?: number;
  /** 兼容旧客户端：等同全部作为产品图 */
  input_urls?: string[];
};

function normalizeUrlList(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return x.filter((u): u is string => typeof u === "string");
}

function validateUrls(label: string, urls: string[]) {
  for (const u of urls) {
    if (!isAllowedInputImageUrl(u)) {
      return `无效或不支持的图片地址（${label}）: ${u}`;
    }
  }
  return null;
}

export async function POST(request: Request) {
  const apiKey = getEffectiveKieApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "未配置 Kie API Key。请在设置页保存，或设置环境变量 KIE_API_KEY。" },
      { status: 401 }
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "无效的 JSON" }, { status: 400 });
  }

  if (!body.prompt?.trim()) {
    return NextResponse.json({ error: "prompt 必填" }, { status: 400 });
  }

  if (body.workbench_id != null && !isWorkbenchId(body.workbench_id)) {
    return NextResponse.json({ error: "未知工作台" }, { status: 400 });
  }
  const workbenchId: WorkbenchId =
    body.workbench_id == null ? LEGACY_WORKBENCH_ID : body.workbench_id;
  const workbenchDefinition =
    typeof body.workbench_definition === "string"
      ? body.workbench_definition.trim()
      : "";

  let productUrls = normalizeUrlList(body.product_urls);
  let referenceUrls = normalizeUrlList(body.reference_urls);
  const legacyInputUrls = normalizeUrlList(body.input_urls);
  if (
    productUrls.length === 0 &&
    referenceUrls.length === 0 &&
    legacyInputUrls.length > 0
  ) {
    if (workbenchId === "default") {
      referenceUrls = legacyInputUrls;
    } else {
      productUrls = legacyInputUrls;
    }
  }

  if (workbenchId !== "default" && productUrls.length === 0) {
    return NextResponse.json(
      { error: "请至少上传一张产品图（product_urls）" },
      { status: 400 }
    );
  }

  const merged = [...productUrls, ...referenceUrls];
  if (merged.length > MAX_INPUTS) {
    return NextResponse.json(
      { error: `输入图合计最多 ${MAX_INPUTS} 张（产品 + 参考）` },
      { status: 400 }
    );
  }

  const errP = validateUrls("产品图", productUrls);
  if (errP) return NextResponse.json({ error: errP }, { status: 400 });
  const errR = validateUrls("参考图", referenceUrls);
  if (errR) return NextResponse.json({ error: errR }, { status: 400 });

  let imageCount = Number(body.image_count);
  if (!Number.isFinite(imageCount) || imageCount < 1) imageCount = 1;
  imageCount = Math.min(MAX_BATCH, Math.floor(imageCount));

  const modelRow = getModelById(body.modelId);
  if (!modelRow || !modelRow.enabled) {
    return NextResponse.json({ error: "模型不可用或未找到" }, { status: 400 });
  }

  const aspect = body.aspect_ratio ?? "auto";
  if (!ASPECTS.has(aspect)) {
    return NextResponse.json({ error: "无效的 aspect_ratio" }, { status: 400 });
  }

  const resolution = body.resolution ?? "1K";
  if (!RESOLUTIONS.has(resolution)) {
    return NextResponse.json({ error: "无效的 resolution" }, { status: 400 });
  }

  const inputUrlsJson = buildInputUrlsStorage(productUrls, referenceUrls);
  const batchId = randomUUID();
  const pc = productUrls.length;
  const rc = referenceUrls.length;
  const jobs: { id: string; taskId: string }[] = [];

  for (let i = 0; i < imageCount; i++) {
    const fullPrompt = buildAugmentedPrompt({
      userPrompt: body.prompt.trim(),
      workbenchId,
      workbenchDefinition,
      productCount: pc,
      referenceCount: rc,
      variantIndex: i,
      variantTotal: imageCount,
    });

    const kieBody: CreateImageTaskInput = {
      model: modelRow.kie_model,
      input: {
        prompt: fullPrompt,
        input_urls: merged,
        aspect_ratio: aspect,
        resolution,
      },
    };

    const created = await kieCreateTask(apiKey, kieBody);
    if (created.code !== 200 || !created.data?.taskId) {
      const msg = kieErrorMessage(created);
      if (jobs.length === 0) {
        return NextResponse.json(
          { error: msg, batchId, jobs: [] },
          { status: 502 }
        );
      }
      return NextResponse.json({
        error: `后续任务创建失败：${msg}`,
        batchId,
        jobs,
        partial: true,
      });
    }

    const id = randomUUID();
    const now = Date.now();
    insertGeneration({
      id,
      task_id: created.data.taskId,
      model: modelRow.id,
      prompt: body.prompt.trim(),
      aspect_ratio: aspect,
      resolution,
      input_urls: inputUrlsJson,
      state: "waiting",
      result_urls: null,
      fail_msg: null,
      fail_code: null,
      credits: null,
      created_at: now,
      updated_at: now,
      batch_id: imageCount > 1 ? batchId : null,
      batch_index: imageCount > 1 ? i : null,
      batch_size: imageCount > 1 ? imageCount : null,
      workbench_id: workbenchId,
      workbench_definition: workbenchDefinition || null,
    });

    jobs.push({ id, taskId: created.data.taskId });
  }

  return NextResponse.json({
    batchId,
    jobs,
    imageCount,
  });
}

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { insertGeneration, getModelById } from "@/lib/db";
import { isAllowedInputImageUrl } from "@/lib/input-url";
import {
  buildAugmentedPrompt,
  buildInputUrlsStorage,
  normalizeInputImageList,
  type InputImageMeta,
} from "@/lib/input-payload";
import preflight from "@/lib/kie/input-url-preflight";
import { kieFileUrlUpload } from "@/lib/kie/file-upload";
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
const { classifyInputImageUrl, mapKieFailureMessage } = preflight as {
  classifyInputImageUrl: (
    url: string,
    meta?: Partial<InputImageMeta>,
    options?: { now?: number }
  ) => { kind: "ready" | "mirror" | "blocked"; message?: string };
  mapKieFailureMessage: (message: string | undefined | null) => string;
};

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
  product_images?: InputImageMeta[];
  reference_images?: InputImageMeta[];
  /** 1–10，默认 1 */
  image_count?: number;
  /** 兼容旧客户端：等同全部作为产品图 */
  input_urls?: string[];
};

function normalizeUrlList(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return x.filter((u): u is string => typeof u === "string");
}

function inputsFromBody(images: unknown, urls: unknown): InputImageMeta[] {
  const imageList = normalizeInputImageList(images);
  if (imageList.length > 0) return imageList;
  return normalizeUrlList(urls).map((url) => ({ url }));
}

function sourceNameForUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname.split("/").filter(Boolean).pop() || "image.jpg";
  } catch {
    return "image.jpg";
  }
}

async function prepareInputImages(
  apiKey: string,
  label: string,
  inputs: InputImageMeta[]
): Promise<InputImageMeta[]> {
  const ready: InputImageMeta[] = [];
  for (const input of inputs) {
    if (!isAllowedInputImageUrl(input.url)) {
      throw new Error(`无效或不支持的图片地址（${label}）: ${input.url}`);
    }
    const classification = classifyInputImageUrl(input.url, input);
    if (classification.kind === "blocked") {
      throw new Error(`${label}：${classification.message ?? "图片 URL 不可用"} (${input.url})`);
    }
    if (classification.kind === "ready") {
      ready.push(input);
      continue;
    }
    const uploaded = await kieFileUrlUpload(
      apiKey,
      input.url,
      input.originalName || sourceNameForUrl(input.url)
    );
    ready.push({
      ...input,
      ...uploaded,
      url: uploaded.url,
      sourceUrl: input.sourceUrl || input.url,
    });
  }
  return ready;
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

  let productInputs = inputsFromBody(body.product_images, body.product_urls);
  let referenceInputs = inputsFromBody(body.reference_images, body.reference_urls);
  const legacyInputUrls = normalizeUrlList(body.input_urls);
  if (
    productInputs.length === 0 &&
    referenceInputs.length === 0 &&
    legacyInputUrls.length > 0
  ) {
    if (workbenchId === "default") {
      referenceInputs = legacyInputUrls.map((url) => ({ url }));
    } else {
      productInputs = legacyInputUrls.map((url) => ({ url }));
    }
  }

  if (workbenchId !== "default" && productInputs.length === 0) {
    return NextResponse.json(
      { error: "请至少上传一张产品图（product_urls）" },
      { status: 400 }
    );
  }

  if (workbenchId === "sku-background" && referenceInputs.length === 0) {
    return NextResponse.json(
      { error: "请至少上传一张背景图（reference_urls）" },
      { status: 400 }
    );
  }

  if (workbenchId === "sku-background" && productInputs.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `SKU 产品图最多 ${MAX_BATCH} 张（每张生成 1 个任务）` },
      { status: 400 }
    );
  }

  const merged = [...productInputs, ...referenceInputs];
  if (merged.length > MAX_INPUTS) {
    return NextResponse.json(
      { error: `输入图合计最多 ${MAX_INPUTS} 张（产品 + 参考）` },
      { status: 400 }
    );
  }

  try {
    productInputs = await prepareInputImages(apiKey, "产品图", productInputs);
    referenceInputs = await prepareInputImages(
      apiKey,
      workbenchId === "sku-background" ? "背景图" : "参考图",
      referenceInputs
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "输入图不可用，请重新上传原图。" },
      { status: 400 }
    );
  }

  const productUrls = productInputs.map((item) => item.url);
  const referenceUrls = referenceInputs.map((item) => item.url);

  let imageCount = Number(body.image_count);
  if (!Number.isFinite(imageCount) || imageCount < 1) imageCount = 1;
  imageCount = Math.min(MAX_BATCH, Math.floor(imageCount));
  const batchSize =
    workbenchId === "sku-background" ? productInputs.length : imageCount;

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

  const batchId = randomUUID();
  const jobs: {
    id: string;
    taskId: string;
    batchIndex: number;
    productUrls: string[];
    referenceUrls: string[];
    productImages: InputImageMeta[];
    referenceImages: InputImageMeta[];
  }[] = [];

  for (let i = 0; i < batchSize; i++) {
    const taskProductUrls =
      workbenchId === "sku-background" ? [productUrls[i]] : productUrls;
    const taskProductInputs =
      workbenchId === "sku-background" ? [productInputs[i]] : productInputs;
    const taskMerged = [...taskProductUrls, ...referenceUrls];
    const fullPrompt = buildAugmentedPrompt({
      userPrompt: body.prompt.trim(),
      workbenchId,
      workbenchDefinition,
      productCount: taskProductUrls.length,
      referenceCount: referenceUrls.length,
      variantIndex: i,
      variantTotal: batchSize,
    });

    const kieBody: CreateImageTaskInput = {
      model: modelRow.kie_model,
      input: {
        prompt: fullPrompt,
        input_urls: taskMerged,
        aspect_ratio: aspect,
        resolution,
      },
    };

    const created = await kieCreateTask(apiKey, kieBody);
    if (created.code !== 200 || !created.data?.taskId) {
      const msg = mapKieFailureMessage(kieErrorMessage(created));
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
    const taskInputUrlsJson = buildInputUrlsStorage(
      taskProductInputs,
      referenceInputs
    );
    insertGeneration({
      id,
      task_id: created.data.taskId,
      model: modelRow.id,
      prompt: body.prompt.trim(),
      aspect_ratio: aspect,
      resolution,
      input_urls: taskInputUrlsJson,
      state: "waiting",
      result_urls: null,
      fail_msg: null,
      fail_code: null,
      credits: null,
      created_at: now,
      updated_at: now,
      batch_id: batchSize > 1 ? batchId : null,
      batch_index: batchSize > 1 ? i : null,
      batch_size: batchSize > 1 ? batchSize : null,
      workbench_id: workbenchId,
      workbench_definition: workbenchDefinition || null,
    });

    jobs.push({
      id,
      taskId: created.data.taskId,
      batchIndex: i,
      productUrls: taskProductUrls,
      referenceUrls,
      productImages: taskProductInputs,
      referenceImages: referenceInputs,
    });
  }

  return NextResponse.json({
    batchId,
    jobs,
    imageCount: batchSize,
  });
}

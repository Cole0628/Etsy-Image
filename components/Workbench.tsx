"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAllowedInputImageUrl } from "@/lib/input-url";
import { parseInputPayload } from "@/lib/input-payload";
import {
  EMPTY_WORKBENCH_DEFINITIONS,
  getWorkbenchLabel,
  isWorkbenchId,
  WORKBENCH_OPTIONS,
  type WorkbenchId,
} from "@/lib/workbenches";

type ModelRow = {
  id: string;
  label: string;
  enabled: number;
  sort_order: number;
  is_default: number;
  kie_model: string;
};

type Generation = {
  id: string;
  task_id: string;
  model: string;
  prompt: string;
  aspect_ratio: string | null;
  resolution: string | null;
  input_urls: string;
  state: string;
  result_urls: string | null;
  fail_msg: string | null;
  fail_code: string | null;
  credits: number | null;
  created_at: number;
  updated_at: number;
  batch_id?: string | null;
  batch_index?: number | null;
  batch_size?: number | null;
  workbench_id?: string | null;
  workbench_definition?: string | null;
};

type ImageSlot = {
  id: string;
  url: string;
};

type BatchOutputItem = {
  taskId: string;
  submittedAt: number;
  state: string;
  resultUrls: string[];
  failMsg?: string;
  costTimeMs?: number | null;
  clientElapsedMs?: number | null;
};

type ActiveProject = {
  id: string;
  label: string;
  prompt: string;
  workbenchId: WorkbenchId;
  submittedAt: number;
  items: BatchOutputItem[];
};

type DownloadedFile = {
  filename: string;
  path: string;
};

type HistoryProject = {
  key: string;
  rows: Generation[];
  prompt: string;
  model: string;
  workbenchId: WorkbenchId;
  state: string;
  createdAt: number;
  resultUrls: string[];
};

type WorkbenchSettingsItem = {
  id: WorkbenchId;
  label: string;
  definition: string;
};

type WorkbenchDraft = {
  v: 1;
  workbenchId: WorkbenchId;
  modelId: string;
  prompt: string;
  aspect: string;
  resolution: string;
  imageCount: number;
  productSlots: ImageSlot[];
  refSlots: ImageSlot[];
  pasteProduct: string;
  pasteRef: string;
  activeProjects: ActiveProject[];
  selectedActiveProjectId?: string | null;
  batchOutputs?: BatchOutputItem[] | null;
  pollStartAt?: number | null;
};

const ASPECT_OPTIONS = ["auto", "1:1", "9:16", "16:9", "4:3", "3:4"] as const;
const RES_OPTIONS = ["1K", "2K", "4K"] as const;
const STORY_SET_DEFAULT_COUNT = 9;
const WORKBENCH_DRAFT_KEY = "kie-workbench:draft:v1";

const POLL_MS = 3000;
const TIMEOUT_MS = 15 * 60 * 1000;

function isProductWorkbench(id: WorkbenchId): boolean {
  return id === "etsy" || id === "story-set" || id === "sku-background";
}

function normalizeImageSlots(value: unknown): ImageSlot[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is ImageSlot =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as ImageSlot).id === "string" &&
        typeof (item as ImageSlot).url === "string"
    )
    .map((item) => ({ id: item.id, url: item.url }));
}

function normalizeBatchOutputs(value: unknown): BatchOutputItem[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter(
      (item): item is BatchOutputItem =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as BatchOutputItem).taskId === "string" &&
        typeof (item as BatchOutputItem).submittedAt === "number" &&
        typeof (item as BatchOutputItem).state === "string"
    )
    .map((item) => ({
      taskId: item.taskId,
      submittedAt: item.submittedAt,
      state: item.state,
      resultUrls: Array.isArray(item.resultUrls)
        ? item.resultUrls.filter((url): url is string => typeof url === "string")
        : [],
      failMsg: typeof item.failMsg === "string" ? item.failMsg : undefined,
      costTimeMs:
        typeof item.costTimeMs === "number" && Number.isFinite(item.costTimeMs)
          ? item.costTimeMs
          : null,
      clientElapsedMs:
        typeof item.clientElapsedMs === "number" &&
        Number.isFinite(item.clientElapsedMs)
          ? item.clientElapsedMs
        : null,
    }));
}

function normalizeActiveProjects(value: unknown): ActiveProject[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is ActiveProject =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as ActiveProject).id === "string" &&
        typeof (item as ActiveProject).label === "string" &&
        typeof (item as ActiveProject).prompt === "string" &&
        isWorkbenchId((item as ActiveProject).workbenchId) &&
        typeof (item as ActiveProject).submittedAt === "number"
    )
    .map((item) => ({
      id: item.id,
      label: item.label,
      prompt: item.prompt,
      workbenchId: item.workbenchId,
      submittedAt: item.submittedAt,
      items: normalizeBatchOutputs(item.items) ?? [],
    }))
    .filter((item) => item.items.length > 0);
}

function readWorkbenchDraft(): WorkbenchDraft | null {
  try {
    const raw = window.localStorage.getItem(WORKBENCH_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkbenchDraft>;
    if (parsed.v !== 1 || !isWorkbenchId(parsed.workbenchId)) return null;
    const imageCount = Number(parsed.imageCount);
    const activeProjects = normalizeActiveProjects(parsed.activeProjects);
    const batchOutputs = normalizeBatchOutputs(parsed.batchOutputs);
    const legacySubmittedAt =
      typeof parsed.pollStartAt === "number" && Number.isFinite(parsed.pollStartAt)
        ? parsed.pollStartAt
        : batchOutputs?.[0]?.submittedAt ?? Date.now();
    return {
      v: 1,
      workbenchId: parsed.workbenchId,
      modelId: typeof parsed.modelId === "string" ? parsed.modelId : "",
      prompt: typeof parsed.prompt === "string" ? parsed.prompt : "",
      aspect:
        typeof parsed.aspect === "string" && ASPECT_OPTIONS.includes(parsed.aspect as never)
          ? parsed.aspect
          : "auto",
      resolution:
        typeof parsed.resolution === "string" &&
        RES_OPTIONS.includes(parsed.resolution as never)
          ? parsed.resolution
          : "1K",
      imageCount: Number.isFinite(imageCount)
        ? Math.min(10, Math.max(1, Math.floor(imageCount)))
        : 1,
      productSlots: normalizeImageSlots(parsed.productSlots),
      refSlots: normalizeImageSlots(parsed.refSlots),
      pasteProduct:
        typeof parsed.pasteProduct === "string" ? parsed.pasteProduct : "",
      pasteRef: typeof parsed.pasteRef === "string" ? parsed.pasteRef : "",
      activeProjects:
        activeProjects.length > 0
          ? activeProjects
          : batchOutputs?.length
            ? [
                {
                  id: `legacy:${legacySubmittedAt}`,
                  label: "当前项目",
                  prompt: typeof parsed.prompt === "string" ? parsed.prompt : "",
                  workbenchId: parsed.workbenchId,
                  submittedAt: legacySubmittedAt,
                  items: batchOutputs,
                },
              ]
            : [],
      selectedActiveProjectId:
        typeof parsed.selectedActiveProjectId === "string"
          ? parsed.selectedActiveProjectId
          : null,
    };
  } catch {
    return null;
  }
}

function parseResultUrls(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as { resultUrls?: unknown };
    if (!Array.isArray(v.resultUrls)) return [];
    return v.resultUrls.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function formatGenDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function splitImageUrlText(raw: string): string[] {
  const seen = new Set<string>();
  return raw
    .split(/[\s,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

function sortProjectRows(rows: Generation[]): Generation[] {
  return [...rows].sort((a, b) => {
    const ai = a.batch_index ?? Number.MAX_SAFE_INTEGER;
    const bi = b.batch_index ?? Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.created_at - b.created_at;
  });
}

function summarizeProjectState(rows: Generation[]): string {
  if (rows.every((g) => g.state === "success")) return "success";
  if (rows.some((g) => g.state === "success")) return "partial";
  return rows[0]?.state ?? "unknown";
}

function buildHistoryProjects(rows: Generation[]): HistoryProject[] {
  const groups = new Map<string, Generation[]>();
  for (const row of rows) {
    const key = row.batch_id ? `batch:${row.batch_id}` : `single:${row.id}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return [...groups.entries()]
    .map(([key, groupedRows]) => {
      const sorted = sortProjectRows(groupedRows);
      const first = sorted[0];
      const resultUrls = sorted.flatMap((row) => parseResultUrls(row.result_urls));
      return {
        key,
        rows: sorted,
        prompt: first?.prompt ?? "",
        model: first?.model ?? "",
        workbenchId: isWorkbenchId(first?.workbench_id)
          ? first.workbench_id
          : "etsy",
        state: summarizeProjectState(sorted),
        createdAt: Math.min(...sorted.map((row) => row.created_at)),
        resultUrls,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export default function Workbench() {
  const [uploadBackend, setUploadBackend] = useState<"kie-file-upload" | "blob" | "local">("local");
  const [kieKeyConfigured, setKieKeyConfigured] = useState(false);
  const [dragOverProduct, setDragOverProduct] = useState(false);
  const [dragOverRef, setDragOverRef] = useState(false);
  const [uploadHint, setUploadHint] = useState<string | null>(null);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [modelId, setModelId] = useState<string>("");
  const [workbenchId, setWorkbenchId] = useState<WorkbenchId>("default");
  const [workbenchDefinitions, setWorkbenchDefinitions] = useState<
    Record<WorkbenchId, string>
  >({ ...EMPTY_WORKBENCH_DEFINITIONS });
  const [definitionSaving, setDefinitionSaving] = useState(false);
  const [definitionStatus, setDefinitionStatus] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<string>("auto");
  const [resolution, setResolution] = useState<string>("1K");
  const [imageCount, setImageCount] = useState(1);
  const [productSlots, setProductSlots] = useState<ImageSlot[]>([]);
  const [refSlots, setRefSlots] = useState<ImageSlot[]>([]);
  const [pasteProduct, setPasteProduct] = useState("");
  const [pasteRef, setPasteRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadKeys, setDownloadKeys] = useState<Set<string>>(() => new Set());
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [activeProjects, setActiveProjects] = useState<ActiveProject[]>([]);
  const [selectedActiveProjectId, setSelectedActiveProjectId] = useState<string | null>(null);
  const [history, setHistory] = useState<Generation[]>([]);
  const activeProjectsRef = useRef<ActiveProject[]>([]);
  const fileInputProductRef = useRef<HTMLInputElement>(null);
  const fileInputRefRef = useRef<HTMLInputElement>(null);
  const dragDepthProductRef = useRef(0);
  const dragDepthRefRef = useRef(0);
  const lastDropProductRef = useRef(0);
  const lastDropRefRef = useRef(0);
  const draftLoadedRef = useRef(false);

  activeProjectsRef.current = activeProjects;
  const activeTaskCount = activeProjects.reduce(
    (sum, project) => sum + project.items.length,
    0
  );

  const loadBootstrap = useCallback(async () => {
    const r = await fetch("/api/bootstrap");
    const j = (await r.json()) as {
      uploadBackend?: "kie-file-upload" | "blob" | "local";
      kieKeyConfigured?: boolean;
    };
    setUploadBackend(j.uploadBackend ?? "local");
    setKieKeyConfigured(Boolean(j.kieKeyConfigured));
  }, []);

  const loadModels = useCallback(async () => {
    const r = await fetch("/api/models");
    const j = (await r.json()) as { items: ModelRow[] };
    setModels(j.items.filter((m) => m.enabled));
    const def =
      j.items.find((m) => m.enabled && m.is_default)?.id ??
      j.items.find((m) => m.enabled)?.id ??
      "";
    setModelId((prev) => (prev && j.items.some((x) => x.id === prev) ? prev : def));
  }, []);

  const loadHistory = useCallback(async () => {
    const r = await fetch("/api/history");
    const j = (await r.json()) as { items: Generation[] };
    setHistory(j.items);
  }, []);

  const loadWorkbenchSettings = useCallback(async () => {
    const r = await fetch("/api/settings/workbench");
    const j = (await r.json()) as { items?: WorkbenchSettingsItem[] };
    const next = { ...EMPTY_WORKBENCH_DEFINITIONS };
    for (const item of j.items ?? []) {
      if (isWorkbenchId(item.id)) {
        next[item.id] = item.definition ?? "";
      }
    }
    setWorkbenchDefinitions(next);
  }, []);

  useEffect(() => {
    const draft = readWorkbenchDraft();
    if (draft) {
      setWorkbenchId(draft.workbenchId);
      setModelId(draft.modelId);
      setPrompt(draft.prompt);
      setAspect(draft.aspect);
      setResolution(draft.resolution);
      setImageCount(draft.imageCount);
      setProductSlots(draft.productSlots);
      setRefSlots(draft.refSlots);
      setPasteProduct(draft.pasteProduct);
      setPasteRef(draft.pasteRef);
      setActiveProjects(draft.activeProjects);
      setSelectedActiveProjectId(
        draft.selectedActiveProjectId && draft.activeProjects.some((p) => p.id === draft.selectedActiveProjectId)
          ? draft.selectedActiveProjectId
          : draft.activeProjects[0]?.id ?? null
      );
    }
    draftLoadedRef.current = true;
  }, []);

  useEffect(() => {
    void loadBootstrap();
    void loadModels();
    void loadHistory();
    void loadWorkbenchSettings();
  }, [loadBootstrap, loadModels, loadHistory, loadWorkbenchSettings]);

  useEffect(() => {
    if (activeProjects.length === 0) {
      if (selectedActiveProjectId !== null) setSelectedActiveProjectId(null);
      return;
    }
    if (!selectedActiveProjectId || !activeProjects.some((p) => p.id === selectedActiveProjectId)) {
      setSelectedActiveProjectId(activeProjects[0].id);
    }
  }, [activeProjects, selectedActiveProjectId]);

  useEffect(() => {
    if (!draftLoadedRef.current) return;
    const draft: WorkbenchDraft = {
      v: 1,
      workbenchId,
      modelId,
      prompt,
      aspect,
      resolution,
      imageCount,
      productSlots,
      refSlots,
      pasteProduct,
      pasteRef,
      activeProjects,
      selectedActiveProjectId,
    };
    try {
      window.localStorage.setItem(WORKBENCH_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* Ignore local storage quota or privacy mode failures. */
    }
  }, [
    workbenchId,
    modelId,
    prompt,
    aspect,
    resolution,
    imageCount,
    productSlots,
    refSlots,
    pasteProduct,
    pasteRef,
    activeProjects,
    selectedActiveProjectId,
  ]);

  const productWorkbench = isProductWorkbench(workbenchId);
  const skuBackgroundWorkbench = workbenchId === "sku-background";
  const inputCount = productWorkbench
    ? productSlots.length + refSlots.length
    : refSlots.length;
  const currentWorkbenchDefinition = workbenchDefinitions[workbenchId] ?? "";
  const promptPlaceholder =
    workbenchId === "story-set"
      ? "描述这套图的故事、用途、场景、情绪与必须展示的卖点……"
      : workbenchId === "etsy"
      ? "描述希望如何基于产品图生成展示图……"
      : workbenchId === "sku-background"
      ? "描述 SKU 换背景的商业风格、构图要求、保留细节与禁止项；避免悬空手、断手、AI感人体……"
      : "描述你想生成的图片……";
  const referenceLabel =
    workbenchId === "story-set"
      ? "套图参考"
      : skuBackgroundWorkbench
        ? "背景图"
        : "参考图";
  const selectedActiveProject =
    activeProjects.find((project) => project.id === selectedActiveProjectId) ??
    activeProjects[0] ??
    null;
  const currentResultUrls = useMemo(
    () =>
      selectedActiveProject?.items.flatMap((item) => item.resultUrls) ?? [],
    [selectedActiveProject]
  );
  const historyProjects = useMemo(
    () => buildHistoryProjects(history).filter((project) => project.workbenchId === workbenchId),
    [history, workbenchId]
  );

  const setDownloadActive = (key: string, active: boolean) => {
    setDownloadKeys((prev) => {
      const next = new Set(prev);
      if (active) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const updateWorkbenchDefinition = (value: string) => {
    setWorkbenchDefinitions((prev) => ({ ...prev, [workbenchId]: value }));
    setDefinitionStatus(null);
  };

  const saveWorkbenchDefinition = async () => {
    setDefinitionSaving(true);
    setDefinitionStatus(null);
    try {
      const r = await fetch("/api/settings/workbench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: workbenchId,
          definition: currentWorkbenchDefinition,
        }),
      });
      const j = (await r.json()) as {
        items?: WorkbenchSettingsItem[];
        error?: string;
      };
      if (!r.ok) {
        throw new Error(j.error || "保存工作台定义失败");
      }
      const next = { ...EMPTY_WORKBENCH_DEFINITIONS };
      for (const item of j.items ?? []) {
        if (isWorkbenchId(item.id)) {
          next[item.id] = item.definition ?? "";
        }
      }
      setWorkbenchDefinitions(next);
      setDefinitionStatus("已保存");
    } catch (e) {
      setDefinitionStatus(e instanceof Error ? e.message : "保存工作台定义失败");
    } finally {
      setDefinitionSaving(false);
    }
  };

  const getAvailableUploadSlots = (kind: "product" | "reference") => {
    const remainingTotal = Math.max(0, 16 - inputCount);
    if (!productWorkbench) {
      return Math.max(0, 16 - refSlots.length);
    }
    if (skuBackgroundWorkbench && kind === "product") {
      return Math.min(remainingTotal, Math.max(0, 10 - productSlots.length));
    }
    return remainingTotal;
  };

  const uploadLimitLabel = (kind: "product" | "reference") => {
    if (skuBackgroundWorkbench && kind === "product") {
      return "SKU 产品图最多 10 张，且 SKU 产品图与背景图合计最多 16 张。";
    }
    if (productWorkbench) {
      return workbenchId === "story-set"
        ? "产品图与套图参考合计最多 16 张。"
        : skuBackgroundWorkbench
          ? "SKU 产品图与背景图合计最多 16 张。"
          : "产品图与参考图合计最多 16 张。";
    }
    return "参考图最多 16 张。";
  };

  const addUrls = (kind: "product" | "reference") => {
    const raw = kind === "product" ? pasteProduct.trim() : pasteRef.trim();
    if (!raw) return;
    const urls = splitImageUrlText(raw);
    if (urls.length === 0) return;
    const invalid = urls.find((url) => !isAllowedInputImageUrl(url));
    if (invalid) {
      setError(
        `请输入有效地址：公网 https，或本机 http://localhost / http://127.0.0.1 …（无效：${invalid}）`
      );
      return;
    }
    const available = getAvailableUploadSlots(kind);
    if (urls.length > available) {
      setError(`本次最多还能添加 ${available} 张。${uploadLimitLabel(kind)}`);
      return;
    }
    const slots = urls.map((url) => ({ id: crypto.randomUUID(), url }));
    if (kind === "product") {
      setProductSlots((s) => [...s, ...slots]);
      setPasteProduct("");
    } else {
      setRefSlots((s) => [...s, ...slots]);
      setPasteRef("");
    }
    setError(null);
  };

  const onFiles = async (files: FileList | null, kind: "product" | "reference") => {
    if (!files?.length) return;
    const fileItems = Array.from(files);
    const available = getAvailableUploadSlots(kind);
    if (fileItems.length > available) {
      setError(`本次最多还能上传 ${available} 张。${uploadLimitLabel(kind)}`);
      return;
    }
    setBusy(true);
    setError(null);
    setUploadHint(null);
    try {
      for (const file of fileItems) {
        const fd = new FormData();
        fd.set("file", file);
        const r = await fetch("/api/upload", { method: "POST", body: fd });
        const j = (await r.json()) as {
          url?: string;
          error?: string;
          warning?: string;
          hint?: string;
        };
        if (!r.ok) throw new Error(j.error || "上传失败");
        if (!j.url) throw new Error("上传无返回 URL");
        const url = j.url;
        const slot: ImageSlot = { id: crypto.randomUUID(), url };
        if (kind === "product") {
          setProductSlots((s) => [...s, slot]);
        } else {
          setRefSlots((s) => [...s, slot]);
        }
        if (j.warning) setUploadHint(j.warning);
        else if (j.hint) setUploadHint(j.hint);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setBusy(false);
    }
  };

  const removeSlot = (kind: "product" | "reference", id: string) => {
    if (kind === "product") {
      setProductSlots((s) => s.filter((x) => x.id !== id));
    } else {
      setRefSlots((s) => s.filter((x) => x.id !== id));
    }
  };

  const saveImages = async (urls: string[], key: string) => {
    if (urls.length === 0) return;
    setDownloadActive(key, true);
    setError(null);
    setDownloadMessage(null);
    try {
      const r = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const j = (await r.json()) as {
        error?: string;
        outputDir?: string;
        files?: DownloadedFile[];
      };
      if (!r.ok) {
        throw new Error(j.error || "下载失败");
      }
      const files = j.files ?? [];
      const outputDir = j.outputDir ?? "下载目录";
      if (files.length === 1) {
        setDownloadMessage(`已保存到 ${outputDir}\\${files[0].filename}`);
      } else {
        setDownloadMessage(
          `已保存 ${files.length} 张到 ${outputDir}：${files
            .map((file) => file.filename)
            .join("、")}`
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "下载失败");
    } finally {
      setDownloadActive(key, false);
    }
  };

  const startJob = async () => {
    setError(null);
    if (!modelId) {
      setError("请选择模型（或到「模型」页启用一个默认模型）。");
      return;
    }
    if (!prompt.trim()) {
      setError("请填写 Prompt。");
      return;
    }
    if (productWorkbench && productSlots.length === 0) {
      setError(
        workbenchId === "story-set"
          ? "请至少添加一张产品图（用于保持套图中的产品一致性）。"
          : skuBackgroundWorkbench
            ? "请至少添加一张 SKU 产品图（每张 SKU 会生成 1 个换背景任务）。"
          : "请至少添加一张产品图（用于保持产品一致性）。"
      );
      return;
    }
    if (skuBackgroundWorkbench && refSlots.length === 0) {
      setError("请至少添加一张背景图。");
      return;
    }
    if (skuBackgroundWorkbench && productSlots.length > 10) {
      setError("SKU 产品图最多 10 张（每张生成 1 个任务）。");
      return;
    }
    if (inputCount > 16) {
      setError(
        productWorkbench
          ? workbenchId === "story-set"
            ? "产品图与套图参考合计最多 16 张。"
            : skuBackgroundWorkbench
              ? "SKU 产品图与背景图合计最多 16 张。"
              : "产品图与参考图合计最多 16 张。"
          : "参考图最多 16 张。"
      );
      return;
    }
    const n = Math.min(10, Math.max(1, Math.floor(imageCount)));
    setBusy(true);
    try {
      const r = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          prompt: prompt.trim(),
          workbench_id: workbenchId,
          workbench_definition: currentWorkbenchDefinition,
          product_urls: productWorkbench ? productSlots.map((s) => s.url) : [],
          reference_urls: refSlots.map((s) => s.url),
          image_count: n,
          aspect_ratio: aspect,
          resolution,
        }),
      });
      const j = (await r.json()) as {
        batchId?: string;
        imageCount?: number;
        jobs?: { id: string; taskId: string }[];
        error?: string;
        partial?: boolean;
      };
      if (!r.ok) {
        throw new Error(j.error || "创建任务失败");
      }
      if (!j.jobs?.length) {
        throw new Error(j.error || "未返回任务列表");
      }
      if (j.partial && j.error) {
        setError(j.error);
      }
      const now = Date.now();
      const taskCount = j.imageCount ?? j.jobs.length;
      const project: ActiveProject = {
        id: j.batchId ?? crypto.randomUUID(),
        label: `${getWorkbenchLabel(workbenchId)} · ${taskCount} 张`,
        prompt: prompt.trim(),
        workbenchId,
        submittedAt: now,
        items: j.jobs.map((job) => ({
          taskId: job.taskId,
          submittedAt: now,
          state: "waiting",
          resultUrls: [],
        })),
      };
      setActiveProjects((prev) => [project, ...prev]);
      setSelectedActiveProjectId(project.id);
      void loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建任务失败");
    } finally {
      setBusy(false);
    }
  };

  const pollingKey = activeProjects
    .flatMap((project) =>
      project.items.map((item) => `${project.id}:${item.taskId}:${item.state}`)
    )
    .join("|");

  useEffect(() => {
    const currentProjects = activeProjectsRef.current;
    if (currentProjects.length === 0) return;
    const allDone = currentProjects.every((project) =>
      project.items.every((item) => item.state === "success" || item.state === "fail")
    );
    if (allDone) {
      void loadHistory();
      return;
    }

    let cancelled = false;

    const tick = async () => {
      const snapshot = activeProjectsRef.current;
      if (snapshot.length === 0) return;

      const next = await Promise.all(
        snapshot.map(async (project) => {
          const timedOut = Date.now() - project.submittedAt > TIMEOUT_MS;
          const items = await Promise.all(
            project.items.map(async (b) => {
              if (b.state === "success" || b.state === "fail") return b;
              if (timedOut) {
                return {
                  ...b,
                  state: "fail",
                  failMsg: "轮询超时（15 分钟），请稍后在历史记录中查看任务状态。",
                };
              }
              const r = await fetch(`/api/jobs/${encodeURIComponent(b.taskId)}`);
              const j = (await r.json()) as {
                state?: string;
                resultUrls?: string[];
                failMsg?: string;
                error?: string;
                costTime?: number;
              };
              if (!r.ok) {
                return {
                  ...b,
                  state: "fail",
                  failMsg: j.error || "查询任务失败",
                };
              }
              const st = j.state ?? "unknown";
              const urls = j.resultUrls ?? [];
              const costRaw = j.costTime;
              const costTimeMs =
                typeof costRaw === "number" && Number.isFinite(costRaw) && costRaw > 0
                  ? costRaw
                  : null;
              let clientElapsedMs = b.clientElapsedMs;
              if (
                st === "success" &&
                clientElapsedMs == null &&
                (costTimeMs == null || costTimeMs <= 0)
              ) {
                clientElapsedMs = Date.now() - b.submittedAt;
              }
              return {
                ...b,
                state: st,
                resultUrls: urls,
                failMsg: j.failMsg,
                costTimeMs: costTimeMs ?? b.costTimeMs,
                clientElapsedMs,
              };
            })
          );
          return { ...project, items };
        })
      );

      if (!cancelled) {
        setActiveProjects(next);
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pollingKey, loadHistory, activeTaskCount]);

  const applyHistoryProject = (project: HistoryProject) => {
    const rows = sortProjectRows(project.rows);
    const g = rows[0];
    if (!g) return;
    setWorkbenchId(project.workbenchId);
    setPrompt(g.prompt);
    setAspect(g.aspect_ratio || "auto");
    setResolution(g.resolution || "1K");
    setModelId(models.some((m) => m.id === g.model) ? g.model : modelId);
    setImageCount(
      Math.min(10, Math.max(1, Math.floor(g.batch_size ?? rows.length) || 1))
    );
    const { product, reference } = parseInputPayload(g.input_urls);
    setProductSlots(product.map((url) => ({ id: crypto.randomUUID(), url })));
    setRefSlots(reference.map((url) => ({ id: crypto.randomUUID(), url })));
    const submittedAt = Math.min(...rows.map((row) => row.created_at));
    const projectPreview: ActiveProject = {
      id: project.key,
      label: `${getWorkbenchLabel(project.workbenchId)} · 历史项目`,
      prompt: project.prompt,
      workbenchId: project.workbenchId,
      submittedAt,
      items: rows.map((row) => {
        const elapsed =
          row.state === "success" && row.updated_at > row.created_at
            ? row.updated_at - row.created_at
            : null;
        return {
          taskId: row.task_id,
          submittedAt: row.created_at,
          state: row.state,
          resultUrls: parseResultUrls(row.result_urls),
          failMsg: row.fail_msg || undefined,
          costTimeMs: null,
          clientElapsedMs: elapsed,
        };
      }),
    };
    setActiveProjects((prev) => [
      projectPreview,
      ...prev.filter((item) => item.id !== projectPreview.id),
    ]);
    setSelectedActiveProjectId(projectPreview.id);
    setError(null);
    setDownloadMessage(null);
  };

  const uploadIntro = useMemo(
    () =>
      uploadBackend === "kie-file-upload"
        ? "已配置 Kie Key：图片会先传到 Kie 文件服务，生图时可被云端拉取。"
        : uploadBackend === "blob"
          ? "当前使用 Vercel Blob（公网 HTTPS）。"
          : "当前写入本机 public/uploads。若未配置 Kie Key，Kie 无法拉取 localhost 图片，生图会失败。",
    [uploadBackend]
  );

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-canvas-border bg-white p-4 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">工作台</h2>
            <p className="mt-1 text-xs text-ink-muted">
              当前：{getWorkbenchLabel(workbenchId)}
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-canvas-border bg-canvas-muted p-1">
            {WORKBENCH_OPTIONS.map((item) => {
              const active = item.id === workbenchId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setWorkbenchId(item.id);
                    if (item.id === "story-set") {
                      setImageCount(STORY_SET_DEFAULT_COUNT);
                    }
                    setDefinitionStatus(null);
                    setError(null);
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "bg-white text-ink shadow-sm"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
        <label className="mt-4 block text-xs font-medium text-ink-muted">
          工作台定义
        </label>
        <textarea
          value={currentWorkbenchDefinition}
          onChange={(e) => updateWorkbenchDefinition(e.target.value)}
          rows={3}
          className="mt-1 w-full resize-y rounded-md border border-canvas-border px-2 py-2 text-sm outline-none ring-accent focus:ring-2"
          placeholder="写下这个工作台后续生成时要长期遵守的要求。"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-faint">
            提交任务时会与当前 Prompt 一起发送。
          </p>
          <div className="flex items-center gap-2">
            {definitionStatus && (
              <span className="text-xs text-ink-muted">{definitionStatus}</span>
            )}
            <button
              type="button"
              onClick={() => void saveWorkbenchDefinition()}
              disabled={definitionSaving}
              className="rounded-md border border-canvas-border bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-canvas-muted disabled:opacity-50"
            >
              {definitionSaving ? "保存中…" : "保存定义"}
            </button>
          </div>
        </div>
      </section>

      <div className="grid min-h-[560px] grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="lg:col-span-4">
          <div className="flex h-full flex-col rounded-xl border border-canvas-border bg-white p-4 shadow-panel">
            <h2 className="text-sm font-semibold text-ink">原图</h2>
            <p className="mt-1 text-xs text-ink-muted">
              {workbenchId === "story-set"
                ? "两栏分别上传：左侧为产品图（保持整套图产品一致），右侧为套图参考（建议放入主图、场景图、特写图、包装图、使用图、氛围图等）。均支持多选文件与 URL。"
                : workbenchId === "etsy"
                    ? "两栏分别上传：左侧为产品图（保持产品一致，适合 Etsy 展示），右侧为参考图（仅参考氛围、光影、风格与摆放）。均支持多选文件与 URL。"
                  : skuBackgroundWorkbench
                    ? "两栏分别上传：左侧为 SKU 产品图（每张会生成 1 个任务），右侧为背景图（保留场景、光影、透视与氛围，并替换原背景产品；避免悬空手、断手和 AI 感人体）。均支持多选文件与 URL。"
                  : "可上传参考图，也可以只填写 Prompt。支持多选文件与 URL。"}
              {uploadIntro}
              {!kieKeyConfigured && (
                <span className="mt-1 block text-amber-800">
                  请先到「设置」保存 Kie API Key，再上传原图（推荐）。
                </span>
              )}
            </p>
            {uploadHint && (
              <p className="mt-2 rounded-md bg-amber-50 px-2 py-2 text-[11px] leading-snug text-amber-900">
                {uploadHint}
              </p>
            )}
            <p className="mt-2 text-[11px] text-ink-faint">
              {productWorkbench
                ? `当前合计 ${inputCount} / 16 张（产品 ${productSlots.length} + ${referenceLabel} ${refSlots.length}）`
                : `当前参考图 ${refSlots.length} / 16 张`}
            </p>

            <div
              className={`mt-4 grid grid-cols-1 gap-4 ${
                productWorkbench ? "sm:grid-cols-2" : ""
              }`}
            >
              {/* 产品图 */}
              {productWorkbench && (
              <div className="flex min-h-0 flex-col rounded-lg border border-canvas-border bg-canvas-muted/40 p-3">
                <h3 className="text-xs font-semibold text-ink">产品图</h3>
                <p className="mt-0.5 text-[10px] leading-snug text-ink-muted">
                  {workbenchId === "story-set"
                    ? "保持整套图中的产品主体、材质、颜色与细节一致。"
                    : skuBackgroundWorkbench
                      ? "每张 SKU 产品图会单独生成，保持当前 SKU 的形状、材质、颜色、标识与比例；不要凭空生成悬空手或遮挡产品的承托物。"
                    : "保持产品一致性，用于生成 Etsy 风格产品展示图。"}
                </p>
                <div
                  className={`mt-2 rounded-lg border border-dashed transition ${
                    dragOverProduct
                      ? "border-accent bg-accent/5 ring-2 ring-accent/40"
                      : "border-canvas-border bg-white/80"
                  } ${busy ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
                  role="button"
                  tabIndex={0}
                  aria-label="上传产品图"
                  onClick={() => {
                    if (busy) return;
                    if (Date.now() - lastDropProductRef.current < 600) return;
                    fileInputProductRef.current?.click();
                  }}
                  onKeyDown={(e) => {
                    if (busy) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      fileInputProductRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    dragDepthProductRef.current += 1;
                    setDragOverProduct(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    dragDepthProductRef.current = Math.max(0, dragDepthProductRef.current - 1);
                    if (dragDepthProductRef.current === 0) {
                      setDragOverProduct(false);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    dragDepthProductRef.current = 0;
                    setDragOverProduct(false);
                    lastDropProductRef.current = Date.now();
                    void onFiles(e.dataTransfer.files, "product");
                  }}
                >
                  <input
                    ref={fileInputProductRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    tabIndex={-1}
                    disabled={busy}
                    onChange={(e) => {
                      void onFiles(e.target.files, "product");
                      e.target.value = "";
                    }}
                  />
                  <div className="pointer-events-none px-2 py-6 text-center text-[10px] text-ink-muted">
                    拖拽或点击批量上传产品图
                  </div>
                </div>
                <div className="mt-2 flex items-start gap-1">
                  <textarea
                    value={pasteProduct}
                    onChange={(e) => setPasteProduct(e.target.value)}
                    rows={2}
                    placeholder="图片 URL，可一行一个或批量粘贴多个"
                    className="min-w-0 flex-1 resize-y rounded-md border border-canvas-border px-2 py-1 text-xs outline-none ring-accent focus:ring-2"
                  />
                  <button
                    type="button"
                    onClick={() => addUrls("product")}
                    className="shrink-0 rounded-md bg-accent px-2 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
                  >
                    批量添加
                  </button>
                </div>
                <ul className="mt-2 max-h-40 space-y-1.5 overflow-auto">
                  {productSlots.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center gap-2 rounded-md border border-canvas-border bg-white p-1.5"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                      <p className="min-w-0 flex-1 truncate text-[10px] text-ink-muted" title={s.url}>
                        {s.url}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeSlot("product", s.id)}
                        className="shrink-0 text-[10px] text-ink-faint hover:text-ink"
                      >
                        移除
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              )}

              {/* 参考图 */}
              <div className="flex min-h-0 flex-col rounded-lg border border-canvas-border bg-canvas-muted/40 p-3">
                <h3 className="text-xs font-semibold text-ink">{referenceLabel}</h3>
                <p className="mt-0.5 text-[10px] leading-snug text-ink-muted">
                  {workbenchId === "story-set"
                    ? "建议放入主图、场景图、特写图、包装图、使用图与氛围图，用来统一故事与视觉调性。"
                    : skuBackgroundWorkbench
                      ? "作为要套用的背景场景；会尽量保留构图、光线、透视、接触阴影与商业氛围。"
                    : workbenchId === "etsy"
                      ? "参考氛围、光影、风格与摆放；不替代产品本身。"
                      : "可选。上传后会和 Prompt 一起作为生成参考。"}
                </p>
                <div
                  className={`mt-2 rounded-lg border border-dashed transition ${
                    dragOverRef
                      ? "border-accent bg-accent/5 ring-2 ring-accent/40"
                      : "border-canvas-border bg-white/80"
                  } ${busy ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
                  role="button"
                  tabIndex={0}
                  aria-label="上传参考图"
                  onClick={() => {
                    if (busy) return;
                    if (Date.now() - lastDropRefRef.current < 600) return;
                    fileInputRefRef.current?.click();
                  }}
                  onKeyDown={(e) => {
                    if (busy) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      fileInputRefRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    dragDepthRefRef.current += 1;
                    setDragOverRef(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    dragDepthRefRef.current = Math.max(0, dragDepthRefRef.current - 1);
                    if (dragDepthRefRef.current === 0) {
                      setDragOverRef(false);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    dragDepthRefRef.current = 0;
                    setDragOverRef(false);
                    lastDropRefRef.current = Date.now();
                    void onFiles(e.dataTransfer.files, "reference");
                  }}
                >
                  <input
                    ref={fileInputRefRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    tabIndex={-1}
                    disabled={busy}
                    onChange={(e) => {
                      void onFiles(e.target.files, "reference");
                      e.target.value = "";
                    }}
                  />
                  <div className="pointer-events-none px-2 py-6 text-center text-[10px] text-ink-muted">
                    {workbenchId === "story-set"
                      ? "拖拽或点击批量上传套图参考"
                      : skuBackgroundWorkbench
                        ? "拖拽或点击批量上传背景图"
                      : "拖拽或点击批量上传参考图"}
                  </div>
                </div>
                <div className="mt-2 flex items-start gap-1">
                  <textarea
                    value={pasteRef}
                    onChange={(e) => setPasteRef(e.target.value)}
                    rows={2}
                    placeholder="图片 URL，可一行一个或批量粘贴多个"
                    className="min-w-0 flex-1 resize-y rounded-md border border-canvas-border px-2 py-1 text-xs outline-none ring-accent focus:ring-2"
                  />
                  <button
                    type="button"
                    onClick={() => addUrls("reference")}
                    className="shrink-0 rounded-md bg-accent px-2 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
                  >
                    批量添加
                  </button>
                </div>
                <ul className="mt-2 max-h-40 space-y-1.5 overflow-auto">
                  {refSlots.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center gap-2 rounded-md border border-canvas-border bg-white p-1.5"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                      <p className="min-w-0 flex-1 truncate text-[10px] text-ink-muted" title={s.url}>
                        {s.url}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeSlot("reference", s.id)}
                        className="shrink-0 text-[10px] text-ink-faint hover:text-ink"
                      >
                        移除
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="lg:col-span-4">
          <div className="flex h-full flex-col rounded-xl border border-canvas-border bg-white p-4 shadow-panel">
            <h2 className="text-sm font-semibold text-ink">参数</h2>
            <label className="mt-3 text-xs font-medium text-ink-muted">模型</label>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="mt-1 rounded-md border border-canvas-border px-2 py-2 text-sm outline-none ring-accent focus:ring-2"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <label className="mt-4 text-xs font-medium text-ink-muted">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={7}
              className="mt-1 resize-y rounded-md border border-canvas-border px-2 py-2 text-sm outline-none ring-accent focus:ring-2"
              placeholder={promptPlaceholder}
            />
            <label className="mt-3 text-xs font-medium text-ink-muted">生成数量</label>
            <p className="mt-0.5 text-[10px] text-ink-faint">
              {workbenchId === "story-set"
                ? "套图默认 9 张，可临时调整；将按顺序创建多个独立 Kie 任务，最多 10。"
                : skuBackgroundWorkbench
                  ? "SKU 换背景按产品图数量自动生成：每张 SKU 产品图 1 个任务，最多 10。"
                : "将按顺序创建多个独立 Kie 任务（每张 1 次调用），最多 10。"}
            </p>
            {skuBackgroundWorkbench ? (
              <div className="mt-1 w-28 rounded-md border border-canvas-border bg-canvas-muted px-2 py-2 text-sm text-ink">
                {productSlots.length || 0}
              </div>
            ) : (
              <input
                type="number"
                min={1}
                max={10}
                value={imageCount}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v)) return;
                  setImageCount(Math.min(10, Math.max(1, Math.floor(v))));
                }}
                onBlur={() =>
                  setImageCount((c) => Math.min(10, Math.max(1, Math.floor(c)) || 1))
                }
                className="mt-1 w-28 rounded-md border border-canvas-border px-2 py-2 text-sm outline-none ring-accent focus:ring-2"
              />
            )}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-ink-muted">宽高比</label>
                <select
                  value={aspect}
                  onChange={(e) => setAspect(e.target.value)}
                  className="mt-1 w-full rounded-md border border-canvas-border px-2 py-2 text-sm outline-none ring-accent focus:ring-2"
                >
                  {ASPECT_OPTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] leading-snug text-ink-faint">
                  auto 或未指定时通常仅支持 1K；1:1 不可 4K（以 Kie 文档为准）。
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-ink-muted">分辨率</label>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  className="mt-1 w-full rounded-md border border-canvas-border px-2 py-2 text-sm outline-none ring-accent focus:ring-2"
                >
                  {RES_OPTIONS.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {error && (
              <p className="mt-3 rounded-md bg-red-50 px-2 py-2 text-xs text-red-700">{error}</p>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void startJob()}
              className="mt-auto w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-accent-hover disabled:opacity-50"
            >
              {busy ? "处理中…" : "生成"}
            </button>
          </div>
        </section>

        <section className="lg:col-span-4">
          <div className="flex h-full min-h-[320px] flex-col rounded-xl border border-canvas-border bg-white p-4 shadow-panel">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">结果</h2>
              <div className="flex flex-wrap items-center gap-2">
                {activeProjects.length > 1 && (
                  <select
                    value={selectedActiveProject?.id ?? ""}
                    onChange={(e) => setSelectedActiveProjectId(e.target.value)}
                    className="max-w-[220px] rounded-md border border-canvas-border bg-white px-2 py-1 text-xs text-ink outline-none ring-accent focus:ring-2"
                  >
                    {activeProjects.map((project) => {
                      const doneCount = project.items.filter(
                        (item) => item.state === "success" || item.state === "fail"
                      ).length;
                      return (
                        <option key={project.id} value={project.id}>
                          {project.label} · {doneCount}/{project.items.length}
                        </option>
                      );
                    })}
                  </select>
                )}
                {currentResultUrls.length > 1 && (
                  <button
                    type="button"
                    disabled={downloadKeys.has(`project:${selectedActiveProject?.id ?? "current"}`)}
                    onClick={() =>
                      void saveImages(
                        currentResultUrls,
                        `project:${selectedActiveProject?.id ?? "current"}`
                      )
                    }
                    className="rounded-md border border-canvas-border bg-white px-2 py-1 text-xs font-medium text-ink hover:bg-canvas-muted disabled:opacity-50"
                  >
                    {downloadKeys.has(`project:${selectedActiveProject?.id ?? "current"}`)
                      ? "保存中…"
                      : "下载本项目"}
                  </button>
                )}
              </div>
            </div>
            {downloadMessage && (
              <p className="mt-2 rounded-md bg-emerald-50 px-2 py-2 text-xs text-emerald-700">
                {downloadMessage}
              </p>
            )}
            {activeProjects.length === 0 && (
              <p className="mt-4 text-sm text-ink-muted">
                提交任务后将在此显示状态与预览；可以连续提交多个项目同时生成。
              </p>
            )}
            {selectedActiveProject && (
              <div className="mt-3 flex flex-1 flex-col gap-4 overflow-hidden">
                {(() => {
                  const project = selectedActiveProject;
                  const doneCount = project.items.filter(
                    (item) => item.state === "success" || item.state === "fail"
                  ).length;
                  return (
                  <div
                    key={project.id}
                    className="rounded-lg border border-canvas-border bg-canvas p-3"
                  >
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-medium text-ink">{project.label}</span>
                          <span className="rounded-full bg-canvas-muted px-2 py-0.5 font-medium text-ink">
                            {doneCount}/{project.items.length}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] text-ink-muted">
                          {project.prompt}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      {project.items.map((item, idx) => (
                        <div key={item.taskId}>
                          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-medium text-ink">第 {idx + 1} 张</span>
                            <span className="rounded-full bg-canvas-muted px-2 py-0.5 font-medium text-ink">
                              {item.state}
                            </span>
                            {item.failMsg && <span className="text-red-600">{item.failMsg}</span>}
                          </div>
                          <div className="flex flex-wrap gap-3">
                            {item.resultUrls.length === 0 && item.state !== "success" && (
                              <p className="text-xs text-ink-muted">生成中…</p>
                            )}
                            {item.resultUrls.map((u) => {
                              const showMs = item.costTimeMs ?? item.clientElapsedMs;
                              const downloadKey = `image:${u}`;
                              return (
                                <figure
                                  key={u}
                                  className="flex max-w-full flex-col gap-2 rounded-md border border-canvas-border bg-white p-2"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={u} alt="" className="max-h-[360px] rounded-md object-contain" />
                                  <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                                    <span>生成耗时 {formatGenDuration(showMs)}</span>
                                    <button
                                      type="button"
                                      disabled={downloadKeys.has(downloadKey)}
                                      onClick={() => void saveImages([u], downloadKey)}
                                      className="inline-flex items-center justify-center rounded-md border border-canvas-border bg-white px-2 py-1 font-medium text-ink hover:bg-canvas-muted"
                                    >
                                      {downloadKeys.has(downloadKey) ? "保存中…" : "一键下载"}
                                    </button>
                                  </div>
                                </figure>
                              );
                            })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </section>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">图形生成历史</h2>
          <button
            type="button"
            onClick={() => void loadHistory()}
            className="text-xs text-accent hover:underline"
          >
            刷新
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {historyProjects.map((project) => {
            const thumb = project.resultUrls[0];
            const imageTotal = project.resultUrls.length || project.rows.length;
            return (
              <article
                key={project.key}
                className="group flex flex-col overflow-hidden rounded-xl border border-canvas-border bg-white text-left shadow-panel transition hover:border-accent/40"
              >
                <button
                  type="button"
                  onClick={() => applyHistoryProject(project)}
                  className="flex flex-1 flex-col text-left"
                >
                  <div className="relative aspect-video bg-canvas-muted">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-ink-faint">
                        {project.state}
                      </div>
                    )}
                    <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                      {project.state}
                    </span>
                    {imageTotal > 1 && (
                      <span className="absolute right-2 top-2 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-ink">
                        共 {imageTotal} 张
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 p-3 pb-2">
                    <p className="line-clamp-2 text-xs text-ink-muted">{project.prompt}</p>
                    <p className="text-[11px] text-ink-faint">
                      {getWorkbenchLabel(project.workbenchId)} ·{" "}
                      {new Date(project.createdAt).toLocaleString()} · {project.model}
                    </p>
                  </div>
                </button>
                {project.resultUrls.length > 0 && (
                  <div className="px-3 pb-3">
                    <button
                      type="button"
                      disabled={downloadKeys.has(`history:${project.key}`)}
                      onClick={() =>
                        void saveImages(project.resultUrls, `history:${project.key}`)
                      }
                      className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
                    >
                      {downloadKeys.has(`history:${project.key}`)
                        ? "保存中…"
                        : project.resultUrls.length > 1
                          ? "下载全部"
                          : "下载"}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

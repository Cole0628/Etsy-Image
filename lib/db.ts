import fs from "fs";
import path from "path";

const DATA_DIR = process.env.KIE_WORKBENCH_DATA_DIR
  ? path.join(process.env.KIE_WORKBENCH_DATA_DIR, "data")
  : path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

export type GenerationRow = {
  id: string;
  task_id: string;
  model: string;
  prompt: string;
  aspect_ratio: string | null;
  resolution: string | null;
  /** JSON：旧版 string[]，新版 { v:2, product_urls, reference_urls, merged_urls } */
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
  submitted_prompt?: string | null;
  submitted_model?: string | null;
};
export type ModelRow = {
  id: string;
  label: string;
  enabled: number;
  sort_order: number;
  is_default: number;
  kie_model: string;
};

type AppState = {
  settings: Record<string, string>;
  generations: GenerationRow[];
  models: ModelRow[];
};

const BUILT_IN_MODELS: ModelRow[] = [
  {
    id: "gpt-image-2-image-to-image",
    label: "GPT Image 2 · Image to Image",
    enabled: 1,
    sort_order: 0,
    is_default: 1,
    kie_model: "gpt-image-2-image-to-image",
  },
  {
    id: "google-nano-banana",
    label: "Nano Banana · Gemini 2.5 Flash Image",
    enabled: 1,
    sort_order: 10,
    is_default: 0,
    kie_model: "google/nano-banana",
  },
];

function cloneBuiltInModels(): ModelRow[] {
  return BUILT_IN_MODELS.map((model) => ({ ...model }));
}

function ensureBuiltInModels(s: AppState): boolean {
  let changed = false;
  for (const model of BUILT_IN_MODELS) {
    if (s.models.some((item) => item.id === model.id)) continue;
    s.models.push({ ...model, is_default: 0 });
    changed = true;
  }
  if (!s.models.some((model) => model.is_default === 1) && s.models.length > 0) {
    s.models[0].is_default = 1;
    changed = true;
  }
  return changed;
}

function defaultState(): AppState {
  return {
    settings: {},
    generations: [],
    models: cloneBuiltInModels(),
  };
}

function readState(): AppState {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      const s = defaultState();
      writeState(s);
      return s;
    }
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as AppState;
    if (!Array.isArray(parsed.generations)) parsed.generations = [];
    if (!Array.isArray(parsed.models)) parsed.models = cloneBuiltInModels();
    if (!parsed.settings || typeof parsed.settings !== "object") {
      parsed.settings = {};
    }
    if (parsed.models.length === 0) {
      parsed.models = cloneBuiltInModels();
      writeState(parsed);
    } else if (ensureBuiltInModels(parsed)) {
      writeState(parsed);
    }
    return parsed;
  } catch {
    const s = defaultState();
    writeState(s);
    return s;
  }
}

function writeState(s: AppState) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(s, null, 2), "utf-8");
}

function mutate(fn: (s: AppState) => void) {
  const s = readState();
  fn(s);
  writeState(s);
}

/* --- settings --- */

const KEY_KIE_API = "kie_api_key";

export function getSetting(key: string): string | null {
  return readState().settings[key] ?? null;
}

export function setSetting(key: string, value: string) {
  mutate((s) => {
    s.settings[key] = value;
  });
}

export function getStoredApiKey(): string | null {
  return getSetting(KEY_KIE_API);
}

export function setStoredApiKey(key: string) {
  setSetting(KEY_KIE_API, key);
}

/* --- generations --- */

export function listGenerations(limit = 200): GenerationRow[] {
  const s = readState();
  return [...s.generations]
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, limit);
}

export function insertGeneration(row: GenerationRow) {
  mutate((s) => {
    s.generations.push(row);
  });
}

export function getGenerationByTaskId(taskId: string): GenerationRow | null {
  return readState().generations.find((row) => row.task_id === taskId) ?? null;
}

export function updateGenerationByTaskId(
  taskId: string,
  patch: Partial<
    Pick<
      GenerationRow,
      | "state"
      | "result_urls"
      | "fail_msg"
      | "fail_code"
      | "credits"
      | "updated_at"
    >
  >
) {
  mutate((s) => {
    const g = s.generations.find((x) => x.task_id === taskId);
    if (!g) return;
    if (patch.state !== undefined) g.state = patch.state;
    if (patch.result_urls !== undefined) g.result_urls = patch.result_urls;
    if (patch.fail_msg !== undefined) g.fail_msg = patch.fail_msg;
    if (patch.fail_code !== undefined) g.fail_code = patch.fail_code;
    if (patch.credits !== undefined) g.credits = patch.credits;
    if (patch.updated_at !== undefined) g.updated_at = patch.updated_at;
  });
}

/* --- models --- */

export function listModels(): ModelRow[] {
  const s = readState();
  return [...s.models].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.label.localeCompare(b.label);
  });
}

export function getDefaultModelId(): string | null {
  const rows = listModels().filter((m) => m.enabled === 1);
  const def = rows.find((m) => m.is_default === 1);
  if (def) return def.id;
  return rows[0]?.id ?? null;
}

export function getModelById(id: string): ModelRow | null {
  return readState().models.find((m) => m.id === id) ?? null;
}

export function setDefaultModel(id: string) {
  mutate((s) => {
    for (const m of s.models) {
      m.is_default = m.id === id ? 1 : 0;
    }
  });
}

export function upsertModel(row: {
  id: string;
  label: string;
  kie_model: string;
  enabled: boolean;
  sort_order: number;
}) {
  mutate((s) => {
    const i = s.models.findIndex((m) => m.id === row.id);
    const next: ModelRow = {
      id: row.id,
      label: row.label,
      enabled: row.enabled ? 1 : 0,
      sort_order: row.sort_order,
      is_default: 0,
      kie_model: row.kie_model,
    };
    if (i >= 0) {
      next.is_default = s.models[i].is_default;
      s.models[i] = next;
    } else {
      s.models.push(next);
    }
  });
}

export function deleteModel(id: string) {
  mutate((s) => {
    s.models = s.models.filter((m) => m.id !== id);
    if (!s.models.some((m) => m.is_default === 1) && s.models.length > 0) {
      s.models[0].is_default = 1;
    }
  });
}

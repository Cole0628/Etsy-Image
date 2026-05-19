export const WORKBENCH_OPTIONS = [
  { id: "default", label: "默认工作台" },
  { id: "etsy", label: "Etsy工作台" },
  { id: "story-set", label: "套图生成工作台" },
  { id: "sku-background", label: "SKU换背景工作台" },
] as const;

export type WorkbenchId = (typeof WORKBENCH_OPTIONS)[number]["id"];

export const DEFAULT_WORKBENCH_ID: WorkbenchId = "default";
export const LEGACY_WORKBENCH_ID: WorkbenchId = "etsy";

export const EMPTY_WORKBENCH_DEFINITIONS: Record<WorkbenchId, string> = {
  default: "",
  etsy: "",
  "story-set": "",
  "sku-background": "",
};

export function isWorkbenchId(value: unknown): value is WorkbenchId {
  return (
    value === "default" ||
    value === "etsy" ||
    value === "story-set" ||
    value === "sku-background"
  );
}

export function getWorkbenchLabel(id: WorkbenchId): string {
  return WORKBENCH_OPTIONS.find((item) => item.id === id)?.label ?? id;
}

import { getSetting, setSetting } from "@/lib/db";
import {
  EMPTY_WORKBENCH_DEFINITIONS,
  WORKBENCH_OPTIONS,
  type WorkbenchId,
} from "@/lib/workbenches";

const KEY_PREFIX = "workbench_definition_";

function keyFor(id: WorkbenchId): string {
  return `${KEY_PREFIX}${id}`;
}

export function getWorkbenchDefinitions(): Record<WorkbenchId, string> {
  return WORKBENCH_OPTIONS.reduce(
    (acc, item) => {
      acc[item.id] = getSetting(keyFor(item.id)) ?? EMPTY_WORKBENCH_DEFINITIONS[item.id];
      return acc;
    },
    { ...EMPTY_WORKBENCH_DEFINITIONS }
  );
}

export function setWorkbenchDefinition(id: WorkbenchId, definition: string) {
  setSetting(keyFor(id), definition);
}

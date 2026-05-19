import { NextResponse } from "next/server";
import {
  getWorkbenchDefinitions,
  setWorkbenchDefinition,
} from "@/lib/workbench-settings";
import {
  getWorkbenchLabel,
  isWorkbenchId,
  WORKBENCH_OPTIONS,
  type WorkbenchId,
} from "@/lib/workbenches";

export const dynamic = "force-dynamic";

const MAX_DEFINITION_LENGTH = 5000;

function serializeItems(definitions: Record<WorkbenchId, string>) {
  return WORKBENCH_OPTIONS.map((item) => ({
    id: item.id,
    label: getWorkbenchLabel(item.id),
    definition: definitions[item.id],
  }));
}

export async function GET() {
  return NextResponse.json({
    items: serializeItems(getWorkbenchDefinitions()),
  });
}

export async function POST(request: Request) {
  let body: { id?: unknown; definition?: unknown };
  try {
    body = (await request.json()) as { id?: unknown; definition?: unknown };
  } catch {
    return NextResponse.json({ error: "无效的 JSON" }, { status: 400 });
  }

  if (!isWorkbenchId(body.id)) {
    return NextResponse.json({ error: "未知工作台" }, { status: 400 });
  }

  if (typeof body.definition !== "string") {
    return NextResponse.json({ error: "工作台定义必须是文本" }, { status: 400 });
  }

  const definition = body.definition.trim();
  if (definition.length > MAX_DEFINITION_LENGTH) {
    return NextResponse.json(
      { error: `工作台定义最多 ${MAX_DEFINITION_LENGTH} 个字符` },
      { status: 400 }
    );
  }

  setWorkbenchDefinition(body.id, definition);
  return NextResponse.json({
    ok: true,
    items: serializeItems(getWorkbenchDefinitions()),
  });
}

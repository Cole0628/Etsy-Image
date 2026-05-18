import { NextResponse } from "next/server";
import { listModels, upsertModel, deleteModel } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ items: listModels() });
}

type UpsertBody = {
  id: string;
  label: string;
  kie_model: string;
  enabled?: boolean;
  sort_order?: number;
};

export async function POST(request: Request) {
  let body: UpsertBody;
  try {
    body = (await request.json()) as UpsertBody;
  } catch {
    return NextResponse.json({ error: "无效的 JSON" }, { status: 400 });
  }
  if (!body.id?.trim() || !body.label?.trim() || !body.kie_model?.trim()) {
    return NextResponse.json(
      { error: "id / label / kie_model 均为必填" },
      { status: 400 }
    );
  }
  upsertModel({
    id: body.id.trim(),
    label: body.label.trim(),
    kie_model: body.kie_model.trim(),
    enabled: body.enabled !== false,
    sort_order: typeof body.sort_order === "number" ? body.sort_order : 0,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  }
  deleteModel(id);
  return NextResponse.json({ ok: true });
}

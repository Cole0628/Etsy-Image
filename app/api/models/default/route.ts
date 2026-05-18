import { NextResponse } from "next/server";
import { setDefaultModel } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "无效的 JSON" }, { status: 400 });
  }
  const id = body.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  }
  setDefaultModel(id);
  return NextResponse.json({ ok: true });
}

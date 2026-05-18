import { NextResponse } from "next/server";
import { listGenerations } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = listGenerations(200);
  return NextResponse.json({ items: rows });
}

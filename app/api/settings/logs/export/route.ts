import { NextResponse } from "next/server";
import {
  buildDiagnosticBundle,
  diagnosticExportFilename,
} from "@/lib/runtime-log";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const now = new Date();
    const bundle = buildDiagnosticBundle();
    return new NextResponse(JSON.stringify(bundle, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${diagnosticExportFilename(now)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "运行日志导出失败，请重试。" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

import { NextResponse } from "next/server";
import {
  buildDiagnosticBundle,
  buildDiagnosticExportErrorResponse,
  buildDiagnosticExportResponse,
  diagnosticExportFilename,
} from "@/lib/runtime-log";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const now = new Date();
    const bundle = buildDiagnosticBundle();
    const response = buildDiagnosticExportResponse(
      bundle,
      diagnosticExportFilename(now)
    );
    return new NextResponse(response.body, {
      status: response.status,
      headers: response.headers,
    });
  } catch {
    const response = buildDiagnosticExportErrorResponse();
    return new NextResponse(response.body, {
      status: response.status,
      headers: response.headers,
    });
  }
}

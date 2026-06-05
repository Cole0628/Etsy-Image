import { NextResponse } from "next/server";
import { getEffectiveKieApiKey } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const blob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const hasKieKey = Boolean(getEffectiveKieApiKey());
  const isPackagedRuntime = Boolean(process.env.KIE_WORKBENCH_DATA_DIR);
  const localUploadEnabled = !isPackagedRuntime;
  return NextResponse.json({
    blobUploadEnabled: blob,
    localUploadEnabled,
    /** 无 Kie Key 时上传只能走 Blob/本机；本机 URL 会导致 Kie 拉取失败 */
    kieKeyConfigured: hasKieKey,
    /** 有 Key 时上传会优先走 Kie 文件上传接口，返回 Kie 可拉取的 URL */
    uploadBackend: hasKieKey
      ? "kie-file-upload"
      : blob
        ? "blob"
        : localUploadEnabled
          ? "local"
          : "disabled",
    hasEnvApiKey: Boolean(process.env.KIE_API_KEY?.trim()),
    isPackagedRuntime,
  });
}

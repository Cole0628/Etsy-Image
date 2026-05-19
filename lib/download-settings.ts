import fs from "fs/promises";
import os from "os";
import path from "path";
import { getSetting, setSetting } from "@/lib/db";

const KEY_DOWNLOAD_DIR = "download_dir";

export function getDefaultDownloadDir(): string {
  const home = os.homedir();
  return home ? path.join(home, "Downloads") : path.join(process.cwd(), "Output");
}

function normalizeDownloadDir(raw: string | null | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) return getDefaultDownloadDir();
  const unquoted = trimmed.replace(/^["']|["']$/g, "");
  if (path.isAbsolute(unquoted)) return path.normalize(unquoted);
  return path.resolve(process.cwd(), unquoted);
}

export function getStoredDownloadDir(): string | null {
  const stored = getSetting(KEY_DOWNLOAD_DIR)?.trim();
  return stored || null;
}

export function getEffectiveDownloadDir(): string {
  return normalizeDownloadDir(getStoredDownloadDir());
}

export async function setDownloadDir(raw: string): Promise<string> {
  const trimmed = raw.trim();
  const resolved = normalizeDownloadDir(trimmed);
  if (path.parse(resolved).root === resolved) {
    throw new Error("不能把磁盘根目录设为下载目录");
  }
  await fs.mkdir(resolved, { recursive: true });
  setSetting(KEY_DOWNLOAD_DIR, trimmed ? resolved : "");
  return resolved;
}

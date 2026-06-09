import { getSetting, setSetting } from "@/lib/db";

export type NetworkProxyMode = "none" | "env" | "manual";

export type NetworkSettings = {
  proxyMode: NetworkProxyMode;
  proxyUrl: string;
  effectiveProxyUrl: string | null;
};

const KEY_PROXY_MODE = "network_proxy_mode";
const KEY_PROXY_URL = "network_proxy_url";

function normalizeProxyMode(value: string | null): NetworkProxyMode {
  if (value === "env" || value === "manual" || value === "none") return value;
  return "none";
}

export function normalizeProxyUrl(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

export function isValidProxyUrl(value: string): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function envProxyUrl(): string | null {
  const raw =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    "";
  const normalized = normalizeProxyUrl(raw);
  return normalized && isValidProxyUrl(normalized) ? normalized : null;
}

export function getNetworkSettings(): NetworkSettings {
  const proxyMode = normalizeProxyMode(getSetting(KEY_PROXY_MODE));
  const proxyUrl = normalizeProxyUrl(getSetting(KEY_PROXY_URL));
  const effectiveProxyUrl =
    proxyMode === "manual"
      ? proxyUrl || null
      : proxyMode === "env"
        ? envProxyUrl()
        : null;
  return { proxyMode, proxyUrl, effectiveProxyUrl };
}

export function setNetworkSettings(input: {
  proxyMode: NetworkProxyMode;
  proxyUrl?: string;
}) {
  const proxyMode = normalizeProxyMode(input.proxyMode);
  const proxyUrl = normalizeProxyUrl(input.proxyUrl);
  setSetting(KEY_PROXY_MODE, proxyMode);
  setSetting(KEY_PROXY_URL, proxyUrl);
}

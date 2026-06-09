import { ProxyAgent } from "undici";
import { getNetworkSettings, isValidProxyUrl } from "@/lib/network-settings";

export type KieProxyInfo = {
  mode: "none" | "env" | "manual";
  proxyUrl: string | null;
  enabled: boolean;
};

export function getKieProxyInfo(): KieProxyInfo {
  const settings = getNetworkSettings();
  const proxyUrl = settings.effectiveProxyUrl;
  return {
    mode: settings.proxyMode,
    proxyUrl,
    enabled: Boolean(proxyUrl && isValidProxyUrl(proxyUrl)),
  };
}

export function withKieProxy(init: RequestInit = {}): RequestInit {
  const info = getKieProxyInfo();
  if (!info.enabled || !info.proxyUrl) return init;
  return {
    ...init,
    dispatcher: new ProxyAgent(info.proxyUrl),
  } as RequestInit & { dispatcher: ProxyAgent };
}

export async function kieFetch(
  input: string | URL | Request,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(input, withKieProxy(init));
}

/**
 * Kie 侧拉取原图：生产环境需公网 HTTPS。
 * 本机开发允许 http://localhost / 127.0.0.1 指向本服务上传的静态文件。
 */
export function isAllowedInputImageUrl(u: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return false;
  }
  if (parsed.protocol === "https:") return true;
  if (parsed.protocol === "http:") {
    const h = parsed.hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1";
  }
  return false;
}

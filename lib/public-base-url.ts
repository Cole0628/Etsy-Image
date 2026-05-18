/** 生成浏览器可访问的上传结果 URL（不含末尾斜杠）。 */
export function getPublicBaseUrl(request: Request): string {
  const trimmed = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (trimmed) return trimmed;
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return "http://localhost:3000";
  const lower = host.toLowerCase();
  const isLocalHost =
    lower === "localhost" ||
    lower.startsWith("localhost:") ||
    lower === "127.0.0.1" ||
    lower.startsWith("127.0.0.1:");
  const inferredProto = isLocalHost ? "http" : "https";
  const proto =
    request.headers.get("x-forwarded-proto") ?? inferredProto;
  return `${proto}://${host}`;
}

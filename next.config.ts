import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** 供 Electron / 便携版打包为独立 Node 服务 */
  output: "standalone",
};

export default nextConfig;

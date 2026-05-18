/**
 * 在 `next build` 之后运行：复制 standalone 静态资源、嵌入 Windows node.exe。
 * 用法：npm run desktop:prepare
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const NODE_WIN_VERSION = process.env.NODE_STANDALONE_VERSION || "20.18.1";
const NODE_ZIP_NAME = `node-v${NODE_WIN_VERSION}-win-x64.zip`;
const NODE_URL = `https://nodejs.org/dist/v${NODE_WIN_VERSION}/${NODE_ZIP_NAME}`;

const standaloneSrc = path.join(root, ".next", "standalone");
const staticSrc = path.join(root, ".next", "static");
const publicSrc = path.join(root, "public");
const dest = path.join(root, "dist-standalone");

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
}

async function main() {
  if (!fs.existsSync(standaloneSrc)) {
    console.error("找不到 .next/standalone，请先执行: npm run build");
    process.exit(1);
  }

  rmrf(dest);
  fs.cpSync(standaloneSrc, dest, { recursive: true });

  const staticDest = path.join(dest, ".next", "static");
  if (!fs.existsSync(staticSrc)) {
    console.error("找不到 .next/static");
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(staticDest), { recursive: true });
  fs.cpSync(staticSrc, staticDest, { recursive: true });

  if (fs.existsSync(publicSrc)) {
    fs.cpSync(publicSrc, path.join(dest, "public"), { recursive: true });
  }

  if (process.platform === "win32") {
    const cacheDir = path.join(root, "release", "cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    const zipPath = path.join(cacheDir, NODE_ZIP_NAME);

    if (!fs.existsSync(zipPath)) {
      console.log("下载 Node.js:", NODE_URL);
      await downloadFile(NODE_URL, zipPath);
    }

    const extractDir = path.join(cacheDir, `extract-${NODE_WIN_VERSION}`);
    rmrf(extractDir);
    fs.mkdirSync(extractDir, { recursive: true });
    console.log("解压:", zipPath);
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force"`,
      { stdio: "inherit" }
    );

    const sub = fs
      .readdirSync(extractDir)
      .find((x) => x.startsWith("node-") && x.includes("win-x64"));
    if (!sub) {
      console.error("解压目录中未找到 node-*-win-x64");
      process.exit(1);
    }
    const nodeExe = path.join(extractDir, sub, "node.exe");
    if (!fs.existsSync(nodeExe)) {
      console.error("未找到 node.exe");
      process.exit(1);
    }
    fs.copyFileSync(nodeExe, path.join(dest, "node.exe"));
    console.log("已复制 node.exe -> dist-standalone/");
  } else {
    console.warn(
      "非 Windows：请自行将 node 可执行文件命名为 node 并放入 dist-standalone/（与 server.js 同级），或仅用于开发。"
    );
  }

  console.log("standalone 已准备到:", dest);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

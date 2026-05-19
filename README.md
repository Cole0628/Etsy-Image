# Kie 生图工作台

团队内部使用的 **Next.js + Tailwind** 生图工作台，对接 [Kie](https://kie.ai) 的 `createTask` 与统一查询 `recordInfo`，默认集成 **GPT Image 2 · Image to Image**。

## 环境要求

- Node.js 20+（含 npm），用于安装依赖与运行 `npm run dev` / 打包。
- **设置 → API Key**：Key 写入 `data/store.json`（或通过环境变量 `KIE_API_KEY`，优先级更高）。

## 可选环境变量

| 变量 | 说明 |
|------|------|
| `KIE_API_KEY` | 若设置，则覆盖 `data/store.json` 中的 Key，且设置页无法覆盖。 |
| `BLOB_READ_WRITE_TOKEN` | 若配置，则优先使用 **Vercel Blob** 上传（公网 HTTPS）。未配置时写入 `public/uploads/kie-workbench/`。 |
| `NEXT_PUBLIC_APP_URL` | 可选。用于本地上传后拼出的绝对 URL（反向代理、自定义域名）。 |
| `KIE_FILE_UPLOAD_BASE` | 可选。Kie 文件上传根地址，默认 `https://kieai.redpandaai.co`（见 [File Upload 文档](https://docs.kie.ai/file-upload-api/quickstart)）。 |

## 本地运行（开发）

```bash
cd D:\Users\cole-\Documents\Etsy-Image
npm install
npm run dev
```

浏览器打开 `http://localhost:3300`。

开发模式下数据默认在项目目录 `data/store.json`。

## 打包 Windows 便携版（双击 .exe）

思路：用 **Next.js `output: "standalone"`** 生成独立 `server.js`，再嵌入 **Windows 版 `node.exe`**，最后用 **Electron 便携版** 打成单个可执行文件；启动时自动起本地服务并打开窗口。

### 1. 安装依赖（需能访问 npm 与 GitHub，以下载 Electron）

```bash
cd D:\Users\cole-\Documents\Etsy-Image
npm install
```

### 2. 一键打包

```bash
npm run desktop:pack
```

- 会先执行 `next build`、`desktop:prepare`（复制 standalone、下载 Node 20 zip、解压出 `node.exe` 到 `dist-standalone/`）。
- 再执行 `electron-builder --win portable`。

### 3. 得到文件

打包完成后，在 **`release/`** 目录下会生成类似：

`KieWorkbench-0.1.0-portable.exe`

**双击该 exe** 即可：内置服务默认监听 **`http://127.0.0.1:38477`**，数据与配置写在 **`%APPDATA%\KieWorkbench`**（由环境变量 `KIE_WORKBENCH_DATA_DIR` 指定，避免便携版解压目录变化导致丢数据）。

体积说明：内含 Chromium + Node + 应用，约 **数百 MB** 属正常范围。

### 4. 开发时预览 Electron 壳（仍跑 `next dev`）

```bash
npm run desktop:dev
```

会先起 `next dev`（3300），再打开 Electron 指向该地址。

### 5. 不打包 exe、只要「绿色文件夹 + 脚本」（可选）

在已执行 `npm run build` 与 `npm run desktop:prepare` 后，可双击运行：

`scripts\run-standalone.bat`

会启动 `dist-standalone` 内嵌的 `node.exe` + `server.js`，并打开浏览器（同样使用 `%APPDATA%\KieWorkbench` 存数据）。

---

## 常见问题

### “Image fetch failed. Check access settings or use our File Upload API instead.”

Kie 在云端拉取 `input_urls`。`http://localhost…` 或内网地址会失败。

**推荐**：在「设置」保存 Kie API Key 后，用本工具上传原图（会走 Kie 文件上传接口）。详见上文环境变量 `KIE_FILE_UPLOAD_BASE` 链接。

## 功能摘要

- 左 / 中 / 右三栏：原图、参数、结果预览与 **一键下载**。
- **下载保存**：点击「一键下载」或「全部下载」会自动保存到「下载设置」中的默认目录；可在设置页浏览选择本地文件夹，未设置时使用当前项目目录的 `Output/` 文件夹，并按 `kie-image-001.png` 这类序号文件名保存。
- **原图上传**：有 Kie Key 时优先 Kie 文件上传；否则 Blob / 本机目录（见上文）。
- 创建任务后轮询 **每 3 秒**，最长约 **15 分钟**。
- **历史记录**：`data/store.json`（便携版为 `%APPDATA%\KieWorkbench\data\store.json`）。
- **设置**：API Key、模型列表、默认下载目录。

## Kie 接口

- 创建任务：`POST https://api.kie.ai/api/v1/jobs/createTask`
- 查询任务：`GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=...`

详见 [Get Task Details](https://docs.kie.ai/market/common/get-task-detail)。

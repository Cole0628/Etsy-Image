const { app, BrowserWindow } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

const PORT = process.env.KIE_WORKBENCH_PORT || "38477";
const DEV_URL = process.env.KIE_WORKBENCH_DEV_URL || "http://127.0.0.1:3300";
let serverProc = null;

function serverRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "server");
  }
  return path.join(__dirname, "..", "dist-standalone");
}

function startServer() {
  const root = serverRoot();
  const nodeBin =
    process.platform === "win32"
      ? path.join(root, "node.exe")
      : path.join(root, "node");
  const serverJs = path.join(root, "server.js");
  if (!require("fs").existsSync(serverJs)) {
    console.error("未找到 server.js:", serverJs);
    return;
  }
  const dataDir = app.getPath("userData");
  serverProc = spawn(nodeBin, [serverJs], {
    cwd: root,
    env: {
      ...process.env,
      PORT,
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      KIE_WORKBENCH_DATA_DIR: dataDir,
    },
    stdio: "ignore",
    windowsHide: true,
  });
  serverProc.on("error", (err) => {
    console.error("启动内置服务失败:", err);
  });
}

function waitForServer(callback) {
  const deadline = Date.now() + 120000;
  const tick = () => {
    const req = http.get(`http://127.0.0.1:${PORT}`, (res) => {
      res.resume();
      if (res.statusCode && res.statusCode < 500) {
        callback();
        return;
      }
      retry();
    });
    req.on("error", retry);
    function retry() {
      if (Date.now() > deadline) {
        console.error("等待本地服务超时");
        callback();
        return;
      }
      setTimeout(tick, 400);
    }
  };
  tick();
}

function createWindow(url) {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "Kie 生图工作台",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  win.loadURL(url);
}

app.whenReady().then(() => {
  if (!app.isPackaged) {
    createWindow(DEV_URL);
    return;
  }
  startServer();
  waitForServer(() => {
    createWindow(`http://127.0.0.1:${PORT}`);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (serverProc && !serverProc.killed) {
    serverProc.kill();
    serverProc = null;
  }
});

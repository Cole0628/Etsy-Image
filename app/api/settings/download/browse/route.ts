import { execFile } from "child_process";
import { NextResponse } from "next/server";
import { getEffectiveDownloadDir } from "@/lib/download-settings";

export const dynamic = "force-dynamic";

function pickFolder(initialDir: string): Promise<string | null> {
  const script = `
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "选择默认下载文件夹"
$dialog.ShowNewFolderButton = $true
$initial = [Environment]::GetEnvironmentVariable("KIE_DOWNLOAD_INITIAL_DIR")
if ($initial -and (Test-Path -LiteralPath $initial)) {
  $dialog.SelectedPath = $initial
}
$result = $dialog.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK -and $dialog.SelectedPath) {
  [Console]::Out.Write($dialog.SelectedPath)
  exit 0
}
exit 2
`;

  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        env: {
          ...process.env,
          KIE_DOWNLOAD_INITIAL_DIR: initialDir,
        },
        timeout: 5 * 60 * 1000,
        windowsHide: false,
      },
      (error, stdout, stderr) => {
        if (error) {
          if ("code" in error && error.code === 2) {
            resolve(null);
            return;
          }
          reject(new Error(stderr.trim() || error.message));
          return;
        }
        const selected = stdout.trim();
        resolve(selected || null);
      }
    );
  });
}

export async function POST(request: Request) {
  if (process.platform !== "win32") {
    return NextResponse.json(
      { error: "当前仅支持 Windows 文件夹选择窗口" },
      { status: 400 }
    );
  }

  let body: { initialDir?: unknown } = {};
  try {
    body = (await request.json()) as { initialDir?: unknown };
  } catch {
    body = {};
  }

  const initialDir =
    typeof body.initialDir === "string" && body.initialDir.trim()
      ? body.initialDir.trim()
      : getEffectiveDownloadDir();

  try {
    const dir = await pickFolder(initialDir);
    if (!dir) {
      return NextResponse.json({ cancelled: true });
    }
    return NextResponse.json({ dir });
  } catch (e) {
    const message = e instanceof Error ? e.message : "选择文件夹失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

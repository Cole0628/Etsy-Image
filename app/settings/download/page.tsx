"use client";

import { useEffect, useState } from "react";

type DownloadSettings = {
  defaultDir: string;
  storedDir: string | null;
  effectiveDir: string;
};

export default function DownloadSettingsPage() {
  const [settings, setSettings] = useState<DownloadSettings | null>(null);
  const [dir, setDir] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);

  const load = async () => {
    const r = await fetch("/api/settings/download");
    const j = (await r.json()) as DownloadSettings;
    setSettings(j);
    setDir(j.storedDir ?? "");
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async (nextDir = dir) => {
    setStatus(null);
    const r = await fetch("/api/settings/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dir: nextDir }),
    });
    const j = (await r.json()) as DownloadSettings & { error?: string };
    if (!r.ok) {
      setStatus(j.error || "保存失败");
      return;
    }
    setSettings(j);
    setDir(j.storedDir ?? "");
    setStatus("已保存");
  };

  const reset = async () => {
    setDir("");
    await save("");
  };

  const browse = async () => {
    setStatus(null);
    setBrowsing(true);
    try {
      const r = await fetch("/api/settings/download/browse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initialDir: dir || settings?.effectiveDir }),
      });
      const j = (await r.json()) as { dir?: string; cancelled?: boolean; error?: string };
      if (!r.ok) {
        setStatus(j.error || "选择文件夹失败");
        return;
      }
      if (j.cancelled || !j.dir) {
        setStatus("已取消选择");
        return;
      }
      setDir(j.dir);
      await save(j.dir);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "选择文件夹失败");
    } finally {
      setBrowsing(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-ink">下载设置</h1>
        <p className="mt-1 text-sm text-ink-muted">
          设置后，「一键下载」和「全部下载」都会保存到这个文件夹。
        </p>
      </div>

      {settings && (
        <div className="rounded-lg border border-canvas-border bg-white p-4 text-sm shadow-panel">
          <p className="font-medium text-ink">当前保存位置</p>
          <p className="mt-2 break-all rounded-md bg-canvas-muted px-2 py-2 font-mono text-xs text-ink-muted">
            {settings.effectiveDir}
          </p>
          <p className="mt-3 text-xs text-ink-faint">
            默认位置：{settings.defaultDir}
          </p>
        </div>
      )}

      <label className="block text-sm font-medium text-ink-muted">默认下载文件夹</label>
      <div className="mt-1 flex flex-col gap-2 sm:flex-row">
        <input
          value={dir}
          onChange={(e) => setDir(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-canvas-border px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
          placeholder="留空则使用项目目录下的 Output"
        />
        <button
          type="button"
          onClick={() => void browse()}
          disabled={browsing}
          className="rounded-lg border border-canvas-border bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-canvas-muted disabled:opacity-50"
        >
          {browsing ? "选择中…" : "浏览选择"}
        </button>
      </div>
      <p className="text-xs text-ink-faint">
        可点击浏览选择本地文件夹，也可填写完整路径；文件夹不存在时会自动创建。
      </p>

      {status && <p className="text-sm text-ink-muted">{status}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
        >
          保存
        </button>
        <button
          type="button"
          onClick={() => void reset()}
          className="rounded-lg border border-canvas-border bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-canvas-muted"
        >
          恢复默认 Output
        </button>
      </div>
    </div>
  );
}

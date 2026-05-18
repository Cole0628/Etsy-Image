"use client";

import { useEffect, useState } from "react";

export default function SettingsKeyPage() {
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [meta, setMeta] = useState<{
    configured: boolean;
    source: string;
    maskedDatabaseKey: string | null;
    hint: string | null;
  } | null>(null);

  const load = async () => {
    const r = await fetch("/api/settings/key");
    setMeta(await r.json());
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    setStatus(null);
    const r = await fetch("/api/settings/key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    const j = (await r.json()) as { error?: string };
    if (!r.ok) {
      setStatus(j.error || "保存失败");
      return;
    }
    setStatus("已保存");
    setKey("");
    void load();
  };

  const test = async () => {
    setStatus(null);
    const r = await fetch("/api/settings/test", { method: "POST" });
    const j = (await r.json()) as { ok?: boolean; error?: string; detail?: string };
    if (!r.ok) {
      setStatus(j.error || "测试失败");
      return;
    }
    setStatus(j.detail || "连接正常");
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-ink">API Key</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Key 仅保存在本机{" "}
          <code className="rounded bg-canvas-muted px-1">data/store.json</code>{" "}
          中（或通过环境变量）。请勿把数据库文件提交到 git。
        </p>
      </div>
      {meta && (
        <div className="rounded-lg border border-canvas-border bg-white p-4 text-sm shadow-panel">
          <p>
            状态：{meta.configured ? "已配置" : "未配置"}（{meta.source}）
          </p>
          {meta.maskedDatabaseKey && (
            <p className="mt-1 text-ink-muted">数据库中：{meta.maskedDatabaseKey}</p>
          )}
          {meta.hint && <p className="mt-2 text-xs text-amber-700">{meta.hint}</p>}
        </div>
      )}
      <label className="block text-sm font-medium text-ink-muted">新 Key</label>
      <input
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        autoComplete="off"
        className="mt-1 w-full rounded-md border border-canvas-border px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
        placeholder="Bearer Token（来自 kie.ai/api-key）"
      />
      {status && <p className="text-sm text-ink-muted">{status}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void save()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
        >
          保存
        </button>
        <button
          type="button"
          onClick={() => void test()}
          className="rounded-lg border border-canvas-border bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-canvas-muted"
        >
          测试连接
        </button>
      </div>
    </div>
  );
}

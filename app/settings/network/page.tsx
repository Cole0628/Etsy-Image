"use client";

import { useEffect, useMemo, useState } from "react";

type ProxyMode = "none" | "env" | "manual";

type NetworkSettings = {
  proxyMode: ProxyMode;
  proxyUrl: string;
  effectiveProxyUrl: string | null;
};

type CheckResult = {
  id: string;
  label: string;
  ok: boolean;
  status?: number;
  ms?: number;
  detail: string;
  contentType?: string | null;
  responseKind?: string;
  sample?: string;
  solution?: string;
};

type DiagnoseResult = {
  ok: boolean;
  checkedAt: string;
  proxy: {
    mode: ProxyMode;
    proxyUrl: string | null;
    enabled: boolean;
  };
  checks: CheckResult[];
};

export default function NetworkSettingsPage() {
  const [settings, setSettings] = useState<NetworkSettings>({
    proxyMode: "none",
    proxyUrl: "",
    effectiveProxyUrl: null,
  });
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [result, setResult] = useState<DiagnoseResult | null>(null);

  const load = async () => {
    const r = await fetch("/api/settings/network");
    const j = (await r.json()) as NetworkSettings;
    setSettings(j);
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const r = await fetch("/api/settings/network", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proxyMode: settings.proxyMode,
          proxyUrl: settings.proxyUrl,
        }),
      });
      const j = (await r.json()) as NetworkSettings & { error?: string };
      if (!r.ok) throw new Error(j.error || "保存失败");
      setSettings(j);
      setStatus("已保存。请重新测试网络。");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const diagnose = async () => {
    setDiagnosing(true);
    setStatus(null);
    setResult(null);
    try {
      const r = await fetch("/api/settings/network/diagnose", { method: "POST" });
      const j = (await r.json()) as DiagnoseResult & { error?: string };
      if (!r.ok) throw new Error(j.error || "诊断失败");
      setResult(j);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "诊断失败");
    } finally {
      setDiagnosing(false);
    }
  };

  const copyText = useMemo(() => {
    if (!result) return "";
    const lines = [
      `KieWorkbench 网络诊断`,
      `时间：${result.checkedAt}`,
      `总体：${result.ok ? "正常" : "异常"}`,
      `代理：${result.proxy.enabled ? result.proxy.proxyUrl : "未使用"} (${result.proxy.mode})`,
      ...result.checks.map((item) => {
        const status = item.status ? ` HTTP ${item.status}` : "";
        const ms = item.ms != null ? ` ${item.ms}ms` : "";
        const solution = item.solution ? `\n解决方案：${item.solution}` : "";
        return `${item.ok ? "OK" : "FAIL"} ${item.label}${status}${ms}：${item.detail}${solution}`;
      }),
    ];
    return lines.join("\n");
  }, [result]);

  const copy = async () => {
    if (!copyText) return;
    await navigator.clipboard.writeText(copyText);
    setStatus("诊断结果已复制。");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-ink">网络诊断</h1>
        <p className="mt-1 text-sm text-ink-muted">
          用来检查这台电脑是否能连接 Kie 图片上传服务和生图 API。对方只需要点“开始诊断”，把结果复制给你。
        </p>
      </div>

      <section className="rounded-lg border border-canvas-border bg-white p-4 text-sm shadow-panel">
        <h2 className="font-semibold text-ink">代理设置</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr]">
          <label className="text-ink-muted">模式</label>
          <select
            value={settings.proxyMode}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                proxyMode: e.target.value as ProxyMode,
              }))
            }
            className="rounded-md border border-canvas-border px-3 py-2 outline-none ring-accent focus:ring-2"
          >
            <option value="none">不使用代理</option>
            <option value="env">使用环境变量代理</option>
            <option value="manual">手动代理</option>
          </select>

          <label className="text-ink-muted">手动代理地址</label>
          <input
            value={settings.proxyUrl}
            onChange={(e) =>
              setSettings((prev) => ({ ...prev, proxyUrl: e.target.value }))
            }
            placeholder="例如 http://127.0.0.1:7890"
            className="rounded-md border border-canvas-border px-3 py-2 outline-none ring-accent focus:ring-2"
          />
        </div>
        <p className="mt-3 text-xs text-ink-faint">
          如果 VPN 有本地代理端口，通常可以填类似 http://127.0.0.1:7890。保存后上传和生图都会使用这个代理。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存代理设置"}
          </button>
          <button
            type="button"
            disabled={diagnosing}
            onClick={() => void diagnose()}
            className="rounded-lg border border-canvas-border bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-canvas-muted disabled:opacity-50"
          >
            {diagnosing ? "诊断中..." : "开始诊断"}
          </button>
          {result && (
            <button
              type="button"
              onClick={() => void copy()}
              className="rounded-lg border border-canvas-border bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-canvas-muted"
            >
              复制诊断结果
            </button>
          )}
        </div>
        {status && <p className="mt-3 text-sm text-ink-muted">{status}</p>}
      </section>

      {result && (
        <section className="rounded-lg border border-canvas-border bg-white p-4 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-ink">诊断结果</h2>
            <span
              className={`rounded-full px-2 py-1 text-xs font-medium ${
                result.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
              }`}
            >
              {result.ok ? "正常" : "异常"}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {result.checks.map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-canvas-border bg-canvas p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      item.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                    }`}
                  >
                    {item.ok ? "OK" : "FAIL"}
                  </span>
                  <span className="font-medium text-ink">{item.label}</span>
                  {item.status != null && (
                    <span className="text-xs text-ink-faint">HTTP {item.status}</span>
                  )}
                  {item.ms != null && (
                    <span className="text-xs text-ink-faint">{item.ms} ms</span>
                  )}
                </div>
                <p className="mt-2 text-ink-muted">{item.detail}</p>
                {!item.ok && item.solution && (
                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <div className="font-semibold">解决方案</div>
                    <p className="mt-1 leading-6">{item.solution}</p>
                  </div>
                )}
                {item.sample && (
                  <pre className="mt-2 max-h-24 overflow-auto rounded bg-white p-2 text-xs text-ink-muted">
                    {item.sample}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";

type CheckResult = {
  id: string;
  label: string;
  ok: boolean;
  status?: number;
  code?: number;
  ms?: number;
  detail: string;
  sample?: string;
  solution?: string;
};

type DiagnoseResult = {
  ok: boolean;
  checkedAt: string;
  checks: CheckResult[];
};

export default function NetworkSettingsPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<DiagnoseResult | null>(null);

  const testFlow = async () => {
    setTesting(true);
    setStatus(null);
    setResult(null);
    try {
      const r = await fetch("/api/settings/network/diagnose", { method: "POST" });
      const j = (await r.json()) as DiagnoseResult & { error?: string };
      if (!r.ok) throw new Error(j.error || "测试失败");
      setResult(j);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "测试失败");
    } finally {
      setTesting(false);
    }
  };

  const copyText = useMemo(() => {
    if (!result) return "";
    const lines = [
      "KieWorkbench 流程测试",
      `时间：${result.checkedAt}`,
      `总体：${result.ok ? "通过" : "失败"}`,
      ...result.checks.map((item) => {
        const statusText = item.status ? ` HTTP ${item.status}` : "";
        const codeText = item.code != null ? ` Kie code ${item.code}` : "";
        const msText = item.ms != null ? ` ${item.ms}ms` : "";
        const solution = item.solution ? `\n解决方案：${item.solution}` : "";
        return `${item.ok ? "OK" : "FAIL"} ${item.label}${statusText}${codeText}${msText}：${item.detail}${solution}`;
      }),
    ];
    return lines.join("\n");
  }, [result]);

  const copy = async () => {
    if (!copyText) return;
    await navigator.clipboard.writeText(copyText);
    setStatus("测试结果已复制。");
  };

  const exportLogs = async () => {
    setExporting(true);
    setStatus(null);
    try {
      const response = await fetch("/api/settings/logs/export", { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "运行日志导出失败");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const filename =
        disposition.match(/filename="([^"]+)"/)?.[1] || "kie-runtime-diagnostic.json";
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(href);
      setStatus("运行日志已导出。文件包含完整提示词，转发前请确认内容。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "运行日志导出失败");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-ink">网络诊断</h1>
        <p className="mt-1 text-sm text-ink-muted">
          用来测试这台电脑能不能跑通 Kie 上传和生图接口。只需要点“开始测试”，然后把结果复制给你。
        </p>
      </div>

      <section className="rounded-lg border border-canvas-border bg-white p-4 text-sm shadow-panel">
        <h2 className="font-semibold text-ink">流程测试</h2>
        <p className="mt-2 text-sm text-ink-muted">
          测试不会创建生图任务，也不会消耗额度；只检查本地服务、API Key、图片上传服务和生图 API 是否可用。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={testing}
            onClick={() => void testFlow()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {testing ? "测试中..." : "开始测试"}
          </button>
          {result && (
            <button
              type="button"
              onClick={() => void copy()}
              className="rounded-lg border border-canvas-border bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-canvas-muted"
            >
              复制测试结果
            </button>
          )}
        </div>
        {status && <p className="mt-3 text-sm text-ink-muted">{status}</p>}
      </section>

      <section className="rounded-lg border border-canvas-border bg-white p-4 text-sm shadow-panel">
        <h2 className="font-semibold text-ink">运行日志</h2>
        <p className="mt-2 text-sm text-ink-muted">
          导出文件会原样包含完整提示词；如果提示词里输入过链接、密钥或其他敏感内容，也会一并保留。提示词之外的 API Key 和完整图片 URL 会被脱敏，转发前请检查内容。
        </p>
        <div className="mt-4">
          <button
            type="button"
            disabled={exporting}
            onClick={() => void exportLogs()}
            className="rounded-lg border border-canvas-border bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-canvas-muted disabled:opacity-50"
          >
            {exporting ? "导出中..." : "导出运行日志"}
          </button>
        </div>
      </section>

      {result && (
        <section className="rounded-lg border border-canvas-border bg-white p-4 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-ink">测试结果</h2>
            <span
              className={`rounded-full px-2 py-1 text-xs font-medium ${
                result.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
              }`}
            >
              {result.ok ? "通过" : "失败"}
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
                  {item.code != null && (
                    <span className="text-xs text-ink-faint">Kie code {item.code}</span>
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

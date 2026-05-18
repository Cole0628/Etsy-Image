"use client";

import { useEffect, useState } from "react";

type ModelRow = {
  id: string;
  label: string;
  enabled: number;
  sort_order: number;
  is_default: number;
  kie_model: string;
};

export default function ModelsSettingsPage() {
  const [items, setItems] = useState<ModelRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    id: "",
    label: "",
    kie_model: "",
    sort_order: 0,
  });

  const load = async () => {
    const r = await fetch("/api/models");
    const j = (await r.json()) as { items: ModelRow[] };
    setItems(j.items);
  };

  useEffect(() => {
    void load();
  }, []);

  const upsert = async (row: ModelRow | typeof draft, enabled: boolean) => {
    setMsg(null);
    const r = await fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: row.id,
        label: row.label,
        kie_model: row.kie_model,
        enabled,
        sort_order: row.sort_order,
      }),
    });
    const j = (await r.json()) as { error?: string };
    if (!r.ok) {
      setMsg(j.error || "保存失败");
      return;
    }
    setMsg("已保存");
    void load();
  };

  const setDefault = async (id: string) => {
    setMsg(null);
    const r = await fetch("/api/models/default", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!r.ok) {
      setMsg("设置默认失败");
      return;
    }
    void load();
  };

  const remove = async (id: string) => {
    if (!confirm("确定删除该模型配置？")) return;
    setMsg(null);
    const r = await fetch(`/api/models?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!r.ok) {
      setMsg("删除失败");
      return;
    }
    void load();
  };

  const addNew = async () => {
    if (!draft.id.trim() || !draft.label.trim() || !draft.kie_model.trim()) {
      setMsg("请填写 id / 显示名称 / Kie model 字符串");
      return;
    }
    await upsert(
      {
        id: draft.id.trim(),
        label: draft.label.trim(),
        kie_model: draft.kie_model.trim(),
        enabled: 1,
        sort_order: draft.sort_order,
        is_default: 0,
      },
      true
    );
    setDraft({ id: "", label: "", kie_model: "", sort_order: 0 });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-ink">模型配置</h1>
        <p className="mt-1 text-sm text-ink-muted">
          <code className="rounded bg-canvas-muted px-1">kie_model</code> 需与 Kie
          创建任务接口中的 model 字段一致。
        </p>
      </div>

      <div className="rounded-xl border border-canvas-border bg-white p-4 shadow-panel">
        <h2 className="text-sm font-semibold text-ink">新增模型</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            className="rounded-md border border-canvas-border px-2 py-2 text-sm"
            placeholder="内部 id（如 gpt-image-2-image-to-image）"
            value={draft.id}
            onChange={(e) => setDraft((d) => ({ ...d, id: e.target.value }))}
          />
          <input
            className="rounded-md border border-canvas-border px-2 py-2 text-sm"
            placeholder="显示名称"
            value={draft.label}
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
          />
          <input
            className="rounded-md border border-canvas-border px-2 py-2 text-sm"
            placeholder="Kie model 字符串"
            value={draft.kie_model}
            onChange={(e) => setDraft((d) => ({ ...d, kie_model: e.target.value }))}
          />
          <input
            type="number"
            className="rounded-md border border-canvas-border px-2 py-2 text-sm"
            placeholder="排序"
            value={draft.sort_order}
            onChange={(e) =>
              setDraft((d) => ({ ...d, sort_order: Number(e.target.value) || 0 }))
            }
          />
        </div>
        <button
          type="button"
          onClick={() => void addNew()}
          className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
        >
          添加
        </button>
      </div>

      {msg && <p className="text-sm text-ink-muted">{msg}</p>}

      <div className="overflow-hidden rounded-xl border border-canvas-border bg-white shadow-panel">
        <table className="w-full text-left text-sm">
          <thead className="bg-canvas-muted text-xs uppercase text-ink-muted">
            <tr>
              <th className="px-3 py-2">默认</th>
              <th className="px-3 py-2">启用</th>
              <th className="px-3 py-2">id</th>
              <th className="px-3 py-2">名称</th>
              <th className="px-3 py-2">kie_model</th>
              <th className="px-3 py-2">排序</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id} className="border-t border-canvas-border">
                <td className="px-3 py-2">
                  <input
                    type="radio"
                    name="defaultModel"
                    checked={m.is_default === 1}
                    onChange={() => void setDefault(m.id)}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={m.enabled === 1}
                    onChange={(e) => void upsert(m, e.target.checked)}
                  />
                </td>
                <td className="px-3 py-2 font-mono text-xs">{m.id}</td>
                <td className="px-3 py-2">
                  <input
                    className="w-full rounded border border-canvas-border px-1 py-1 text-xs"
                    value={m.label}
                    onChange={(e) =>
                      setItems((rows) =>
                        rows.map((x) =>
                          x.id === m.id ? { ...x, label: e.target.value } : x
                        )
                      )
                    }
                    onBlur={() => void upsert(m, m.enabled === 1)}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    className="w-full rounded border border-canvas-border px-1 py-1 font-mono text-xs"
                    value={m.kie_model}
                    onChange={(e) =>
                      setItems((rows) =>
                        rows.map((x) =>
                          x.id === m.id ? { ...x, kie_model: e.target.value } : x
                        )
                      )
                    }
                    onBlur={() => void upsert(m, m.enabled === 1)}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    className="w-16 rounded border border-canvas-border px-1 py-1 text-xs"
                    value={m.sort_order}
                    onChange={(e) =>
                      setItems((rows) =>
                        rows.map((x) =>
                          x.id === m.id
                            ? { ...x, sort_order: Number(e.target.value) || 0 }
                            : x
                        )
                      )
                    }
                    onBlur={() => void upsert(m, m.enabled === 1)}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => void remove(m.id)}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

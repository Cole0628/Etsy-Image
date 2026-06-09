import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kie 生图工作台",
  description: "团队内部图像生成工作台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">
        <header className="sticky top-0 z-20 border-b border-canvas-border bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-4">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              Kie 生图工作台
            </Link>
            <nav className="flex items-center gap-4 text-sm text-ink-muted">
              <Link
                href="/"
                className="rounded-md px-2 py-1 hover:bg-canvas-muted hover:text-ink"
              >
                工作台
              </Link>
              <Link
                href="/settings"
                className="rounded-md px-2 py-1 hover:bg-canvas-muted hover:text-ink"
              >
                API Key
              </Link>
              <Link
                href="/settings/models"
                className="rounded-md px-2 py-1 hover:bg-canvas-muted hover:text-ink"
              >
                模型
              </Link>
              <Link
                href="/settings/download"
                className="rounded-md px-2 py-1 hover:bg-canvas-muted hover:text-ink"
              >
                下载设置
              </Link>
              <Link
                href="/settings/network"
                className="rounded-md px-2 py-1 hover:bg-canvas-muted hover:text-ink"
              >
                网络诊断
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] px-4 py-6">{children}</main>
      </body>
    </html>
  );
}

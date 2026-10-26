import { Activity, BarChart3, BellRing, Boxes, Database, FileText, Gauge, Menu, PanelLeftClose, PanelLeftOpen, Settings as Cog, X } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useApp } from "../hooks/useApp";
import { Badge } from "./ui";

const NAV = [
  { to: "/app", label: "Overview", icon: Gauge, end: true },
  { to: "/app/datasets", label: "Dataset Explorer", icon: Database },
  { to: "/app/detection", label: "Anomaly Detection", icon: Activity },
  { to: "/app/warnings", label: "Warning Center", icon: BellRing },
  { to: "/app/benchmark", label: "CPU vs GPU Benchmark", icon: BarChart3 },
  { to: "/app/cuda", label: "CUDA Architecture", icon: Boxes },
  { to: "/app/reports", label: "Reports", icon: FileText },
  { to: "/app/settings", label: "Settings", icon: Cog },
];

export default function AppLayout() {
  const { gpu, apiOnline, toasts, dismiss } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-1 p-2">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)} title={label}
          className={({ isActive }) => `flex items-center gap-3 rounded-md px-3 py-2 text-sm ${isActive ? "bg-ink-700 text-mint" : "text-slate-300 hover:bg-ink-800"}`}>
          <Icon className="h-4 w-4 shrink-0" aria-hidden />{!collapsed && <span>{label}</span>}
        </NavLink>
      ))}
    </nav>
  );
  return (
    <div className="flex min-h-screen">
      <aside className={`hidden shrink-0 border-r border-line bg-ink-900 md:block ${collapsed ? "w-16" : "w-60"}`}>
        <div className="flex h-14 items-center justify-between border-b border-line px-3">
          {!collapsed && <Link to="/" className="font-display text-sm font-bold text-mint">GPU Anomaly Warning</Link>}
          <button className="rounded p-1 text-muted hover:text-white" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
        {nav}
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative h-full w-64 bg-ink-900"><button className="absolute right-2 top-2 p-1" aria-label="Close menu" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button><div className="pt-10">{nav}</div></div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-line bg-ink-900/80 px-4">
          <button className="md:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
          <span className="hidden text-sm text-muted sm:block">GPU-Powered Warning System for Hidden Data Anomalies</span>
          <div className="ml-auto flex items-center gap-2">
            <Badge tone={apiOnline ? "good" : apiOnline === false ? "bad" : "neutral"}>API {apiOnline ? "online" : apiOnline === false ? "offline" : "checking"}</Badge>
            <Badge tone={gpu?.available ? "good" : "warn"}>{gpu?.available ? `GPU: ${gpu.device_name}` : "GPU unavailable (CPU-only)"}</Badge>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6"><Outlet /></main>
      </div>
      <div className="fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`flex items-start justify-between gap-2 rounded-md border p-3 text-sm shadow-lg ${t.kind === "error" ? "border-coral/60 bg-ink-900 text-coral" : t.kind === "success" ? "border-mint/50 bg-ink-900 text-mint" : "border-line bg-ink-900"}`}>
            <span>{t.text}</span><button aria-label="Dismiss" onClick={() => dismiss(t.id)}><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

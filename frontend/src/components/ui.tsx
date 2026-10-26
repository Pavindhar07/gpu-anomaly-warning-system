import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <section className={`card p-4 sm:p-5 ${className}`}>{children}</section>
);
export const PageHeader = ({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) => (
  <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div><h1 className="text-2xl font-bold tracking-tight">{title}</h1>{sub && <p className="mt-1 max-w-2xl text-sm text-muted">{sub}</p>}</div>
    {actions}
  </div>
);
type Tone = "neutral" | "good" | "bad" | "warn";
const toneCls: Record<Tone, string> = {
  neutral: "border-line text-slate-300", good: "border-mint/40 bg-mint/10 text-mint",
  bad: "border-coral/50 bg-coral/10 text-coral", warn: "border-amber-warn/50 bg-amber-warn/10 text-amber-warn",
};
export const Badge = ({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) => (
  <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${toneCls[tone]}`}>{children}</span>
);
export const MetricCard = ({ label, value, hint, tone = "neutral" }: { label: string; value: ReactNode; hint?: string; tone?: Tone }) => (
  <div className="card p-4">
    <div className="text-xs text-muted">{label}</div>
    <div className={`mt-1 font-display text-2xl font-bold ${tone === "bad" ? "text-coral" : tone === "good" ? "text-mint" : ""}`}>{value}</div>
    {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
  </div>
);
export const EmptyState = ({ title, body, action }: { title: string; body: string; action?: ReactNode }) => (
  <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
    <Inbox className="h-8 w-8 text-muted" aria-hidden />
    <h2 className="text-lg font-semibold">{title}</h2><p className="max-w-md text-sm text-muted">{body}</p>{action}
  </div>
);
export const LoadingState = ({ label = "Working…" }: { label?: string }) => (
  <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{label}</div>
);
export const ErrorState = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div role="alert" className="flex items-start gap-3 rounded-lg border border-coral/50 bg-coral/10 p-4 text-sm">
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-coral" aria-hidden />
    <div className="flex-1"><p>{message}</p>{onRetry && <button className="btn-ghost mt-2" onClick={onRetry}>Try again</button>}</div>
  </div>
);
export const Notice = ({ tone = "warn", children }: { tone?: Tone; children: ReactNode }) => (
  <div className={`rounded-lg border p-3 text-sm ${toneCls[tone]}`}>{children}</div>
);
export const SeverityBadge = ({ s }: { s: string }) => (
  <Badge tone={s === "high" ? "bad" : s === "moderate" ? "warn" : "neutral"}>{s}</Badge>
);

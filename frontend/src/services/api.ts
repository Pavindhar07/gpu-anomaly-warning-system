import type { AnalysisSummary, AnomalyPage, BenchmarkResult, DatasetInfo, ExecMode, GenerateParams, GpuStatus,
  HealthInfo, MissingPolicy, SeriesData } from "../types";

const DEFAULT_BASE: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";
const KEY = "gpuanomaly.settings.v1";

export function getApiBase(): string {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    if (typeof s.apiBase === "string" && s.apiBase.trim()) return s.apiBase.trim().replace(/\/+$/, "");
  } catch { /* fall through to default */ }
  return DEFAULT_BASE;
}
export const defaultApiBase = DEFAULT_BASE;

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(getApiBase() + path, init);
  } catch {
    throw new ApiError(0, "network", `Cannot reach the API at ${getApiBase()}. Is the backend running? See README > Run locally.`);
  }
  if (!res.ok) {
    let code = "http_error", message = `Request failed (${res.status}).`;
    try {
      const body = await res.json();
      const d = body.detail;
      if (d && typeof d === "object" && !Array.isArray(d)) { code = d.code ?? code; message = d.message ?? message; }
      else if (Array.isArray(d)) message = d.map((e: { loc?: unknown[]; msg: string }) => `${(e.loc ?? []).slice(1).join(".")}: ${e.msg}`).join("; ");
      else if (typeof d === "string") message = d;
    } catch { /* non-JSON error body */ }
    throw new ApiError(res.status, code, message);
  }
  return (await res.json()) as T;
}
const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export interface AnomalyQuery { severity?: string; search?: string; sort_by: string; order: string; page: number; page_size: number }
export interface AnalyzeBody {
  dataset_id: string; sensor_column: string; timestamp_column: string | null; threshold: number; mode: ExecMode;
  missing_policy: MissingPolicy; moderate_z: number; high_z: number;
}

export const api = {
  health: () => request<HealthInfo>("/api/health"),
  gpuStatus: (refresh = false) => request<GpuStatus>(`/api/gpu/status${refresh ? "?refresh=true" : ""}`),
  upload: (file: File) => { const f = new FormData(); f.append("file", file); return request<DatasetInfo>("/api/datasets/upload", { method: "POST", body: f }); },
  generate: (p: GenerateParams) => request<DatasetInfo>("/api/datasets/generate", json(p)),
  analyze: (b: AnalyzeBody) => request<AnalysisSummary>("/api/analyze", json(b)),
  history: () => request<{ analyses: AnalysisSummary[] }>("/api/analyses"),
  series: (id: string, maxPoints: number) => request<SeriesData>(`/api/analysis/${id}/series?max_points=${maxPoints}`),
  anomalies: (id: string, q: AnomalyQuery) => {
    const p = new URLSearchParams({ sort_by: q.sort_by, order: q.order, page: String(q.page), page_size: String(q.page_size) });
    if (q.severity) p.set("severity", q.severity);
    if (q.search) p.set("search", q.search);
    return request<AnomalyPage>(`/api/analysis/${id}/anomalies?${p}`);
  },
  benchmark: (b: { sizes: number[]; repeats: number; seed: number; threshold: number }) => request<BenchmarkResult>("/api/benchmark", json(b)),
  url: {
    sample: () => `${getApiBase()}/api/sample.csv`,
    anomaliesCsv: (id: string) => `${getApiBase()}/api/reports/${id}/anomalies`,
    benchmarkCsv: (id: string) => `${getApiBase()}/api/reports/${id}/benchmark`,
  },
};

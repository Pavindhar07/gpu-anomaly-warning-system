import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, defaultApiBase } from "../services/api";
import type { AnalysisSummary, AppSettings, BenchmarkResult, DatasetInfo, GpuStatus, HealthInfo } from "../types";

const KEY = "gpuanomaly.settings.v1";
export const DEFAULT_SETTINGS: AppSettings = {
  threshold: 3, mode: "auto", maxUploadMb: 100, missingPolicy: "drop", benchRepeats: 5, seed: 42,
  moderateZ: 4, highZ: 5, chartPoints: 2000, apiBase: defaultApiBase,
};

export function validateSettings(s: AppSettings): Record<string, string> {
  const e: Record<string, string> = {};
  if (!(s.threshold > 0 && s.threshold <= 100)) e.threshold = "Enter a threshold above 0 and up to 100.";
  if (!(s.maxUploadMb >= 1 && s.maxUploadMb <= 2048)) e.maxUploadMb = "Enter a size between 1 and 2048 MB.";
  if (!Number.isInteger(s.benchRepeats) || s.benchRepeats < 1 || s.benchRepeats > 50) e.benchRepeats = "Use a whole number from 1 to 50.";
  if (!Number.isInteger(s.seed) || s.seed < 0) e.seed = "Use a whole number of 0 or more.";
  if (!(s.threshold <= s.moderateZ && s.moderateZ <= s.highZ)) e.moderateZ = "Order must be threshold ≤ moderate ≤ high.";
  if (!Number.isInteger(s.chartPoints) || s.chartPoints < 100 || s.chartPoints > 20000) e.chartPoints = "Use 100 to 20,000 points.";
  try { new URL(s.apiBase); } catch { e.apiBase = "Enter a full URL, e.g. http://localhost:8000"; }
  return e;
}

function loadSettings(): AppSettings {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return DEFAULT_SETTINGS; }
}

export interface Toast { id: number; kind: "success" | "error" | "info"; text: string }
interface Ctx {
  settings: AppSettings; saveSettings: (s: AppSettings) => void;
  health: HealthInfo | null; apiOnline: boolean | null; gpu: GpuStatus | null; gpuError: string | null;
  refreshStatus: (forceGpu?: boolean) => Promise<void>;
  dataset: DatasetInfo | null; setDataset: (d: DatasetInfo | null) => void;
  sensorColumn: string; setSensorColumn: (s: string) => void; timeColumn: string; setTimeColumn: (s: string) => void;
  analysis: AnalysisSummary | null; setAnalysis: (a: AnalysisSummary | null) => void;
  history: AnalysisSummary[]; refreshHistory: () => Promise<void>;
  benchmark: BenchmarkResult | null; setBenchmark: (b: BenchmarkResult | null) => void;
  toasts: Toast[]; notify: (kind: Toast["kind"], text: string) => void; dismiss: (id: number) => void;
}
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => { const c = useContext(AppCtx); if (!c) throw new Error("useApp outside provider"); return c; };

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [gpu, setGpu] = useState<GpuStatus | null>(null);
  const [gpuError, setGpuError] = useState<string | null>(null);
  const [dataset, setDatasetState] = useState<DatasetInfo | null>(null);
  const [sensorColumn, setSensorColumn] = useState("");
  const [timeColumn, setTimeColumn] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisSummary | null>(null);
  const [history, setHistory] = useState<AnalysisSummary[]>([]);
  const [benchmark, setBenchmark] = useState<BenchmarkResult | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const saveSettings = (s: AppSettings) => { setSettings(s); localStorage.setItem(KEY, JSON.stringify(s)); };
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const notify = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => dismiss(id), 6000);
  }, [dismiss]);

  const setDataset = (d: DatasetInfo | null) => {
    setDatasetState(d);
    setSensorColumn(d?.suggested_sensor_column ?? "");
    setTimeColumn(d?.suggested_timestamp_column ?? "");
  };

  const refreshStatus = useCallback(async (forceGpu = false) => {
    try { setHealth(await api.health()); setApiOnline(true); } catch { setApiOnline(false); setHealth(null); }
    try { setGpu(await api.gpuStatus(forceGpu)); setGpuError(null); }
    catch (e) { setGpu(null); setGpuError(e instanceof Error ? e.message : "Unknown error"); }
  }, []);
  const refreshHistory = useCallback(async () => {
    try { setHistory((await api.history()).analyses); } catch { /* offline: leave as is */ }
  }, []);

  useEffect(() => { void refreshStatus(); void refreshHistory(); }, [settings.apiBase, refreshStatus, refreshHistory]);

  const value = useMemo<Ctx>(() => ({
    settings, saveSettings, health, apiOnline, gpu, gpuError, refreshStatus, dataset, setDataset, sensorColumn,
    setSensorColumn, timeColumn, setTimeColumn, analysis, setAnalysis, history, refreshHistory, benchmark,
    setBenchmark, toasts, notify, dismiss,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [settings, health, apiOnline, gpu, gpuError, dataset, sensorColumn, timeColumn, analysis, history, benchmark, toasts]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

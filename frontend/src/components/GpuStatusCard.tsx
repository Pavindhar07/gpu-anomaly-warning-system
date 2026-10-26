import { Cpu, RefreshCw } from "lucide-react";
import { useApp } from "../hooks/useApp";
import { Badge, Card, ErrorState } from "./ui";

export default function GpuStatusCard({ compact = false }: { compact?: boolean }) {
  const { gpu, gpuError, refreshStatus, apiOnline } = useApp();
  if (apiOnline === false || gpuError) return <ErrorState message={gpuError ?? "The API is offline, so GPU status is unknown."} onRetry={() => void refreshStatus(true)} />;
  if (!gpu) return <Card><p className="text-sm text-muted">Checking GPU status…</p></Card>;
  const rows: [string, string | number | null][] = [
    ["Device", gpu.device_name], ["Compute capability", gpu.compute_capability],
    ["CUDA runtime", gpu.cuda_runtime_version], ["CUDA driver", gpu.cuda_driver_version],
    ["Multiprocessors", gpu.sm_count], ["Memory (MB)", gpu.total_memory_mb],
    ["Execution source", gpu.source === "remote-cuda" ? `Remote CUDA (${gpu.remote_host})` : gpu.source === "local-cuda" ? "Local CUDA library" : null],
    ["nvcc on this server", gpu.nvcc_found ? "found" : "not found"],
  ];
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Cpu className="h-5 w-5 text-mint" aria-hidden /><h2 className="font-semibold">GPU status</h2>
          <Badge tone={gpu.available ? "good" : "warn"}>{gpu.available ? "CUDA GPU available" : "GPU unavailable: CPU-only mode"}</Badge></div>
        <button className="btn-ghost" onClick={() => void refreshStatus(true)}><RefreshCw className="h-4 w-4" aria-hidden />Re-check</button>
      </div>
      {!gpu.available && <p className="mt-3 text-sm text-muted">{gpu.reason} CPU analysis works normally; nothing is simulated as GPU output.</p>}
      {gpu.available && !compact && (
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          {rows.map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd>{v ?? "n/a"}</dd></div>)}
        </dl>
      )}
    </Card>
  );
}

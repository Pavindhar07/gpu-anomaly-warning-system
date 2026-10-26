import { Play } from "lucide-react";
import { useState } from "react";
import { BenchmarkChart } from "../components/charts";
import GpuStatusCard from "../components/GpuStatusCard";
import { Badge, Card, EmptyState, ErrorState, LoadingState, Notice, PageHeader } from "../components/ui";
import { useApp } from "../hooks/useApp";
import { api } from "../services/api";
import { fmtInt, fmtMs, fmtX, sizeLabel } from "../services/format";

const ALL = [1_000, 10_000, 100_000, 1_000_000, 5_000_000];

export default function Benchmark() {
  const { benchmark, setBenchmark, settings, notify, gpu, health } = useApp();
  const [sizes, setSizes] = useState<number[]>([1_000, 10_000, 100_000, 1_000_000]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const maxSize = health?.limits.max_benchmark_size ?? 5_000_000;

  async function run() {
    setBusy(true); setErr(null);
    try {
      const b = await api.benchmark({ sizes: [...sizes].sort((a, c) => a - c), repeats: settings.benchRepeats, seed: settings.seed, threshold: settings.threshold });
      setBenchmark(b); notify("success", b.gpu_status.available ? "Benchmark finished (CPU and GPU)." : "CPU benchmark finished; GPU results are unavailable.");
    } catch (e) { const m = e instanceof Error ? e.message : "Benchmark failed."; setErr(m); notify("error", m); }
    finally { setBusy(false); }
  }
  const rows = benchmark?.records ?? [];
  const mk = (f: (r: (typeof rows)[number]) => number | null) => rows.map((r) => ({ size: sizeLabel(r.n), v: f(r) }));
  const merge = (cols: Record<string, (r: (typeof rows)[number]) => number | null>) => rows.map((r) => ({ size: sizeLabel(r.n), ...Object.fromEntries(Object.entries(cols).map(([k, f]) => [k, f(r)])) }));
  const hasGpu = rows.some((r) => r.gpu);
  return (
    <>
      <PageHeader title="CPU vs GPU Benchmark" sub="Real measurements on identical data, statistics and thresholds. GPU numbers appear only when a CUDA GPU backend is connected." />
      <div className="mb-4"><GpuStatusCard compact /></div>
      <Card>
        <fieldset><legend className="label">Dataset sizes (readings)</legend>
          <div className="flex flex-wrap gap-3">{ALL.map((n) => (
            <label key={n} className={`flex items-center gap-2 text-sm ${n > maxSize ? "opacity-40" : ""}`}>
              <input type="checkbox" disabled={n > maxSize} checked={sizes.includes(n)} onChange={(e) => setSizes(e.target.checked ? [...sizes, n] : sizes.filter((x) => x !== n))} />{fmtInt(n)}</label>))}</div></fieldset>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={busy || sizes.length === 0} onClick={() => void run()}><Play className="h-4 w-4" aria-hidden />{busy ? "Benchmarking…" : "Run benchmark"}</button>
          <span className="text-xs text-muted">{settings.benchRepeats} timed runs per size (median reported) · seed {settings.seed} · threshold {settings.threshold}. The first GPU call is a warm-up and is not timed.</span>
        </div>
      </Card>
      {busy && <LoadingState label="Running benchmark. Large sizes can take a while…" />}
      {err && <div className="mt-4"><ErrorState message={err} /></div>}
      {!benchmark && !busy && <div className="mt-4"><EmptyState title="No benchmark results yet" body="Run the benchmark to measure CPU time, and GPU time when CUDA is available. No values are shown until they are measured." /></div>}
      {benchmark && (
        <div className="mt-4 space-y-4">
          {!benchmark.gpu_status.available && <Notice>GPU results unavailable: {benchmark.gpu_status.reason} Only CPU measurements are shown. Run the Colab notebook to get real GPU results.</Notice>}
          <Card>
            <div className="mb-3 flex flex-wrap items-center gap-2"><h2 className="font-semibold">Results</h2>
              {hasGpu && <Badge tone="good">GPU: {rows.find((r) => r.gpu)?.gpu?.device_name} ({rows.find((r) => r.gpu)?.gpu?.source})</Badge>}
              <a className="btn-ghost ml-auto" href={api.url.benchmarkCsv(benchmark.benchmark_id)} download>Export CSV</a></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[44rem]"><thead className="bg-ink-800"><tr>
              {["Readings", "CPU median (± sd)", "GPU kernels", "Host→device", "Device→host", "GPU end-to-end (± sd)", "Speedup e2e", "Speedup kernel-only", "CPU/GPU agree"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.n} className="border-t border-line"><td className="td">{fmtInt(r.n)}</td>
                  <td className="td">{fmtMs(r.cpu.median_ms)} <span className="text-xs text-muted">± {fmtMs(r.cpu.stdev_ms)}</span></td>
                  <td className="td">{r.gpu ? fmtMs(r.gpu.kernel.median_ms) : "unavailable"}</td><td className="td">{r.gpu ? fmtMs(r.gpu.h2d.median_ms) : "unavailable"}</td><td className="td">{r.gpu ? fmtMs(r.gpu.d2h.median_ms) : "unavailable"}</td>
                  <td className="td">{r.gpu ? <>{fmtMs(r.gpu.total.median_ms)} <span className="text-xs text-muted">± {fmtMs(r.gpu.total.stdev_ms)}</span></> : "unavailable"}</td>
                  <td className={`td ${r.speedup_end_to_end != null && r.speedup_end_to_end < 1 ? "text-coral" : ""}`}>{fmtX(r.speedup_end_to_end)}</td><td className="td">{fmtX(r.speedup_kernel_only)}</td>
                  <td className="td">{r.agreement ? <Badge tone={r.agreement.passed ? "good" : "bad"}>{r.agreement.passed ? "pass" : `${r.agreement.mismatches_unexplained} mismatches`}</Badge> : "n/a"}</td></tr>))}</tbody></table></div>
            <p className="mt-2 text-xs text-muted">Speedup = CPU median ÷ GPU median. A value below 1× means the GPU was slower. Kernel-only speedup excludes allocation and transfers and is not what a user experiences end to end.</p>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><BenchmarkChart title="Dataset size vs CPU time" unit="ms" data={mk((r) => r.cpu.median_ms).map((d) => ({ size: d.size, cpu: d.v }))} lines={[{ key: "cpu", name: "CPU (NumPy)", color: "#f2b84b" }]} /></Card>
            <Card>{hasGpu ? <BenchmarkChart title="Dataset size vs GPU kernel time" unit="ms" data={merge({ kernel: (r) => r.gpu?.kernel.median_ms ?? null })} lines={[{ key: "kernel", name: "GPU kernels", color: "#6ee7b7" }]} /> : <p className="text-sm text-muted">GPU kernel time: unavailable (no GPU measurements).</p>}</Card>
            <Card>{hasGpu ? <BenchmarkChart title="Dataset size vs end-to-end time" unit="ms" data={merge({ cpu: (r) => r.cpu.median_ms, gpu: (r) => r.gpu?.total.median_ms ?? null })} lines={[{ key: "cpu", name: "CPU", color: "#f2b84b" }, { key: "gpu", name: "GPU end-to-end", color: "#6ee7b7" }]} /> : <p className="text-sm text-muted">End-to-end GPU time: unavailable.</p>}</Card>
            <Card>{hasGpu ? <BenchmarkChart title="Dataset size vs measured speedup" unit="×" data={merge({ e2e: (r) => r.speedup_end_to_end, kernel: (r) => r.speedup_kernel_only })} lines={[{ key: "e2e", name: "End-to-end", color: "#6ee7b7" }, { key: "kernel", name: "Kernel-only", color: "#34b88a" }]} /> : <p className="text-sm text-muted">Speedup: unavailable (needs GPU measurements).</p>}</Card>
          </div>
          <Card><h2 className="mb-2 font-semibold">How to read these results</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
              <li>For small inputs the GPU can lose: allocation, the PCIe copy and kernel launches cost more than the tiny amount of arithmetic.</li>
              <li>The CPU baseline is vectorised NumPy, which is already fast and memory-bound. Expect modest speedups, not orders of magnitude.</li>
              <li>The reduction here is memory-bound, so results depend on the GPU's memory bandwidth and on float64 transfers.</li>
              {benchmark.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul></Card>
        </div>
      )}
      {gpu && !gpu.available && !benchmark && <p className="mt-3 text-xs text-muted">Tip: CPU-only runs still produce real CPU measurements.</p>}
    </>
  );
}

import { useState } from "react";
import { ArchitectureDiagram, CUDA_LIFECYCLE, PIPELINE } from "../components/ArchitectureDiagram";
import GpuStatusCard from "../components/GpuStatusCard";
import { Card, MetricCard, Notice, PageHeader } from "../components/ui";
import { useApp } from "../hooks/useApp";
import { fmtInt, fmtMs } from "../services/format";

const KERNELS = [
  ["k_block_sum", "Parallel sum reduction", "Each block adds a grid-strided slice of the data into shared memory and halves active threads each step."],
  ["k_finalize_mean", "Mean", "One block reduces the per-block partial sums and divides by n on the device."],
  ["k_block_sqdev + k_finalize_var", "Variance", "Reduces (x − mean)² the same way, then writes population variance (÷ n) and σ."],
  ["k_classify", "Z-score and classification", "One thread handles many readings via a grid-stride loop; flags |z| > threshold, with a zero-σ guard."],
];

export default function CudaPage() {
  const { analysis, gpu } = useApp();
  const [tab, setTab] = useState<"gpu" | "arch">("gpu");
  const g = analysis?.timing.gpu;
  return (
    <>
      <PageHeader title="CUDA Architecture" sub="How the GPU implementation works, and the real status of the GPU backend." />
      <div role="tablist" className="mb-4 flex gap-2">
        {([["gpu", "GPU processing"], ["arch", "Architecture explorer"]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`btn ${tab === k ? "bg-ink-700 text-mint" : "border border-line text-slate-300"}`}>{l}</button>))}
      </div>
      {tab === "gpu" ? (
        <div className="space-y-4">
          <GpuStatusCard />
          <Card><h2 className="mb-3 font-semibold">Latest GPU execution</h2>
            {g && analysis ? (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <MetricCard label="Dataset size" value={fmtInt(analysis.readings_analyzed)} /><MetricCard label="Threads per block" value={g.threads_per_block} />
                <MetricCard label="Blocks (reduce / classify)" value={`${fmtInt(g.blocks_reduce)} / ${fmtInt(g.blocks_classify)}`} /><MetricCard label="Allocation" value={fmtMs(g.alloc_ms)} />
                <MetricCard label="Host→device copy" value={fmtMs(g.h2d_ms)} /><MetricCard label="Kernel execution" value={fmtMs(g.kernel_ms)} />
                <MetricCard label="Device→host copy" value={fmtMs(g.d2h_ms)} /><MetricCard label="Total GPU pipeline" value={fmtMs(g.total_ms)} tone="good" />
              </div>
            ) : <p className="text-sm text-muted">{gpu?.available ? "No GPU analysis has been run yet. Run detection in GPU or Automatic mode." : "Unavailable: no CUDA GPU backend is connected, so there are no GPU measurements. Follow the Colab guide in the README."}</p>}
            {g?.network_roundtrip_ms != null && <p className="mt-2 text-xs text-muted">Remote GPU: HTTP round trip {fmtMs(g.network_roundtrip_ms)} is network time, not GPU time.</p>}
          </Card>
          <Card><h2 className="mb-3 font-semibold">CUDA kernels in backend/cuda/anomaly_kernels.cu</h2>
            <ul className="grid gap-3 md:grid-cols-2">{KERNELS.map(([n, t, d]) => <li key={n} className="rounded-md border border-line p-3"><div className="font-mono text-xs text-mint">{n}</div><div className="font-semibold">{t}</div><p className="text-sm text-muted">{d}</p></li>)}</ul></Card>
          <Card><h2 className="mb-2 font-semibold">The CUDA execution model in brief</h2>
            <dl className="grid gap-3 text-sm md:grid-cols-2">
              {[["Host and device", "The CPU (host) runs Python and launches work; the GPU (device) runs kernels on its own memory."],
                ["Threads, blocks, grid", "A kernel launches a grid of thread blocks. Here each block has 256 threads."],
                ["Global and shared memory", "Global memory holds the readings. Shared memory is a fast per-block scratchpad used for reductions."],
                ["Synchronization", "__syncthreads() keeps threads in a block in step; events and synchronize calls make sure GPU work finished before timing stops."]]
                .map(([t, d]) => <div key={t}><dt className="font-semibold">{t}</dt><dd className="text-muted">{d}</dd></div>)}</dl></Card>
          <Notice tone="neutral">Compiler (nvcc) detection refers to the server running the API. A remote GPU (for example Colab) reports its own device information.</Notice>
        </div>
      ) : (
        <div className="space-y-6">
          <section><h2 className="mb-3 text-lg font-semibold">System pipeline</h2><ArchitectureDiagram stages={PIPELINE} label="System pipeline stages" /></section>
          <section><h2 className="mb-3 text-lg font-semibold">CUDA execution lifecycle</h2><ArchitectureDiagram stages={CUDA_LIFECYCLE} label="CUDA lifecycle stages" /></section>
        </div>
      )}
    </>
  );
}

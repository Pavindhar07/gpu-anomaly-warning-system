import { useState } from "react";

export interface Stage { id: string; title: string; input: string; output: string; purpose: string; tech: string }
export function ArchitectureDiagram({ stages, label }: { stages: Stage[]; label: string }) {
  const [sel, setSel] = useState(stages[0].id);
  const cur = stages.find((s) => s.id === sel) ?? stages[0];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,16rem)_1fr]">
      <ol aria-label={label} className="flex flex-col">
        {stages.map((s, i) => (
          <li key={s.id} className="flex flex-col items-stretch">
            <button onClick={() => setSel(s.id)} aria-pressed={sel === s.id}
              className={`rounded-md border px-3 py-2 text-left text-sm ${sel === s.id ? "border-mint bg-ink-700 text-mint" : "border-line bg-ink-900 hover:bg-ink-800"}`}>{s.title}</button>
            {i < stages.length - 1 && <div aria-hidden className="mx-auto h-4 w-px bg-line" />}
          </li>))}
      </ol>
      <div className="card p-4" aria-live="polite">
        <h3 className="text-lg font-semibold">{cur.title}</h3>
        <p className="mt-2 text-sm text-slate-300">{cur.purpose}</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-muted">Input</dt><dd>{cur.input}</dd></div>
          <div><dt className="text-xs text-muted">Output</dt><dd>{cur.output}</dd></div>
          <div><dt className="text-xs text-muted">Technology</dt><dd>{cur.tech}</dd></div>
        </dl>
      </div>
    </div>
  );
}

export const PIPELINE: Stage[] = [
  { id: "csv", title: "CSV dataset", input: "A .csv file or a seeded synthetic generator", output: "A pandas DataFrame held in server memory", purpose: "The sensor readings enter the system. Uploads are size-limited, parsed safely and never executed.", tech: "FastAPI upload, pandas.read_csv" },
  { id: "prep", title: "Data preparation", input: "The chosen sensor column", output: "A clean float64 array plus the original row index of every value", purpose: "Missing, non-numeric and infinite values are counted and handled by the policy you chose (drop, mean, median or stop). Nothing is discarded silently.", tech: "prepare_values() in detection.py" },
  { id: "exec", title: "CPU reference / CUDA GPU", input: "The clean array and the threshold", output: "Mean, variance, std, Z-scores and flags", purpose: "The same algorithm runs on the CPU (NumPy) or on a real CUDA GPU. If you ask for GPU and none exists you get an explicit error, never a CPU result labelled as GPU.", tech: "NumPy / CUDA C++ via ctypes (local or remote)" },
  { id: "stats", title: "Parallel statistical computation", input: "Readings in memory", output: "Mean and population variance", purpose: "On the GPU, thousands of threads each add up a slice of the data, then shared-memory reductions combine the partial sums.", tech: "k_block_sum, k_block_sqdev, finalize kernels" },
  { id: "z", title: "Z-score classification", input: "Readings, mean, std, threshold", output: "z = (x − μ)/σ and a flag when |z| > threshold", purpose: "Every reading is independent at this step, which is exactly what GPUs do best: one thread per reading.", tech: "k_classify / NumPy" },
  { id: "warn", title: "Warning generation", input: "Flags and Z-scores", output: "Warnings with severity low, moderate or high", purpose: "Severity comes from transparent |z| ranges you can change. It describes statistical deviation, not confirmed physical danger.", tech: "severity_of(), anomaly endpoints" },
  { id: "ui", title: "React dashboard", input: "JSON and CSV from the API", output: "Charts, tables, reports and exports", purpose: "Large series are downsampled for drawing (anomalies are always kept) and tables are paginated; the analysis itself always uses every reading.", tech: "React, TypeScript, Recharts" },
];
export const CUDA_LIFECYCLE: Stage[] = [
  { id: "host", title: "Host data", input: "float64 NumPy array on the CPU", output: "A contiguous buffer passed to the CUDA library", purpose: "The host (CPU) owns the data first. ctypes hands a raw pointer to the C API gpu_analyze().", tech: "NumPy, ctypes" },
  { id: "alloc", title: "GPU memory allocation", input: "Array size n", output: "Device buffers for data, Z-scores, flags, partial sums", purpose: "cudaMalloc reserves global memory on the GPU. Allocation takes real time, so it is included in end-to-end timing.", tech: "cudaMalloc, RAII DevBuf" },
  { id: "h2d", title: "Host-to-device copy", input: "Host array", output: "Copy of the readings in GPU global memory", purpose: "Data crosses the PCIe bus once. For small inputs this transfer can cost more than the computation.", tech: "cudaMemcpy (timed with CUDA events)" },
  { id: "launch", title: "Kernel launch", input: "Grid and block dimensions", output: "Work queued on the GPU", purpose: "The host launches a kernel with a grid of blocks of 256 threads. Launches are asynchronous.", tech: "<<<blocks, 256>>>" },
  { id: "threads", title: "Thread and block execution", input: "Block and thread indices", output: "Per-thread partial results", purpose: "Each thread computes its global index and loops over elements with a grid stride, so any n is covered with bounds checks.", tech: "threadIdx, blockIdx, grid-stride loop" },
  { id: "reduce", title: "Parallel reduction", input: "One value per thread", output: "One partial sum per block, then one total", purpose: "Threads in a block add pairs in shared memory, halving the active threads each step with __syncthreads() between steps. A second tiny kernel combines block results.", tech: "__shared__ memory, tree reduction" },
  { id: "cls", title: "Anomaly classification", input: "Readings, mean, std (kept on the GPU)", output: "Z-scores and 0/1 flags in device memory", purpose: "Mean and variance never travel back to the CPU between steps, avoiding extra transfers.", tech: "k_classify" },
  { id: "sync", title: "Synchronization", input: "Queued kernels and copies", output: "All GPU work finished", purpose: "Timing is only valid after the GPU has finished, so the code waits on a CUDA event before stopping the clock.", tech: "cudaEventSynchronize" },
  { id: "d2h", title: "Device-to-host copy", input: "Device results", output: "Z-scores, flags and statistics back in NumPy", purpose: "Results return to the CPU, where they feed the warnings table and charts.", tech: "cudaMemcpy" },
];

import { Download, Printer } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge, Card, EmptyState, PageHeader } from "../components/ui";
import { useApp } from "../hooks/useApp";
import { api } from "../services/api";
import { fmtDate, fmtInt, fmtMs, fmtNum, fmtPct, fmtX } from "../services/format";

function downloadJson(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
const Row = ({ k, v }: { k: string; v: ReactNode }) => <div className="flex justify-between gap-4 border-b border-line py-1.5 text-sm"><dt className="text-muted">{k}</dt><dd className="text-right">{v}</dd></div>;

export default function Reports() {
  const { analysis, benchmark } = useApp();
  if (!analysis && !benchmark) return (<><PageHeader title="Reports" /><EmptyState title="Nothing to report yet" body="Reports contain real values from completed runs. Run an analysis or benchmark first." action={<Link to="/app/datasets" className="btn-primary mt-2">Start with a dataset</Link>} /></>);
  const gAgree = benchmark?.records.filter((r) => r.agreement) ?? [];
  return (
    <>
      <PageHeader title="Reports and exports" sub="Everything below comes from runs on this server. Use the browser's print dialog to save a PDF."
        actions={<button className="btn-ghost no-print" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden />Print / Save as PDF</button>} />
      <div className="grid gap-4 lg:grid-cols-2">
        {analysis && (
          <Card><h2 className="mb-2 font-semibold">Analysis summary</h2>
            <dl>
              <Row k="Run" v={<span className="font-mono text-xs">{analysis.analysis_id}</span>} /><Row k="Date" v={fmtDate(analysis.created_at)} />
              <Row k="Dataset" v={analysis.dataset_name} /><Row k="Sensor column" v={analysis.sensor_column} />
              <Row k="Rows in file / analyzed" v={`${fmtInt(analysis.rows_in_file)} / ${fmtInt(analysis.readings_analyzed)}`} />
              <Row k="Threshold" v={`|z| > ${analysis.threshold}`} /><Row k="Anomalies" v={`${fmtInt(analysis.anomaly_count)} (${fmtPct(analysis.anomaly_pct)})`} />
              <Row k="Mean" v={fmtNum(analysis.stats.mean, 6)} /><Row k="Variance" v={`${fmtNum(analysis.stats.variance, 6)} (${analysis.variance_convention})`} /><Row k="Std deviation" v={fmtNum(analysis.stats.std, 6)} />
              <Row k="Executed on" v={<Badge tone={analysis.executed_on === "gpu" ? "good" : "neutral"}>{analysis.executed_on.toUpperCase()} · {analysis.result_source}</Badge>} />
              <Row k="CPU time" v={fmtMs(analysis.timing.cpu_ms)} /><Row k="GPU end-to-end time" v={fmtMs(analysis.timing.gpu?.total_ms)} />
              <Row k="Missing / non-numeric / infinite" v={`${analysis.quality.missing} / ${analysis.quality.non_numeric} / ${analysis.quality.infinite} (policy: ${analysis.quality.policy})`} />
            </dl>
            <div className="no-print mt-4 flex flex-wrap gap-2">
              <a className="btn-primary" href={api.url.anomaliesCsv(analysis.analysis_id)} download><Download className="h-4 w-4" aria-hidden />Anomalies CSV</a>
              <button className="btn-ghost" onClick={() => downloadJson(`analysis_${analysis.analysis_id}.json`, analysis)}>Summary JSON</button></div>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">{analysis.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </Card>)}
        {benchmark && (
          <Card><h2 className="mb-2 font-semibold">Benchmark summary</h2>
            <dl><Row k="Benchmark" v={<span className="font-mono text-xs">{benchmark.benchmark_id}</span>} /><Row k="Date" v={fmtDate(benchmark.created_at)} />
              <Row k="Repeats per size" v={benchmark.repeats} /><Row k="GPU" v={benchmark.gpu_status.available ? `${benchmark.gpu_status.device_name} (${benchmark.gpu_status.source})` : "unavailable"} /></dl>
            <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[24rem]"><thead><tr><th className="th">n</th><th className="th">CPU</th><th className="th">GPU e2e</th><th className="th">Speedup</th><th className="th">Agree</th></tr></thead>
              <tbody>{benchmark.records.map((r) => <tr key={r.n} className="border-t border-line"><td className="td">{fmtInt(r.n)}</td><td className="td">{fmtMs(r.cpu.median_ms)}</td><td className="td">{r.gpu ? fmtMs(r.gpu.total.median_ms) : "unavailable"}</td><td className="td">{fmtX(r.speedup_end_to_end)}</td><td className="td">{r.agreement ? (r.agreement.passed ? "yes" : "NO") : "n/a"}</td></tr>)}</tbody></table></div>
            <p className="mt-2 text-xs text-muted">{gAgree.length ? `CPU/GPU correctness checked on ${gAgree.length} size(s); max |Δz| = ${Math.max(...gAgree.map((r) => r.agreement!.max_abs_z_diff)).toExponential(2)}.` : "CPU/GPU correctness comparison unavailable: no GPU results."}</p>
            <div className="no-print mt-4 flex flex-wrap gap-2"><a className="btn-primary" href={api.url.benchmarkCsv(benchmark.benchmark_id)} download><Download className="h-4 w-4" aria-hidden />Benchmark CSV</a>
              <button className="btn-ghost" onClick={() => downloadJson(`benchmark_${benchmark.benchmark_id}.json`, benchmark)}>Benchmark JSON</button>
              <Link className="btn-ghost" to="/app/benchmark">View charts</Link></div>
          </Card>)}
      </div>
    </>
  );
}

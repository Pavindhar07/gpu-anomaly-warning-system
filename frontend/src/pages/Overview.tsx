import { Link } from "react-router-dom";
import { MetricCard, Card, EmptyState, PageHeader, Badge, Notice } from "../components/ui";
import GpuStatusCard from "../components/GpuStatusCard";
import AnomalyTable from "../components/AnomalyTable";
import { SensorChart, ZHistogram } from "../components/charts";
import { useEffect, useState } from "react";
import { useApp } from "../hooks/useApp";
import { api } from "../services/api";
import { fmtDate, fmtInt, fmtMs, fmtNum, fmtPct, fmtX } from "../services/format";
import type { SeriesData } from "../types";

export default function Overview() {
  const { analysis, benchmark, dataset, history, settings, apiOnline, setAnalysis, gpu } = useApp();
  const [series, setSeries] = useState<SeriesData | null>(null);
  useEffect(() => {
    setSeries(null);
    if (analysis) api.series(analysis.analysis_id, settings.chartPoints).then(setSeries).catch(() => setSeries(null));
  }, [analysis, settings.chartPoints]);

  const bestRec = benchmark?.records.filter((r) => r.speedup_end_to_end != null).slice(-1)[0];
  const cpuMs = analysis?.timing.cpu_ms ?? null, gpuMs = analysis?.timing.gpu?.total_ms ?? null;
  return (
    <>
      <PageHeader title="Overview" sub="Measured results from your most recent analysis and benchmark. Nothing here is pre-filled." />
      {apiOnline === false && <div className="mb-4"><Notice tone="bad">The backend is not reachable. Start it with <code>uvicorn app.main:app --port 8000</code> from the backend folder (CPU-only mode needs no GPU).</Notice></div>}
      <div className="mb-4"><GpuStatusCard compact /></div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Readings analyzed" value={analysis ? fmtInt(analysis.readings_analyzed) : "n/a"} hint={analysis ? undefined : "Run an analysis"} />
        <MetricCard label="Anomalies" value={analysis ? fmtInt(analysis.anomaly_count) : "n/a"} tone={analysis && analysis.anomaly_count ? "bad" : "neutral"} />
        <MetricCard label="Anomaly percentage" value={analysis ? fmtPct(analysis.anomaly_pct) : "n/a"} />
        <MetricCard label="Executed on" value={analysis ? analysis.executed_on.toUpperCase() : "n/a"} hint={analysis?.result_source} />
        <MetricCard label="CPU execution time" value={fmtMs(cpuMs)} hint={cpuMs == null ? "No CPU analysis yet" : "latest analysis, compute only"} />
        <MetricCard label="GPU end-to-end time" value={fmtMs(gpuMs)} hint={gpuMs == null ? "Unavailable: no GPU analysis yet" : analysis?.timing.gpu?.device_name} />
        <MetricCard label="Measured speedup" value={fmtX(bestRec?.speedup_end_to_end)} hint={bestRec ? `benchmark, n=${fmtInt(bestRec.n)}, end-to-end` : "Needs a GPU benchmark"} tone={bestRec ? "good" : "neutral"} />
        <MetricCard label="GPU status" value={<span className="text-lg">{apiOnline === false ? "API offline" : gpu?.available ? "CUDA available" : "Unavailable"}</span>} tone={gpu?.available ? "good" : "neutral"} hint={gpu?.available ? gpu.device_name ?? undefined : "CPU-only mode"} />
      </div>
      {!analysis ? (
        <EmptyState title="No analysis yet" body="Load a CSV or generate a synthetic dataset, then run anomaly detection. Charts, warnings and reports will appear here."
          action={<div className="mt-2 flex gap-2"><Link to="/app/datasets" className="btn-primary">Open Dataset Explorer</Link>{dataset && <Link to="/app/detection" className="btn-ghost">Run detection</Link>}</div>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2"><h2 className="mb-2 font-semibold">Sensor readings</h2>{series && <SensorChart data={series} mean={analysis.stats.mean} />}
            {series?.downsampled && <p className="mt-2 text-xs text-muted">Showing {fmtInt(series.returned_points)} of {fmtInt(series.total_points)} readings for drawing; all anomalies are kept. Statistics use every reading.</p>}</Card>
          <Card><h2 className="mb-2 font-semibold">Z-score distribution</h2>{series && <ZHistogram data={series} threshold={analysis.threshold} />}</Card>
          <Card><h2 className="mb-3 font-semibold">Dataset summary</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-muted">File</dt><dd className="break-all">{analysis.dataset_name}</dd></div>
              <div><dt className="text-xs text-muted">Sensor column</dt><dd>{analysis.sensor_column}</dd></div>
              <div><dt className="text-xs text-muted">Mean</dt><dd>{fmtNum(analysis.stats.mean)}</dd></div>
              <div><dt className="text-xs text-muted">Std deviation</dt><dd>{fmtNum(analysis.stats.std)}</dd></div>
              <div><dt className="text-xs text-muted">Threshold</dt><dd>|z| &gt; {analysis.threshold}</dd></div>
              <div><dt className="text-xs text-muted">Rows in file</dt><dd>{fmtInt(analysis.rows_in_file)}</dd></div>
            </dl></Card>
          <Card className="lg:col-span-2"><h2 className="mb-3 font-semibold">Recent warnings</h2><AnomalyTable analysisId={analysis.analysis_id} hasTimestamp={!!analysis.timestamp_column} /></Card>
        </div>
      )}
      {history.length > 0 && (
        <Card className="mt-4"><h2 className="mb-3 font-semibold">Analysis history (this server session)</h2>
          <div className="overflow-x-auto"><table className="w-full min-w-[34rem]"><thead><tr><th className="th">When</th><th className="th">Dataset</th><th className="th">Readings</th><th className="th">Anomalies</th><th className="th">Ran on</th><th className="th" /></tr></thead>
            <tbody>{history.slice(0, 8).map((h) => (
              <tr key={h.analysis_id} className="border-t border-line"><td className="td">{fmtDate(h.created_at)}</td><td className="td">{h.dataset_name}</td><td className="td">{fmtInt(h.readings_analyzed)}</td><td className="td">{fmtInt(h.anomaly_count)}</td>
                <td className="td"><Badge tone={h.executed_on === "gpu" ? "good" : "neutral"}>{h.executed_on}</Badge></td>
                <td className="td">{h.data_available ? <button className="btn-ghost py-1" onClick={() => setAnalysis(h)}>Open</button> : <span className="text-xs text-muted">data expired</span>}</td></tr>))}</tbody></table></div></Card>
      )}
    </>
  );
}

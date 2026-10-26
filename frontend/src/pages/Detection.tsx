import { Play } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AnomalyTable from "../components/AnomalyTable";
import { SensorChart, ZHistogram, ZScoreChart } from "../components/charts";
import { Badge, Card, EmptyState, ErrorState, LoadingState, MetricCard, Notice, PageHeader } from "../components/ui";
import { useApp } from "../hooks/useApp";
import { api } from "../services/api";
import { fmtInt, fmtMs, fmtNum, fmtPct } from "../services/format";
import type { ExecMode, MissingPolicy, SeriesData } from "../types";

export default function Detection() {
  const { dataset, sensorColumn, timeColumn, settings, gpu, analysis, setAnalysis, notify, refreshHistory } = useApp();
  const [threshold, setThreshold] = useState(settings.threshold);
  const [mode, setMode] = useState<ExecMode>(settings.mode);
  const [policy, setPolicy] = useState<MissingPolicy>(settings.missingPolicy);
  const [modZ, setModZ] = useState(settings.moderateZ);
  const [highZ, setHighZ] = useState(settings.highZ);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [series, setSeries] = useState<SeriesData | null>(null);

  useEffect(() => {
    setSeries(null);
    if (analysis) api.series(analysis.analysis_id, settings.chartPoints).then(setSeries).catch(() => undefined);
  }, [analysis, settings.chartPoints]);

  if (!dataset) return (<><PageHeader title="Anomaly Detection" /><EmptyState title="Load a dataset first" body="Detection needs a dataset and a sensor column." action={<Link to="/app/datasets" className="btn-primary mt-2">Open Dataset Explorer</Link>} /></>);

  const valid = threshold > 0 && threshold <= 100 && threshold <= modZ && modZ <= highZ && !!sensorColumn;
  async function run() {
    setBusy(true); setErr(null);
    try {
      const a = await api.analyze({ dataset_id: dataset!.dataset_id, sensor_column: sensorColumn, timestamp_column: timeColumn || null, threshold, mode, missing_policy: policy, moderate_z: modZ, high_z: highZ });
      setAnalysis(a); void refreshHistory();
      notify("success", `Analysis finished on ${a.executed_on.toUpperCase()}: ${fmtInt(a.anomaly_count)} anomalies.`);
    } catch (e) { const m = e instanceof Error ? e.message : "Analysis failed."; setErr(m); notify("error", m); }
    finally { setBusy(false); }
  }
  const g = analysis?.timing.gpu;
  return (
    <>
      <PageHeader title="Anomaly Detection" sub="Z-score detection: z = (x − μ) / σ, flagged when |z| > threshold. Variance is the population variance (divide by n) on both CPU and GPU." />
      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><label className="label" htmlFor="thr">Z-score threshold</label><input id="thr" className="input" type="number" step="0.1" min="0.1" max="100" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} aria-invalid={threshold <= 0} /></div>
          <div><label className="label" htmlFor="mode">Execution mode</label>
            <select id="mode" className="input" value={mode} onChange={(e) => setMode(e.target.value as ExecMode)}>
              <option value="auto">Automatic (GPU if available)</option><option value="cpu">CPU</option><option value="gpu">GPU (CUDA only)</option></select></div>
          <div><label className="label" htmlFor="pol">Missing / invalid values</label>
            <select id="pol" className="input" value={policy} onChange={(e) => setPolicy(e.target.value as MissingPolicy)}>
              <option value="drop">Drop (reported)</option><option value="mean">Replace with mean</option><option value="median">Replace with median</option><option value="error">Stop with an error</option></select></div>
          <div className="flex items-end"><button className="btn-primary w-full" disabled={!valid || busy} onClick={() => void run()}><Play className="h-4 w-4" aria-hidden />{busy ? "Running…" : "Run detection"}</button></div>
          <div><label className="label" htmlFor="mz">Moderate severity from |z|</label><input id="mz" className="input" type="number" step="0.1" value={modZ} onChange={(e) => setModZ(Number(e.target.value))} /></div>
          <div><label className="label" htmlFor="hz">High severity from |z|</label><input id="hz" className="input" type="number" step="0.1" value={highZ} onChange={(e) => setHighZ(Number(e.target.value))} /></div>
          <div className="text-xs text-muted sm:col-span-2">Sensor: <b className="text-slate-200">{sensorColumn || "none selected"}</b>{timeColumn && <> · Timestamp: <b className="text-slate-200">{timeColumn}</b></>}. Severity describes statistical deviation, not confirmed danger.</div>
        </div>
        {mode === "gpu" && !gpu?.available && <div className="mt-3"><Notice>No CUDA GPU is available, so a GPU run will fail with an explicit error. Use CPU or Automatic.</Notice></div>}
        {!valid && <p className="mt-2 text-xs text-coral">Check inputs: threshold must be above 0 and not exceed the severity ranges, and a sensor column must be selected.</p>}
      </Card>
      {busy && <LoadingState label="Analyzing…" />}
      {err && <div className="mt-4"><ErrorState message={err} /></div>}
      {analysis && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="good">Completed in {fmtMs(analysis.timing.pipeline_wall_ms)}</Badge>
            <Badge tone={analysis.executed_on === "gpu" ? "good" : "neutral"}>Executed on {analysis.executed_on.toUpperCase()} ({analysis.result_source})</Badge>
            <span className="text-xs text-muted">requested: {analysis.requested_mode}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="Mean (μ)" value={fmtNum(analysis.stats.mean)} /><MetricCard label="Std deviation (σ)" value={fmtNum(analysis.stats.std)} />
            <MetricCard label="Variance (σ²)" value={fmtNum(analysis.stats.variance)} hint="population, ÷ n" />
            <MetricCard label="Anomalies" value={`${fmtInt(analysis.anomaly_count)} (${fmtPct(analysis.anomaly_pct)})`} tone={analysis.anomaly_count ? "bad" : "neutral"} hint={`high ${analysis.severity_counts.high} · moderate ${analysis.severity_counts.moderate} · low ${analysis.severity_counts.low}`} />
          </div>
          {analysis.executed_on === "cpu" && <p className="text-xs text-muted">CPU compute time: {fmtMs(analysis.timing.cpu_ms)}</p>}
          {g && <p className="text-xs text-muted">GPU ({g.device_name}): kernels {fmtMs(g.kernel_ms)} · host→device {fmtMs(g.h2d_ms)} · device→host {fmtMs(g.d2h_ms)} · end-to-end {fmtMs(g.total_ms)} · {g.blocks_reduce} blocks × {g.threads_per_block} threads</p>}
          {(analysis.quality.invalid_total > 0) && <Notice>Data quality: {analysis.quality.missing} missing, {analysis.quality.non_numeric} non-numeric, {analysis.quality.infinite} infinite value(s). Policy "{analysis.quality.policy}": {analysis.quality.dropped} dropped, {analysis.quality.imputed} replaced.</Notice>}
          {analysis.labels_eval && <Card><h2 className="mb-1 font-semibold">Accuracy on injected anomalies</h2>
            <p className="text-sm text-muted">Precision {fmtNum(analysis.labels_eval.precision, 3)} · Recall {fmtNum(analysis.labels_eval.recall, 3)} · F1 {fmtNum(analysis.labels_eval.f1, 3)} (TP {analysis.labels_eval.true_positives}, FP {analysis.labels_eval.false_positives}, FN {analysis.labels_eval.false_negatives}). Normal readings beyond the threshold count as false positives.</p></Card>}
          {analysis.notes.map((n, i) => <Notice key={i} tone={i === 0 && n.includes("zero variance") ? "warn" : "neutral"}>{n}</Notice>)}
          <Card><h2 className="mb-2 font-semibold">Sensor readings</h2>{series ? <SensorChart data={series} mean={analysis.stats.mean} /> : <LoadingState />}
            {series?.downsampled && <p className="mt-2 text-xs text-muted">Showing {fmtInt(series.returned_points)} of {fmtInt(series.total_points)} readings for drawing; all anomalies kept.</p>}</Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><h2 className="mb-2 font-semibold">Z-scores</h2>{series && <ZScoreChart data={series} threshold={analysis.threshold} />}</Card>
            <Card><h2 className="mb-2 font-semibold">Z-score distribution</h2>{series && <ZHistogram data={series} threshold={analysis.threshold} />}</Card>
          </div>
          <Card><h2 className="mb-3 font-semibold">Detected anomalies</h2><AnomalyTable analysisId={analysis.analysis_id} hasTimestamp={!!analysis.timestamp_column} /></Card>
        </div>
      )}
    </>
  );
}

import { Download, Sparkles } from "lucide-react";
import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import DatasetUploader from "../components/DatasetUploader";
import { Badge, Card, EmptyState, LoadingState, MetricCard, Notice, PageHeader } from "../components/ui";
import { useApp } from "../hooks/useApp";
import { api } from "../services/api";
import { fmtInt } from "../services/format";
import type { GenerateParams } from "../types";

const SIZES = [1000, 10000, 100000, 1000000];

export default function Datasets() {
  const { dataset, setDataset, sensorColumn, setSensorColumn, timeColumn, setTimeColumn, settings, notify, health } = useApp();
  const [gp, setGp] = useState<GenerateParams>({ n: 10000, baseline: 50, noise_std: 2, anomaly_count: 20, positive_fraction: 0.5, magnitude_min: 5, magnitude_max: 8, drift_total: 0, seed: settings.seed });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof GenerateParams, v: number) => setGp((p) => ({ ...p, [k]: v }));

  async function generate(e: FormEvent) {
    e.preventDefault();
    if (gp.anomaly_count > gp.n) { notify("error", "Anomaly count cannot exceed the number of readings."); return; }
    if (gp.magnitude_max < gp.magnitude_min) { notify("error", "Maximum magnitude must be at least the minimum."); return; }
    setBusy(true);
    try { const d = await api.generate(gp); setDataset(d); notify("success", `Generated ${d.rows.toLocaleString()} readings.`); }
    catch (err) { notify("error", err instanceof Error ? err.message : "Generation failed."); }
    finally { setBusy(false); }
  }
  const num = (id: string, label: string, k: keyof GenerateParams, step = "any", min?: number) => (
    <div><label className="label" htmlFor={id}>{label}</label>
      <input id={id} className="input" type="number" step={step} min={min} value={gp[k]} onChange={(e) => set(k, Number(e.target.value))} /></div>);

  return (
    <>
      <PageHeader title="Dataset Explorer" sub="Upload a CSV or generate a reproducible synthetic stream. Invalid values are counted and reported, never silently dropped."
        actions={<a className="btn-ghost" href={api.url.sample()} download><Download className="h-4 w-4" aria-hidden />Sample CSV</a>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h2 className="mb-3 font-semibold">Upload CSV</h2><DatasetUploader /></Card>
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-mint" aria-hidden />Generate synthetic data</h2>
          <form onSubmit={generate} className="grid grid-cols-2 gap-3">
            <div><label className="label" htmlFor="g-n">Readings</label>
              <input id="g-n" className="input" type="number" min={10} max={health?.limits.max_synthetic_rows} value={gp.n} onChange={(e) => set("n", Number(e.target.value))} list="sizes" />
              <datalist id="sizes">{SIZES.map((s) => <option key={s} value={s} />)}</datalist></div>
            {num("g-seed", "Random seed", "seed", "1", 0)}
            {num("g-base", "Baseline", "baseline")}{num("g-noise", "Noise (std dev)", "noise_std", "0.1", 0.0001)}
            {num("g-anom", "Anomaly count", "anomaly_count", "1", 0)}{num("g-pos", "Positive share (0–1)", "positive_fraction", "0.1", 0)}
            {num("g-min", "Min offset (× noise)", "magnitude_min", "0.5", 0.1)}{num("g-max", "Max offset (× noise)", "magnitude_max", "0.5", 0.1)}
            {num("g-drift", "Gradual drift (total)", "drift_total")}
            <div className="flex items-end"><button className="btn-primary w-full" disabled={busy}>{busy ? "Generating…" : "Generate"}</button></div>
          </form>
          <p className="mt-2 text-xs text-muted">Same seed and parameters give identical data. Injected anomalies are labelled, so detection precision and recall can be measured. Large sizes need server memory.</p>
        </Card>
      </div>
      {busy && <LoadingState label="Generating dataset…" />}
      {!dataset ? <div className="mt-4"><EmptyState title="No dataset loaded" body="Upload a CSV or generate synthetic readings to preview columns and check data quality." /></div> : (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="Rows" value={fmtInt(dataset.rows)} hint={dataset.name} /><MetricCard label="Columns" value={dataset.columns} />
            <MetricCard label="Duplicate rows" value={fmtInt(dataset.duplicate_rows)} tone={dataset.duplicate_rows ? "bad" : "neutral"} />
            <MetricCard label="Labelled anomalies" value={dataset.has_labels ? "yes" : "no"} hint={dataset.has_labels ? "column is_injected_anomaly" : undefined} />
          </div>
          <Card>
            <h2 className="mb-3 font-semibold">Columns and data quality</h2>
            <div className="overflow-x-auto"><table className="w-full min-w-[34rem]"><thead className="bg-ink-800"><tr><th className="th">Column</th><th className="th">Type</th><th className="th">Missing</th><th className="th">Non-numeric</th><th className="th">Infinite</th></tr></thead>
              <tbody>{dataset.column_info.map((c) => (
                <tr key={c.name} className="border-t border-line"><td className="td">{c.name}</td><td className="td"><Badge>{c.kind}</Badge> <span className="text-xs text-muted">{c.dtype}</span></td>
                  <td className={`td ${c.missing ? "text-amber-warn" : ""}`}>{fmtInt(c.missing)}</td><td className={`td ${c.invalid_numeric ? "text-coral" : ""}`}>{fmtInt(c.invalid_numeric)}</td><td className="td">{fmtInt(c.infinite)}</td></tr>))}</tbody></table></div>
            {dataset.duplicate_rows > 0 && <div className="mt-3"><Notice>Duplicate rows are kept and analyzed as separate readings.</Notice></div>}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="sensor">Sensor column</label>
                <select id="sensor" className="input" value={sensorColumn} onChange={(e) => setSensorColumn(e.target.value)}>
                  <option value="">Select…</option>{dataset.column_info.filter((c) => c.kind === "numeric" || c.kind === "numeric_text").map((c) => <option key={c.name}>{c.name}</option>)}</select></div>
              <div><label className="label" htmlFor="ts">Timestamp column (optional)</label>
                <select id="ts" className="input" value={timeColumn} onChange={(e) => setTimeColumn(e.target.value)}>
                  <option value="">None</option>{dataset.column_info.map((c) => <option key={c.name}>{c.name}</option>)}</select></div>
            </div>
            <div className="mt-4"><Link to="/app/detection" className={`btn-primary ${sensorColumn ? "" : "pointer-events-none opacity-50"}`}>Continue to anomaly detection</Link></div>
          </Card>
          <Card><h2 className="mb-3 font-semibold">Preview (first {dataset.preview.length} rows)</h2>
            <div className="overflow-x-auto"><table className="w-full min-w-[30rem]"><thead className="bg-ink-800"><tr>{dataset.column_info.map((c) => <th className="th" key={c.name}>{c.name}</th>)}</tr></thead>
              <tbody>{dataset.preview.map((r, i) => <tr key={i} className="border-t border-line">{dataset.column_info.map((c) => <td className="td" key={c.name}>{r[c.name] == null ? <span className="text-amber-warn">missing</span> : String(r[c.name])}</td>)}</tr>)}</tbody></table></div></Card>
        </div>
      )}
    </>
  );
}

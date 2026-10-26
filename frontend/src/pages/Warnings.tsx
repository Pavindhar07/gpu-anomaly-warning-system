import { Link } from "react-router-dom";
import { useState } from "react";
import AnomalyTable from "../components/AnomalyTable";
import { Badge, Card, EmptyState, MetricCard, Notice, PageHeader, SeverityBadge } from "../components/ui";
import { useApp } from "../hooks/useApp";
import { fmtDate, fmtInt, fmtNum } from "../services/format";
import type { AnomalyRow } from "../types";

export default function Warnings() {
  const { analysis, history, setAnalysis } = useApp();
  const [sel, setSel] = useState<AnomalyRow | null>(null);
  if (!analysis) return (<><PageHeader title="Warning Center" /><EmptyState title="No warnings yet" body="Warnings are created when an analysis flags readings. Run anomaly detection first." action={<Link className="btn-primary mt-2" to="/app/detection">Go to detection</Link>} /></>);
  const latestId = history[0]?.analysis_id;
  const isNew = analysis.analysis_id === latestId;
  return (
    <>
      <PageHeader title="Warning Center" sub="Severity reflects how far a reading is from the mean in standard deviations. It is not confirmation of a physical fault." />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total warnings" value={fmtInt(analysis.anomaly_count)} />
        <MetricCard label="High" value={fmtInt(analysis.severity_counts.high)} tone={analysis.severity_counts.high ? "bad" : "neutral"} hint={`|z| ≥ ${analysis.high_z}`} />
        <MetricCard label="Moderate" value={fmtInt(analysis.severity_counts.moderate)} hint={`${analysis.moderate_z} ≤ |z| < ${analysis.high_z}`} />
        <MetricCard label="Low" value={fmtInt(analysis.severity_counts.low)} hint={`${analysis.threshold} < |z| < ${analysis.moderate_z}`} />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={isNew ? "good" : "neutral"}>{isNew ? "Newly detected (latest run)" : "Historical run"}</Badge>
        <span className="text-muted">Run {analysis.analysis_id} · {fmtDate(analysis.created_at)} · {analysis.method}</span>
        {history.length > 1 && (
          <select aria-label="Choose analysis run" className="input ml-auto w-auto" value={analysis.analysis_id} onChange={(e) => { const h = history.find((x) => x.analysis_id === e.target.value); if (h) { setAnalysis(h); setSel(null); } }}>
            {history.map((h) => <option key={h.analysis_id} value={h.analysis_id} disabled={!h.data_available}>{fmtDate(h.created_at)} · {h.dataset_name} · {h.anomaly_count} warnings{h.data_available ? "" : " (expired)"}</option>)}
          </select>)}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <Card><AnomalyTable analysisId={analysis.analysis_id} hasTimestamp={!!analysis.timestamp_column} onSelect={setSel} selected={sel} /></Card>
        <Card className="h-fit"><h2 className="mb-3 font-semibold">Warning details</h2>
          {!sel ? <p className="text-sm text-muted">Select a row to see its details.</p> : (
            <dl className="space-y-2 text-sm">
              <div><dt className="text-xs text-muted">Observation index</dt><dd>{fmtInt(sel.row_index)}</dd></div>
              <div><dt className="text-xs text-muted">Sensor value</dt><dd>{fmtNum(sel.value, 6)}</dd></div>
              <div><dt className="text-xs text-muted">Z-score</dt><dd>{fmtNum(sel.z_score, 4)}</dd></div>
              <div><dt className="text-xs text-muted">Timestamp</dt><dd>{sel.timestamp ?? "not available"}</dd></div>
              <div><dt className="text-xs text-muted">Detection threshold</dt><dd>|z| &gt; {sel.threshold}</dd></div>
              <div><dt className="text-xs text-muted">Severity</dt><dd><SeverityBadge s={sel.severity} /></dd></div>
              <div><dt className="text-xs text-muted">Method</dt><dd>{sel.method}</dd></div>
              <div><dt className="text-xs text-muted">Analysis run</dt><dd className="font-mono text-xs">{sel.analysis_id}</dd></div>
            </dl>)}
        </Card>
      </div>
      <div className="mt-4"><Notice tone="neutral">No external alerts are sent. Email, SMS or webhook notifications would need an alert integration to be configured and are not part of this build.</Notice></div>
    </>
  );
}

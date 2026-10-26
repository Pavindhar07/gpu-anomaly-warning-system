import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../services/api";
import { fmtInt, fmtNum } from "../services/format";
import type { AnomalyPage, AnomalyRow } from "../types";
import { ErrorState, LoadingState, SeverityBadge } from "./ui";

export default function AnomalyTable({ analysisId, hasTimestamp, onSelect, selected }: {
  analysisId: string; hasTimestamp: boolean; onSelect?: (r: AnomalyRow) => void; selected?: AnomalyRow | null;
}) {
  const [page, setPage] = useState(1);
  const [severity, setSeverity] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState("z_score");
  const [order, setOrder] = useState("desc");
  const [data, setData] = useState<AnomalyPage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const pageSize = 15;

  useEffect(() => { const t = setTimeout(() => { setQ(search); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { setPage(1); }, [analysisId, severity, sortBy, order]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    api.anomalies(analysisId, { severity: severity || undefined, search: q || undefined, sort_by: sortBy, order, page, page_size: pageSize })
      .then((d) => { if (live) { setData(d); setErr(null); } })
      .catch((e: Error) => live && setErr(e.message))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [analysisId, severity, q, sortBy, order, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const sortHead = (key: string, label: string) => (
    <th className="th" aria-sort={sortBy === key ? (order === "asc" ? "ascending" : "descending") : "none"}>
      <button className="hover:text-white" onClick={() => { if (sortBy === key) setOrder(order === "asc" ? "desc" : "asc"); else { setSortBy(key); setOrder("desc"); } }}>
        {label}{sortBy === key ? (order === "asc" ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="min-w-[10rem] flex-1"><label className="label" htmlFor="srch">Search index, value or timestamp</label>
          <div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted" aria-hidden /><input id="srch" className="input pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. 1042" /></div></div>
        <div><label className="label" htmlFor="sev">Severity</label>
          <select id="sev" className="input" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="">All</option><option value="high">High</option><option value="moderate">Moderate</option><option value="low">Low</option></select></div>
        <a className="btn-ghost" href={api.url.anomaliesCsv(analysisId)} download><Download className="h-4 w-4" aria-hidden />Export CSV</a>
      </div>
      {err && <ErrorState message={err} />}
      {loading && !data && <LoadingState label="Loading anomalies…" />}
      {data && (
        <>
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[34rem]">
              <thead className="bg-ink-800"><tr>{sortHead("row_index", "Row")}{hasTimestamp && sortHead("timestamp", "Timestamp")}{sortHead("value", "Reading")}{sortHead("z_score", "Z-score")}<th className="th">Severity</th></tr></thead>
              <tbody>
                {data.items.length === 0 && <tr><td className="td text-muted" colSpan={5}>No anomalies match these filters.</td></tr>}
                {data.items.map((r) => (
                  <tr key={r.row_index} tabIndex={onSelect ? 0 : undefined} onClick={() => onSelect?.(r)} onKeyDown={(e) => e.key === "Enter" && onSelect?.(r)}
                    className={`border-t border-line ${onSelect ? "cursor-pointer hover:bg-ink-800" : ""} ${selected?.row_index === r.row_index ? "bg-ink-700" : ""}`}>
                    <td className="td">{fmtInt(r.row_index)}</td>{hasTimestamp && <td className="td">{r.timestamp ?? "n/a"}</td>}
                    <td className="td">{fmtNum(r.value, 4)}</td><td className={`td ${r.z_score < 0 ? "text-sky-300" : "text-coral"}`}>{fmtNum(r.z_score, 3)}</td>
                    <td className="td"><SeverityBadge s={r.severity} /></td>
                  </tr>))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm text-muted">
            <span>{fmtInt(data.total)} anomalies</span>
            <div className="flex items-center gap-2">
              <button className="btn-ghost px-2" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
              <span>Page {page} of {pages}</span>
              <button className="btn-ghost px-2" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

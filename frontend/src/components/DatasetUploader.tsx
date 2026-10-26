import { UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { useApp } from "../hooks/useApp";
import { api } from "../services/api";
import { LoadingState } from "./ui";

export default function DatasetUploader() {
  const { settings, setDataset, notify } = useApp();
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function handle(file: File | undefined) {
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name)) { notify("error", "Only .csv files are accepted."); return; }
    if (file.size > settings.maxUploadMb * 1024 * 1024) { notify("error", `File is larger than your ${settings.maxUploadMb} MB limit (Settings).`); return; }
    setBusy(true);
    try { const d = await api.upload(file); setDataset(d); notify("success", `Loaded ${d.name}: ${d.rows.toLocaleString()} rows.`); }
    catch (e) { notify("error", e instanceof Error ? e.message : "Upload failed."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  return (
    <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); void handle(e.dataTransfer.files[0]); }}
      className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center ${drag ? "border-mint bg-mint/5" : "border-line"}`}>
      <UploadCloud className="h-8 w-8 text-mint" aria-hidden />
      <p className="text-sm">Drag a CSV file here, or</p>
      <input ref={input} id="csv-input" type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void handle(e.target.files?.[0])} />
      <label htmlFor="csv-input" className="btn-primary cursor-pointer">Choose CSV file</label>
      <p className="text-xs text-muted">Limit {settings.maxUploadMb} MB. Needs one numeric sensor column.</p>
      {busy && <LoadingState label="Uploading and profiling…" />}
    </div>
  );
}

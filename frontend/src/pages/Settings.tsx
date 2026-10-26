import { FormEvent, useState } from "react";
import { Card, PageHeader } from "../components/ui";
import { DEFAULT_SETTINGS, useApp, validateSettings } from "../hooks/useApp";
import type { AppSettings } from "../types";

export default function Settings() {
  const { settings, saveSettings, notify, refreshStatus, health } = useApp();
  const [s, setS] = useState<AppSettings>(settings);
  const errors = validateSettings(s);
  const f = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => setS((p) => ({ ...p, [k]: v }));
  const field = (id: keyof AppSettings, label: string, type = "number", step = "any") => (
    <div><label className="label" htmlFor={`s-${id}`}>{label}</label>
      <input id={`s-${id}`} className="input" type={type} step={step} value={s[id] as string | number} aria-invalid={!!errors[id]}
        onChange={(e) => f(id, (type === "number" ? Number(e.target.value) : e.target.value) as never)} />
      {errors[id] && <p className="mt-1 text-xs text-coral">{errors[id]}</p>}</div>);
  function save(e: FormEvent) {
    e.preventDefault();
    if (Object.keys(errors).length) { notify("error", "Fix the highlighted settings first."); return; }
    saveSettings({ ...s, apiBase: s.apiBase.replace(/\/+$/, "") }); notify("success", "Settings saved in this browser."); void refreshStatus(true);
  }
  return (
    <>
      <PageHeader title="Settings and About" />
      <form onSubmit={save}>
        <Card>
          <h2 className="mb-3 font-semibold">Settings</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {field("threshold", "Default Z-score threshold", "number", "0.1")}
            <div><label className="label" htmlFor="s-mode">Default execution mode</label>
              <select id="s-mode" className="input" value={s.mode} onChange={(e) => f("mode", e.target.value as AppSettings["mode"])}><option value="auto">Automatic</option><option value="cpu">CPU</option><option value="gpu">GPU (CUDA only)</option></select></div>
            <div><label className="label" htmlFor="s-mp">Missing-value handling</label>
              <select id="s-mp" className="input" value={s.missingPolicy} onChange={(e) => f("missingPolicy", e.target.value as AppSettings["missingPolicy"])}><option value="drop">Drop (reported)</option><option value="mean">Replace with mean</option><option value="median">Replace with median</option><option value="error">Stop with an error</option></select></div>
            {field("maxUploadMb", "Maximum upload size (MB, client check)")}
            {field("benchRepeats", "Benchmark repetitions", "number", "1")}
            {field("seed", "Synthetic data random seed", "number", "1")}
            {field("moderateZ", "Moderate severity from |z|", "number", "0.1")}
            {field("highZ", "High severity from |z|", "number", "0.1")}
            {field("chartPoints", "Max chart points (downsampling)", "number", "100")}
            <div className="sm:col-span-2 lg:col-span-3">{field("apiBase", "API base URL (local backend, or a Colab GPU tunnel)", "text")}
              <p className="mt-1 text-xs text-muted">The server also enforces its own limits{health ? ` (upload ${health.limits.max_upload_mb} MB)` : ""}.</p></div>
          </div>
          <div className="mt-4 flex gap-2"><button className="btn-primary">Save settings</button><button type="button" className="btn-ghost" onClick={() => setS(DEFAULT_SETTINGS)}>Reset to defaults</button></div>
        </Card>
      </form>
      <Card className="mt-4">
        <h2 className="mb-2 font-semibold">About</h2>
        <div className="space-y-3 text-sm text-slate-300">
          <p><b>Objective.</b> Show how CUDA parallel computing can accelerate statistical anomaly detection on large sensor datasets, compared with a CPU implementation.</p>
          <p><b>Problem.</b> Unusual sensor readings are easy to miss in large streams, and analyzing them sequentially becomes expensive as data grows.</p>
          <p><b>Algorithm.</b> z = (x − μ) / σ with population variance (÷ n). A reading is flagged when |z| exceeds the threshold. If σ is effectively zero, nothing is flagged. Limitations: assumes roughly normal, stationary data, and outliers inflate σ; flagged readings are not confirmed faults.</p>
          <p><b>Architecture.</b> React + TypeScript frontend → FastAPI backend → NumPy CPU reference, or CUDA C++ kernels loaded locally or reached through a remote GPU backend.</p>
          <p><b>Technologies.</b> CUDA C++, Python, NumPy, pandas, FastAPI, React, TypeScript, Vite, Tailwind CSS, Recharts.</p>
          <div><b>Team.</b><ul className="mt-1 list-disc pl-5"><li>Pavindhar P, 23MID0246</li><li>Athiyamaan S, 23MID0245</li><li>Mohan Raj I, 23MID0121</li></ul></div>
        </div>
      </Card>
    </>
  );
}

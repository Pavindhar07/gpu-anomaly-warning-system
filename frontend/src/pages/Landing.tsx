import { ArrowRight, Database, Cpu, Radar, BellRing, LineChart, Wand2 } from "lucide-react";
import { Link } from "react-router-dom";

const STEPS = [
  { t: "Dataset input", d: "Upload a CSV or generate a seeded synthetic stream.", i: Database },
  { t: "Data preparation", d: "Count and handle missing or invalid readings explicitly.", i: Wand2 },
  { t: "GPU processing", d: "CUDA kernels compute mean and variance in parallel.", i: Cpu },
  { t: "Anomaly detection", d: "Flag readings whose Z-score exceeds the threshold.", i: Radar },
  { t: "Warning generation", d: "Rank deviations as low, moderate or high.", i: BellRing },
  { t: "Visualization dashboard", d: "Explore charts, tables and exports.", i: LineChart },
];
const STACK = [
  ["CUDA C++", "Reduction and classification kernels"], ["Python", "Backend logic and the CPU reference"],
  ["NumPy", "Vectorised CPU baseline"], ["React", "Typed dashboard UI"], ["FastAPI", "REST API and validation"], ["Recharts", "Interactive charts"],
];

function Illustration() {
  const bars = Array.from({ length: 24 });
  return (
    <svg viewBox="0 0 520 300" className="w-full" role="img" aria-label="Diagram: one CPU core processes readings in sequence while many GPU threads process them in parallel, and a coral reading is flagged as an anomaly">
      <rect x="0" y="0" width="520" height="300" rx="10" fill="#0a1d16" stroke="#1d3b2e" />
      <text x="20" y="30" fill="#8fa89c" fontSize="12">CPU: one reading after another</text>
      {Array.from({ length: 14 }).map((_, i) => <rect key={i} x={20 + i * 34} y="42" width="26" height="26" rx="3" fill={i < 5 ? "#34b88a" : "#17382b"} />)}
      <text x="20" y="100" fill="#8fa89c" fontSize="12">GPU: thousands of threads, each takes a slice</text>
      {bars.map((_, i) => <rect key={i} x={20 + (i % 12) * 40} y={114 + Math.floor(i / 12) * 30} width="32" height="22" rx="3" fill="#6ee7b7" opacity={0.35 + ((i * 7) % 5) * 0.13} />)}
      <polyline points="20,262 70,258 120,264 170,257 220,262 270,215 320,261 370,258 420,263 470,259 500,262" fill="none" stroke="#6ee7b7" strokeWidth="2" />
      <circle cx="270" cy="215" r="6" fill="#ff6b57" /><text x="282" y="212" fill="#ff6b57" fontSize="12">|z| above threshold: warning</text>
    </svg>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-ink-950">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <span className="font-display font-bold text-mint">GPU Anomaly Warning</span>
        <nav className="flex gap-4 text-sm text-muted"><a href="#how" className="hover:text-white">How it works</a><a href="#workflow" className="hover:text-white">Workflow</a></nav>
      </header>
      <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 lg:grid-cols-2">
        <div>
          <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl">GPU-Powered Warning System for Hidden Data Anomalies</h1>
          <p className="mt-4 text-lg text-muted">Detect unusual sensor patterns using CUDA parallel computing.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/app" className="btn-primary">Launch Dashboard <ArrowRight className="h-4 w-4" aria-hidden /></Link>
            <Link to="/app/cuda" className="btn-ghost">Explore Architecture</Link>
          </div>
        </div>
        <Illustration />
      </section>
      <section id="how" className="mx-auto grid max-w-6xl gap-4 px-4 py-10 md:grid-cols-2">
        {[
          ["Hidden anomalies in large sensor streams", "A single drifting or spiking sensor is easy to miss among millions of normal readings. Statistical screening makes unusual values visible so a person can look at them."],
          ["Why sequential analysis gets expensive", "Computing statistics one reading at a time scales linearly with the stream. For very large data the repeated passes over memory become the bottleneck."],
          ["How CUDA parallelism helps", "A GPU runs thousands of threads. Each adds a slice of the data, shared-memory reductions combine the partial sums, and then every reading is scored independently."],
          ["What Z-score screening gives you", "It is simple, explainable and fast: z = (x − μ) / σ, flagged when |z| exceeds a threshold. It assumes roughly bell-shaped, stationary data, so treat flags as leads, not verdicts."],
        ].map(([t, d]) => <article key={t} className="card p-5"><h2 className="text-lg font-semibold">{t}</h2><p className="mt-2 text-sm text-muted">{d}</p></article>)}
      </section>
      <section id="workflow" className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="text-2xl font-bold">Project workflow</h2>
        <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map(({ t, d, i: Icon }, n) => (
            <li key={t} className="card flex gap-3 p-4"><Icon className="mt-1 h-5 w-5 shrink-0 text-mint" aria-hidden /><div><div className="font-semibold">{n + 1}. {t}</div><p className="text-sm text-muted">{d}</p></div></li>))}
        </ol>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="text-2xl font-bold">Technology stack</h2>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{STACK.map(([n, d]) => <li key={n} className="card p-4"><div className="font-semibold text-mint">{n}</div><p className="text-sm text-muted">{d}</p></li>)}</ul>
      </section>
      <footer className="mx-auto max-w-6xl px-4 py-8 text-xs text-muted">GPU Programming academic project. All results shown in the dashboard come from computations you run.</footer>
    </div>
  );
}

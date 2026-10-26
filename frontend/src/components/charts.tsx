import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer,
  Scatter, Tooltip, XAxis, YAxis } from "recharts";
import type { SeriesData } from "../types";
import { fmtNum } from "../services/format";

const axis = { stroke: "#8fa89c", fontSize: 11 };
const tip = { contentStyle: { background: "#0a1d16", border: "1px solid #1d3b2e", borderRadius: 6, fontSize: 12 }, labelStyle: { color: "#8fa89c" } };

export function SensorChart({ data, mean }: { data: SeriesData; mean?: number }) {
  const pts = data.index.map((i, k) => ({ index: i, value: data.value[k], anomaly: data.is_anomaly[k] ? data.value[k] : null }));
  return (
    <div role="img" aria-label="Sensor readings over row index with anomalies highlighted" className="h-72 w-full">
      <ResponsiveContainer>
        <ComposedChart data={pts} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#17382b" strokeDasharray="3 3" />
          <XAxis dataKey="index" type="number" domain={["dataMin", "dataMax"]} {...axis} />
          <YAxis {...axis} domain={["auto", "auto"]} width={56} tickFormatter={(v) => fmtNum(v, 2)} />
          <Tooltip {...tip} formatter={(v: number) => fmtNum(v, 4)} />
          <Line dataKey="value" name="Reading" stroke="#6ee7b7" dot={false} strokeWidth={1.2} isAnimationActive={false} />
          <Scatter dataKey="anomaly" name="Anomaly" fill="#ff6b57" isAnimationActive={false} />
          {mean != null && <ReferenceLine y={mean} stroke="#8fa89c" strokeDasharray="4 4" label={{ value: "mean", fill: "#8fa89c", fontSize: 11 }} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ZScoreChart({ data, threshold }: { data: SeriesData; threshold: number }) {
  const pts = data.index.map((i, k) => ({ index: i, z: data.z[k], anomaly: data.is_anomaly[k] ? data.z[k] : null }));
  return (
    <div role="img" aria-label="Z-scores with threshold lines" className="h-64 w-full">
      <ResponsiveContainer>
        <ComposedChart data={pts} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#17382b" strokeDasharray="3 3" />
          <XAxis dataKey="index" type="number" domain={["dataMin", "dataMax"]} {...axis} />
          <YAxis {...axis} width={40} />
          <Tooltip {...tip} formatter={(v: number) => fmtNum(v, 3)} />
          <ReferenceLine y={threshold} stroke="#f2b84b" strokeDasharray="5 3" label={{ value: `+${threshold}`, fill: "#f2b84b", fontSize: 11 }} />
          <ReferenceLine y={-threshold} stroke="#f2b84b" strokeDasharray="5 3" label={{ value: `-${threshold}`, fill: "#f2b84b", fontSize: 11 }} />
          <Line dataKey="z" name="Z-score" stroke="#34b88a" dot={false} strokeWidth={1} isAnimationActive={false} />
          <Scatter dataKey="anomaly" name="Anomaly" fill="#ff6b57" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ZHistogram({ data, threshold }: { data: SeriesData; threshold: number }) {
  const { edges, counts } = data.histogram;
  const bars = counts.map((c, i) => {
    const lo = edges[i], hi = edges[i + 1], mid = (lo + hi) / 2;
    return { label: mid.toFixed(1), count: c, out: Math.abs(mid) > threshold };
  });
  return (
    <div role="img" aria-label="Distribution of Z-scores; bars beyond the threshold are highlighted" className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={bars} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#17382b" strokeDasharray="3 3" />
          <XAxis dataKey="label" {...axis} interval={4} />
          <YAxis {...axis} width={48} scale="sqrt" />
          <Tooltip {...tip} />
          <Bar dataKey="count" name="Readings" isAnimationActive={false}>{bars.map((b, i) => <Cell key={i} fill={b.out ? "#ff6b57" : "#34b88a"} />)}</Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface LineSpec { key: string; name: string; color: string }
export function BenchmarkChart({ data, lines, unit, title }: { data: Record<string, number | string | null>[]; lines: LineSpec[]; unit: string; title: string }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div role="img" aria-label={title} className="h-60 w-full">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#17382b" strokeDasharray="3 3" />
            <XAxis dataKey="size" {...axis} />
            <YAxis {...axis} width={56} scale="log" domain={["auto", "auto"]} allowDataOverflow tickFormatter={(v) => fmtNum(v, 3)} label={{ value: unit, angle: -90, position: "insideLeft", fill: "#8fa89c", fontSize: 11 }} />
            <Tooltip {...tip} formatter={(v: number) => `${fmtNum(v, 4)} ${unit}`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {lines.map((l) => <Line key={l.key} dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

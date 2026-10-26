export const fmtInt = (n: number | null | undefined) => (n == null ? "n/a" : Math.round(n).toLocaleString("en-US"));
export const fmtNum = (n: number | null | undefined, d = 4) =>
  n == null || !Number.isFinite(n) ? "n/a" : n.toLocaleString("en-US", { maximumFractionDigits: d });
export const fmtMs = (ms: number | null | undefined) => {
  if (ms == null || !Number.isFinite(ms)) return "n/a";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms >= 1) return `${ms.toFixed(2)} ms`;
  return `${(ms * 1000).toFixed(1)} µs`;
};
export const fmtPct = (n: number | null | undefined, d = 2) => (n == null ? "n/a" : `${n.toFixed(d)}%`);
export const fmtX = (n: number | null | undefined) => (n == null ? "n/a" : `${n.toFixed(2)}×`);
export const fmtDate = (iso: string) => new Date(iso).toLocaleString();
export const sizeLabel = (n: number) => (n >= 1e6 ? `${n / 1e6}M` : n >= 1e3 ? `${n / 1e3}K` : String(n));

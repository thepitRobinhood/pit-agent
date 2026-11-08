/* 共享格式化（与官网 thepit 同一口径） */

export function fmtUsd(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const n = v;
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  if (n >= 1) return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 0.01) return "$" + n.toFixed(4);
  if (n > 0) return "$" + n.toPrecision(3);
  return "$0";
}

export function fmtPct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return (v > 0 ? "+" : "") + v.toFixed(2) + "%";
}

export function fmtAge(iso: string | null): string {
  if (!iso) return "—";
  const d = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (!Number.isFinite(d)) return "—";
  if (d < 1) return "<1d";
  if (d < 60) return Math.round(d) + "d";
  return Math.round(d / 30) + "mo";
}

export function utcStamp(d = new Date()): string {
  const p = (x: number) => (x < 10 ? "0" : "") + x;
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
}

import React from 'react';

export interface SeriesConfig {
  key: string;
  label: string;
  color: string;
}

export function TimeSeriesChart<T extends Record<string, number>>({
  data,
  series,
  height = 200,
  xKey = 'tick',
  title,
}: {
  data: T[];
  series: SeriesConfig[];
  height?: number;
  xKey?: string;
  title: string;
}) {
  const width = 640;
  const padL = 44;
  const padR = 16;
  const padT = 14;
  const padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const validData = data.slice(-120);
  let minVal = Number.POSITIVE_INFINITY;
  let maxVal = Number.NEGATIVE_INFINITY;

  for (const row of validData) {
    for (const s of series) {
      const v = row[s.key];
      if (typeof v === 'number' && Number.isFinite(v)) {
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
      }
    }
  }

  if (!Number.isFinite(minVal) || !Number.isFinite(maxVal)) {
    minVal = 0;
    maxVal = 100;
  }
  if (Math.abs(maxVal - minVal) < 1e-4) {
    maxVal += 10;
    minVal = Math.max(0, minVal - 10);
  }

  const yScale = (val: number) => {
    const ratio = (val - minVal) / (maxVal - minVal);
    return padT + plotH - ratio * plotH;
  };

  const xScale = (idx: number) => {
    if (validData.length <= 1) return padL + plotW / 2;
    return padL + (idx / (validData.length - 1)) * plotW;
  };

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="bg-[#0F1623] border border-slate-800/90 rounded-lg p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <h4 className="text-xs font-semibold text-slate-200">{title}</h4>
        <div className="flex flex-wrap items-center gap-3">
          {series.map((s) => {
            const latest = validData.length > 0 ? validData[validData.length - 1][s.key] : 0;
            return (
              <div key={s.key} className="flex items-center gap-1.5 text-[11px] text-slate-300">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-xs"
                  style={{ backgroundColor: s.color }}
                />
                <span>{s.label}:</span>
                <span className="font-mono tabular-nums text-slate-100 font-medium">
                  {typeof latest === 'number' ? latest.toFixed(latest % 1 === 0 ? 0 : 2) : '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {validData.length < 2 ? (
        <div
          style={{ height }}
          className="flex items-center justify-center text-xs text-slate-500 border border-dashed border-slate-800 rounded"
        >
          بانتظار تراكم نقاط القياس الزمنية...
        </div>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
          {gridLines.map((g) => {
            const y = padT + g * plotH;
            const labelVal = maxVal - g * (maxVal - minVal);
            return (
              <g key={g}>
                <line
                  x1={padL}
                  y1={y}
                  x2={width - padR}
                  y2={y}
                  stroke="#1E293B"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
                <text
                  x={padL - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill="#64748B"
                  fontSize="10"
                  className="font-mono tabular-nums"
                >
                  {labelVal.toFixed(Math.abs(maxVal - minVal) < 5 ? 1 : 0)}
                </text>
              </g>
            );
          })}

          {series.map((s) => {
            const points = validData
              .map((row, idx) => `${xScale(idx).toFixed(1)},${yScale(row[s.key] ?? 0).toFixed(1)}`)
              .join(' ');
            return (
              <polyline
                key={s.key}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={points}
              />
            );
          })}

          <text
            x={padL}
            y={height - 6}
            fill="#64748B"
            fontSize="10"
            className="font-mono tabular-nums"
          >
            T{validData[0][xKey] ?? 0}
          </text>
          <text
            x={width - padR}
            y={height - 6}
            textAnchor="end"
            fill="#64748B"
            fontSize="10"
            className="font-mono tabular-nums"
          >
            T{validData[validData.length - 1][xKey] ?? 0}
          </text>
        </svg>
      )}
    </div>
  );
}

export function HorizontalDistributionBars({
  title,
  items,
  accentClass = 'bg-cyan-500',
}: {
  title: string;
  items: Array<{ label: string; value: number; subLabel?: string }>;
  accentClass?: string;
}) {
  const maxVal = Math.max(1, ...items.map((i) => i.value));

  return (
    <div className="bg-[#0F1623] border border-slate-800/90 rounded-lg p-3.5">
      <h4 className="text-xs font-semibold text-slate-200 mb-3">{title}</h4>
      {items.length === 0 ? (
        <p className="text-xs text-slate-500">لا توجد بيانات مسجلة حتى الآن.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const pct = Math.min(100, Math.round((item.value / maxVal) * 100));
            return (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300 truncate max-w-[65%]">{item.label}</span>
                  <span className="font-mono tabular-nums text-slate-200">
                    {item.value}
                    {item.subLabel ? ` (${item.subLabel})` : ''}
                  </span>
                </div>
                <div className="h-1.5 bg-slate-900 rounded overflow-hidden border border-slate-800/70">
                  <div
                    className={`h-full ${accentClass} transition-all duration-300`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

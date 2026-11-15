import React, { useState } from 'react';
import type { TelemetrySnapshot } from '../shared/types.ts';

interface SeriesConfig {
  key: string;
  labelAr: string;
  color: string;
  accessor: (pt: TelemetrySnapshot['history'][number]) => number;
}

export const TimeSeriesChart: React.FC<{
  titleAr: string;
  subtitleAr: string;
  data: TelemetrySnapshot['history'];
  series: SeriesConfig[];
  height?: number;
}> = ({ titleAr, subtitleAr, data, series, height = 210 }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const width = 620;
  const padX = 44;
  const padY = 20;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const allValues = data.flatMap((pt) => series.map((s) => s.accessor(pt)));
  const minVal = allValues.length > 0 ? Math.min(0, ...allValues) : 0;
  const maxVal = allValues.length > 0 ? Math.max(1, ...allValues) : 100;
  const range = Math.max(1e-4, maxVal - minVal);

  const getX = (idx: number) =>
    data.length <= 1 ? padX : padX + (idx / (data.length - 1)) * innerW;
  const getY = (val: number) => padY + innerH - ((val - minVal) / range) * innerH;

  const hoveredPoint = hoverIdx !== null && data[hoverIdx] ? data[hoverIdx] : null;

  return (
    <div className="bg-[#0F1623] border border-slate-800 rounded-md p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{titleAr}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{subtitleAr}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-0.5"
                style={{ backgroundColor: s.color }}
              />
              <span>{s.labelAr}</span>
            </span>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="h-44 flex items-center justify-center text-xs text-slate-500 border border-dashed border-slate-800 rounded">
          بانتظار تسجيل نقاط القياس الزمنية من المحرك…
        </div>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto select-none"
            onMouseLeave={() => setHoverIdx(null)}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
              const y = padY + innerH * (1 - frac);
              const labelVal = minVal + range * frac;
              return (
                <g key={frac}>
                  <line
                    x1={padX}
                    y1={y}
                    x2={width - padX}
                    y2={y}
                    stroke="#1E293B"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={padX - 6}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-slate-500 text-[10px] font-mono-tabular"
                  >
                    {Math.abs(labelVal) >= 100 ? Math.round(labelVal) : labelVal.toFixed(1)}
                  </text>
                </g>
              );
            })}

            {series.map((s) => {
              const pathD = data
                .map((pt, idx) => {
                  const x = getX(idx).toFixed(1);
                  const y = getY(s.accessor(pt)).toFixed(1);
                  return `${idx === 0 ? 'M' : 'L'}${x},${y}`;
                })
                .join(' ');
              return (
                <path
                  key={s.key}
                  d={pathD}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                />
              );
            })}

            {hoverIdx !== null && data[hoverIdx] && (
              <line
                x1={getX(hoverIdx)}
                y1={padY}
                x2={getX(hoverIdx)}
                y2={height - padY}
                stroke="#475569"
                strokeWidth={1}
              />
            )}

            {data.map((_, idx) => (
              <rect
                key={idx}
                x={getX(idx) - innerW / Math.max(1, data.length) / 2}
                y={padY}
                width={Math.max(4, innerW / Math.max(1, data.length))}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(idx)}
              />
            ))}
          </svg>

          {hoveredPoint && (
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs font-mono-tabular text-slate-300 border-t border-slate-800/80 pt-2">
              <span className="text-slate-400">الدورة: {hoveredPoint.tick}</span>
              {series.map((s) => (
                <span key={s.key} style={{ color: s.color }}>
                  {s.labelAr}: {s.accessor(hoveredPoint)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const BIOME_AR: Record<string, string> = {
  riverbank: 'ضفة نهر',
  savanna: 'سافانا',
  forest: 'غابة',
  rocky_highland: 'مرتفعات صخرية',
  marsh: 'مستنقع',
  arid_steppe: 'سهوب جافة',
};

export const SectorEcologicalMap: React.FC<{
  sectors: TelemetrySnapshot['environment']['sectors'];
  onSelectSector?: (sector: TelemetrySnapshot['environment']['sectors'][number]) => void;
  selectedKey?: string;
}> = ({ sectors, onSelectSector, selectedKey }) => {
  return (
    <div className="bg-[#0F1623] border border-slate-800 rounded-md p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            خريطة قطاعات العالم البيئية (5 كم² — شبكة 10×10)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            تمثيل ثنائي الأبعاد لتوزع الأفراد والمياه والنباتات والملاجئ داخل كل قطاع (0.05 كم² لكل خلية)
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span>أزرق: مياه</span>
          <span>أخضر: غطاء نباتي</span>
          <span>رقم: عدد الأفراد</span>
        </div>
      </div>

      <div className="grid grid-cols-10 gap-1" dir="ltr">
        {sectors.map((sec) => {
          const isSelected = selectedKey === sec.key;
          const plantIntensity = Math.min(1, sec.plantSupply / 260);
          const hasWater = sec.waterVolume > 10;
          const bgStyle = hasWater
            ? `rgba(6, 182, 212, ${0.14 + Math.min(0.45, sec.waterVolume / 1200)})`
            : `rgba(16, 185, 129, ${0.06 + plantIntensity * 0.28})`;

          return (
            <button
              key={sec.key}
              type="button"
              onClick={() => onSelectSector?.(sec)}
              title={`${sec.key} — ${BIOME_AR[sec.biome] ?? sec.biome} | أفراد: ${sec.agentsCount} | نبات: ${sec.plantSupply} | ماء: ${sec.waterVolume}`}
              style={{ backgroundColor: bgStyle }}
              className={`aspect-square rounded-sm border text-[11px] font-mono-tabular flex flex-col items-center justify-center transition-colors cursor-pointer ${
                isSelected
                  ? 'border-cyan-400 ring-1 ring-cyan-400'
                  : sec.predatorsCount > 0
                    ? 'border-amber-500/40 hover:border-amber-400'
                    : 'border-slate-800 hover:border-slate-600'
              }`}
            >
              <span className={sec.agentsCount > 0 ? 'text-slate-100 font-semibold' : 'text-slate-600'}>
                {sec.agentsCount}
              </span>
              {(sec.sheltersBuilt > 0 || sec.foodCaches > 0) && (
                <span className="text-[9px] text-amber-300 leading-none">
                  {sec.sheltersBuilt > 0 ? 'م' : ''}
                  {sec.foodCaches > 0 ? 'خ' : ''}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

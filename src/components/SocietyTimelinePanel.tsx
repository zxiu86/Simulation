import React, { useMemo, useState } from 'react';
import { MessageSquare, Milestone, Radio, Users } from 'lucide-react';
import type { SimulationEvent, TelemetrySnapshot } from '../shared/types.ts';

const SEVERITY_STYLE: Record<SimulationEvent['severity'], string> = {
  info: 'border-slate-700/70 bg-[#070B12] text-slate-200',
  positive: 'border-emerald-700/60 bg-emerald-950/25 text-emerald-200',
  warning: 'border-amber-700/60 bg-amber-950/25 text-amber-200',
  critical: 'border-rose-700/60 bg-rose-950/30 text-rose-200',
};

export function SocietyTimelinePanel({
  snapshot,
  liveEvents,
}: {
  snapshot: TelemetrySnapshot;
  liveEvents: SimulationEvent[];
}) {
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');

  const soc = snapshot.societyAndLanguage;

  const displayedEvents = useMemo(() => {
    const source = liveEvents.length > 0 ? liveEvents : snapshot.recentEvents;
    const q = search.trim().toLowerCase();
    return source.filter((e) => {
      if (typeFilter !== 'all' && e.type !== typeFilter) return false;
      if (q) {
        return (
          e.titleAr.toLowerCase().includes(q) ||
          e.detailAr.toLowerCase().includes(q) ||
          (e.agentName ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [liveEvents, snapshot.recentEvents, typeFilter, search]);

  const distinctTypes = useMemo(() => {
    const set = new Set<string>();
    for (const e of liveEvents.length > 0 ? liveEvents : snapshot.recentEvents) {
      set.add(e.type);
    }
    return Array.from(set).sort();
  }, [liveEvents, snapshot.recentEvents]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between text-slate-400">
            <span>العلاقات الاجتماعية</span>
            <Users className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="font-mono tabular-nums text-xl font-bold text-slate-100 mt-1">
            {soc.totalRelationships}
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            إيجابية: {soc.positiveRelationships} · سلبية: {soc.negativeRelationships}
          </div>
        </div>

        <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3">
          <div className="text-slate-400">معدل التعاون مقابل النزاع</div>
          <div className="font-mono tabular-nums text-xl font-bold text-emerald-300 mt-1">
            {(soc.cooperationRate * 100).toFixed(1)}%
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            نزاع: {(soc.conflictRate * 100).toFixed(1)}% · مجموعات: {soc.formedGroups}
          </div>
        </div>

        <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between text-slate-400">
            <span>تبادل المعرفة والمراقبة</span>
            <MessageSquare className="w-4 h-4 text-amber-400" />
          </div>
          <div className="font-mono tabular-nums text-xl font-bold text-amber-300 mt-1">
            {soc.knowledgeExchanges}
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            تعلم بالمشاهدة: {soc.observationalLearnings}
          </div>
        </div>

        <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3">
          <div className="text-slate-400">الرموز واللغة الناشئة</div>
          <div className="font-mono tabular-nums text-xl font-bold text-violet-300 mt-1">
            {soc.signalsCount} رمز
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            مستوى التواصل: {(soc.collectiveCommunicationLevel * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Emergent Vocabulary & Timeline Milestones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
        <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3.5 space-y-2.5">
          <h4 className="font-semibold text-slate-200">
            قاموس الإشارات والرموز الناشئة طبيعياً ({soc.symbols.length})
          </h4>
          {soc.symbols.length === 0 ? (
            <p className="text-slate-500">لم تتشكل رموز تواصل متفق عليها بعد.</p>
          ) : (
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {soc.symbols.map((sym) => (
                <div
                  key={sym.id}
                  className="p-2 bg-[#070B12] border border-slate-800/80 rounded flex items-center justify-between gap-2"
                >
                  <div>
                    <span className="px-2 py-0.5 bg-violet-950/60 border border-violet-700/60 rounded text-violet-200 font-bold ml-2">
                      {sym.symbol}
                    </span>
                    <span className="text-slate-200">{sym.meaningAr}</span>
                  </div>
                  <div className="font-mono tabular-nums text-[11px] text-slate-400">
                    متبنّون: {sym.adoptersCount} · ثقة {(sym.confidence * 100).toFixed(0)}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3.5 space-y-2.5">
          <div className="flex items-center gap-2 font-semibold text-slate-200">
            <Milestone className="w-4 h-4 text-emerald-400" />
            <span>الخط الزمني للاكتشافات والمحطات التاريخية ({snapshot.timeline.length})</span>
          </div>
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {snapshot.timeline
              .slice()
              .reverse()
              .map((ms) => (
                <div
                  key={ms.id}
                  className="p-2 bg-[#070B12] border border-slate-800/80 rounded space-y-0.5"
                >
                  <div className="flex justify-between">
                    <span className="font-semibold text-cyan-300">{ms.titleAr}</span>
                    <span className="font-mono tabular-nums text-slate-400">
                      T{ms.tick} · الجيل {ms.generation}
                    </span>
                  </div>
                  <div className="text-slate-300 text-[11px]">{ms.descriptionAr}</div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Live Sequenced Telemetry Events Stream */}
      <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3.5 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold text-slate-200">
            <Radio className="w-4 h-4 text-emerald-400" />
            <span>بث الأحداث المتسلسل الحي ({displayedEvents.length})</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="تصفية الأحداث..."
              className="bg-[#070B12] border border-slate-700 rounded px-2.5 py-1 text-slate-100 placeholder:text-slate-500"
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-[#070B12] border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono"
            >
              <option value="all">جميع أنواع الأحداث</option>
              {distinctTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto space-y-1.5">
          {displayedEvents.slice(0, 150).map((evt) => (
            <div
              key={evt.eventId ?? evt.id}
              className={`p-2 rounded border ${SEVERITY_STYLE[evt.severity]}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-cyan-300">
                    #{evt.sequence ?? '—'}
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">{evt.type}</span>
                  <span className="font-semibold">{evt.titleAr}</span>
                </div>
                <span className="font-mono tabular-nums text-[10px] text-slate-400">
                  T{evt.simulationTick ?? evt.tick} · G{evt.generation ?? 1} ·{' '}
                  {new Date(evt.timestamp).toLocaleTimeString('ar-EG')}
                </span>
              </div>
              <div className="text-[11px] opacity-90 mt-1">{evt.detailAr}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import { BookOpen, FlaskConical, Search } from 'lucide-react';
import type { TelemetrySnapshot } from '../shared/types.ts';

const CERTAINTY_AR: Record<string, { label: string; cls: string }> = {
  confirmed: { label: 'مؤكد تجريبياً', cls: 'text-emerald-300 border-emerald-700/60 bg-emerald-950/30' },
  unconfirmed: { label: 'قيد التحقق', cls: 'text-amber-300 border-amber-700/60 bg-amber-950/30' },
  disproven: { label: 'مرفوض / ضار', cls: 'text-rose-300 border-rose-700/60 bg-rose-950/30' },
};

export function KnowledgePanel({ snapshot }: { snapshot: TelemetrySnapshot }) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [certaintyFilter, setCertaintyFilter] = useState('all');

  const filteredKnowledge = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshot.knowledgeItems.filter((k) => {
      if (categoryFilter !== 'all' && k.category !== categoryFilter) return false;
      if (certaintyFilter !== 'all' && k.certaintyStatus !== certaintyFilter) return false;
      if (q) {
        return (
          k.titleAr.toLowerCase().includes(q) ||
          k.summaryAr.toLowerCase().includes(q) ||
          k.entityKey.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [snapshot.knowledgeItems, search, categoryFilter, certaintyFilter]);

  return (
    <div className="space-y-4">
      <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <BookOpen className="w-4 h-4 text-amber-400" />
            <span>سجل المعرفة التراكمية عبر الأجيال ({filteredKnowledge.length})</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث في المعارف..."
                className="bg-[#070B12] border border-slate-700 rounded pr-8 pl-2.5 py-1 text-slate-100 placeholder:text-slate-500"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-[#070B12] border border-slate-700 rounded px-2 py-1 text-slate-200"
            >
              <option value="all">كل الفئات</option>
              <option value="food_plant">النباتات الغذائية</option>
              <option value="water_source">مصادر المياه</option>
              <option value="hunting_method">أساليب الصيد</option>
              <option value="tool">الأدوات والابتكار</option>
              <option value="shelter">المأوى</option>
              <option value="cooperation">التعاون الاجتماعي</option>
              <option value="signal_vocabulary">الإشارات واللغة</option>
              <option value="proto_agriculture">الزراعة الأولية</option>
              <option value="health_remedy">العناية الصحية</option>
            </select>
            <select
              value={certaintyFilter}
              onChange={(e) => setCertaintyFilter(e.target.value)}
              className="bg-[#070B12] border border-slate-700 rounded px-2 py-1 text-slate-200"
            >
              <option value="all">كل حالات اليقين</option>
              <option value="confirmed">مؤكد تجريبياً</option>
              <option value="unconfirmed">قيد التحقق</option>
              <option value="disproven">مرفوض / ضار</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {filteredKnowledge.map((k) => {
            const cert = CERTAINTY_AR[k.certaintyStatus] ?? CERTAINTY_AR.unconfirmed;
            return (
              <div
                key={k.id}
                className="bg-[#070B12] border border-slate-800/90 rounded p-3 space-y-1.5 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-slate-100">{k.titleAr}</div>
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] shrink-0 ${cert.cls}`}>
                    {cert.label}
                  </span>
                </div>
                <div className="text-slate-400 text-[11px]">{k.summaryAr}</div>
                <div className="flex flex-wrap items-center justify-between gap-1 pt-1 border-t border-slate-800/70 text-[11px] font-mono tabular-nums text-slate-300">
                  <span>ثقة: {(k.confidence * 100).toFixed(0)}%</span>
                  <span>
                    تجارب: {k.totalTrials} ({k.uniqueExperimenters} مجرّب)
                  </span>
                  <span>
                    ✓{k.successCount} / ✗{k.failureCount}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  اكتُشف في الجيل {k.discovererGeneration} · T{k.discoveredAtTick} ·{' '}
                  {k.stillActive ? 'مستخدم حالياً' : 'غير نشط مؤخراً'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Collective Experiences Log */}
      <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3.5 space-y-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <FlaskConical className="w-4 h-4 text-cyan-400" />
          <span>أحدث التجارب الحقلية في قاعدة التعلم الجماعي ({snapshot.recentExperiences.length})</span>
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto border border-slate-800 rounded">
          <table className="w-full text-xs text-right">
            <thead className="bg-[#070B12] text-slate-400 sticky top-0">
              <tr>
                <th className="p-2">الدورة</th>
                <th className="p-2">الكيان / القطاع</th>
                <th className="p-2">النتيجة المباشرة والمؤجلة</th>
                <th className="p-2">الظروف</th>
                <th className="p-2">المكافأة</th>
                <th className="p-2">الموثوقية</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {snapshot.recentExperiences.map((ex) => (
                <tr key={ex.id} className="hover:bg-slate-800/30">
                  <td className="p-2 font-mono tabular-nums text-slate-400">
                    T{ex.simTimeTick} (G{ex.generation})
                  </td>
                  <td className="p-2 font-mono text-cyan-300">
                    {ex.entityKey} · ({ex.sectorKey})
                  </td>
                  <td className="p-2 text-slate-200">
                    <div>{ex.immediateOutcome}</div>
                    {ex.delayedOutcomes.length > 0 && (
                      <div className="text-[11px] text-rose-300 mt-0.5">
                        أثر مؤجل: {ex.delayedOutcomes.join('؛ ')}
                      </div>
                    )}
                  </td>
                  <td className="p-2 text-[11px] text-slate-400">
                    {ex.environmentalConditions.biome} / {ex.environmentalConditions.season}
                  </td>
                  <td
                    className={`p-2 font-mono tabular-nums ${
                      ex.reward >= 0 ? 'text-emerald-300' : 'text-rose-400'
                    }`}
                  >
                    {ex.reward >= 0 ? `+${ex.reward}` : ex.reward}
                  </td>
                  <td className="p-2 font-mono tabular-nums">
                    {(ex.reliabilityScore * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

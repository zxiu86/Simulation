import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { CertaintyStatus, KnowledgeCategory, TelemetrySnapshot } from '../shared/types.ts';

const CATEGORY_AR: Record<KnowledgeCategory, string> = {
  food_plant: 'نباتات ومصادر طعام',
  water_source: 'مصادر مياه',
  animal: 'حيوانات',
  hunting_method: 'أساليب صيد',
  tool: 'أدوات بدائية',
  cooperation: 'تعاون ومجتمع',
  signal_vocabulary: 'إشارات ومفردات',
  preservation: 'طرق تخزين وحفظ',
  shelter: 'ملاجئ وبناء',
  health_remedy: 'علاج وصحة',
  proto_agriculture: 'رعاية نباتات (زراعة أولية)',
};

const CERTAINTY_AR: Record<CertaintyStatus, { label: string; cls: string }> = {
  confirmed: { label: 'مؤكدة تجريبياً', cls: 'text-emerald-400' },
  unconfirmed: { label: 'غير مؤكدة / قيد الاختبار', cls: 'text-amber-400' },
  disproven: { label: 'فشلت / خطرة', cls: 'text-rose-400' },
};

export const KnowledgePanel: React.FC<{
  snapshot: TelemetrySnapshot;
}> = ({ snapshot }) => {
  const [certaintyFilter, setCertaintyFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filteredKnowledge = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshot.knowledgeItems.filter((k) => {
      if (certaintyFilter !== 'all' && k.certaintyStatus !== certaintyFilter) return false;
      if (categoryFilter !== 'all' && k.category !== categoryFilter) return false;
      if (
        q &&
        !k.titleAr.toLowerCase().includes(q) &&
        !k.summaryAr.toLowerCase().includes(q) &&
        !k.entityKey.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [snapshot.knowledgeItems, certaintyFilter, categoryFilter, search]);

  const confirmedCount = snapshot.knowledgeItems.filter((k) => k.certaintyStatus === 'confirmed').length;
  const unconfirmedCount = snapshot.knowledgeItems.filter((k) => k.certaintyStatus === 'unconfirmed').length;
  const disprovenCount = snapshot.knowledgeItems.filter((k) => k.certaintyStatus === 'disproven').length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">إجمالي المعارف المكتشفة</div>
          <div className="text-xl font-semibold font-mono-tabular text-slate-100 mt-1">
            {snapshot.knowledgeItems.length}
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">معلومات مؤكدة</div>
          <div className="text-xl font-semibold font-mono-tabular text-emerald-400 mt-1">
            {confirmedCount}
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">غير مؤكدة (تحتاج تكراراً)</div>
          <div className="text-xl font-semibold font-mono-tabular text-amber-400 mt-1">
            {unconfirmedCount}
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">فشلت / خطرة</div>
          <div className="text-xl font-semibold font-mono-tabular text-rose-400 mt-1">
            {disprovenCount}
          </div>
        </div>
      </div>

      <div className="bg-[#0F1623] border border-slate-800 rounded-md p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-semibold text-slate-100">
            سجل المعرفة المشتركة للحضارة ({filteredKnowledge.length})
          </h3>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded p-0.5">
              {[
                { id: 'all', label: 'الكل' },
                { id: 'confirmed', label: 'مؤكدة' },
                { id: 'unconfirmed', label: 'غير مؤكدة' },
                { id: 'disproven', label: 'فاشلة' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setCertaintyFilter(t.id)}
                  className={`px-2.5 py-1 rounded cursor-pointer ${
                    certaintyFilter === t.id
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
            >
              <option value="all">كل التصنيفات</option>
              {Object.entries(CATEGORY_AR).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث في المعارف…"
                className="bg-slate-900 border border-slate-800 rounded pr-8 pl-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[380px]">
          <table className="w-full text-right text-xs border-collapse">
            <thead className="sticky top-0 bg-[#0B111C] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-2">المعرفة / العنصر</th>
                <th className="py-2.5 px-2">التصنيف</th>
                <th className="py-2.5 px-2">المكتشف / الجيل</th>
                <th className="py-2.5 px-2">التجارب (نجاح / فشل)</th>
                <th className="py-2.5 px-2">مجربون مستقلون</th>
                <th className="py-2.5 px-2">مستوى الثقة</th>
                <th className="py-2.5 px-2">الحالة والنشاط</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredKnowledge.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    لا توجد معارف مطابقة للمرشحات الحالية بعد.
                  </td>
                </tr>
              ) : (
                filteredKnowledge.map((k) => {
                  const cert = CERTAINTY_AR[k.certaintyStatus];
                  return (
                    <tr key={k.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-2">
                        <div className="font-medium text-slate-100">{k.titleAr}</div>
                        <div className="text-slate-400 mt-0.5 max-w-md truncate">{k.summaryAr}</div>
                      </td>
                      <td className="py-2.5 px-2 text-slate-300 whitespace-nowrap">
                        {CATEGORY_AR[k.category]}
                      </td>
                      <td className="py-2.5 px-2 font-mono-tabular text-slate-400 whitespace-nowrap">
                        دورة {k.discoveredAtTick} · جيل {k.discovererGeneration}
                      </td>
                      <td className="py-2.5 px-2 font-mono-tabular whitespace-nowrap">
                        <span className="text-slate-200">{k.totalTrials}</span> (
                        <span className="text-emerald-400">{k.successCount}</span> /{' '}
                        <span className="text-rose-400">{k.failureCount}</span>)
                      </td>
                      <td className="py-2.5 px-2 font-mono-tabular text-slate-300">
                        {k.uniqueExperimenters} أفراد
                      </td>
                      <td className="py-2.5 px-2 font-mono-tabular">
                        <span className={cert.cls}>{(k.confidence * 100).toFixed(0)}%</span>
                      </td>
                      <td className="py-2.5 px-2 text-xs whitespace-nowrap">
                        <div className={cert.cls}>{cert.label}</div>
                        <div className="text-slate-500 font-mono-tabular">
                          آخر اختبار: {k.lastTestedTick} · {k.stillActive ? 'مستخدمة حالياً' : 'مهجورة'}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Collective Experience Records */}
      <div className="bg-[#0F1623] border border-slate-800 rounded-md p-4">
        <h3 className="text-sm font-semibold text-slate-100 mb-3">
          أحدث سجلات التجارب الفردية التفصيلية ({snapshot.recentExperiences.length})
        </h3>
        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-right text-xs border-collapse">
            <thead className="sticky top-0 bg-[#0B111C] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2 px-2">الدورة / المكان</th>
                <th className="py-2 px-2">المنفذ / الجيل</th>
                <th className="py-2 px-2">الفعل والسبب</th>
                <th className="py-2 px-2">النتيجة المباشرة والمتأخرة</th>
                <th className="py-2 px-2">المكافأة / الضرر</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {snapshot.recentExperiences.slice(0, 40).map((exp) => (
                <tr key={exp.id}>
                  <td className="py-2 px-2 font-mono-tabular text-slate-400 whitespace-nowrap">
                    {exp.simTimeTick} · ({exp.sectorKey})
                  </td>
                  <td className="py-2 px-2 font-mono-tabular text-slate-300 whitespace-nowrap">
                    {exp.agentId.slice(0, 12)} · جيل {exp.generation}
                  </td>
                  <td className="py-2 px-2">
                    <div className="text-cyan-300">{exp.chosenAction}</div>
                    <div className="text-slate-500">{exp.actionReason}</div>
                  </td>
                  <td className="py-2 px-2">
                    <div className="text-slate-200">{exp.immediateOutcome}</div>
                    {exp.delayedOutcomes.length > 0 && (
                      <div className="text-rose-400 mt-0.5">{exp.delayedOutcomes.join('؛ ')}</div>
                    )}
                  </td>
                  <td className="py-2 px-2 font-mono-tabular whitespace-nowrap">
                    <span className={exp.reward >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {exp.reward}
                    </span>
                    {exp.damages > 0 && <span className="text-rose-400"> (ضرر {exp.damages})</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

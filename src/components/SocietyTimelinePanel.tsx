import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { SimulationEvent, TelemetrySnapshot } from '../shared/types.ts';

const EVENT_TYPE_AR: Record<SimulationEvent['type'], string> = {
  discovery: 'اكتشاف',
  forage: 'طعام',
  water: 'مياه',
  hunt: 'صيد',
  injury: 'إصابة',
  poison: 'تسمم',
  cooperation: 'تعاون',
  sharing: 'مشاركة',
  conflict: 'نزاع',
  reconciliation: 'مصالحة',
  communication: 'تواصل',
  social_learning: 'تعلم بالمشاهدة',
  crafting: 'تصنيع/ابتكار',
  birth: 'ولادة',
  death: 'وفاة',
  crisis: 'أزمة',
  extinction: 'انقراض',
  recovery: 'استعادة',
  training_promotion: 'دمج عقل مدرب',
  reward_hacking_guard: 'ضبط مكافأة',
};

export const SocietyTimelinePanel: React.FC<{
  snapshot: TelemetrySnapshot;
  onSelectAgent: (id: string) => void;
  onSelectGeneration: (gen: number) => void;
}> = ({ snapshot, onSelectAgent, onSelectGeneration }) => {
  const soc = snapshot.societyAndLanguage;
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [genFilter, setGenFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshot.recentEvents.filter((ev) => {
      if (typeFilter !== 'all' && ev.type !== typeFilter) return false;
      if (genFilter !== 'all' && String(ev.generation ?? '') !== genFilter) return false;
      if (
        q &&
        !ev.titleAr.toLowerCase().includes(q) &&
        !ev.detailAr.toLowerCase().includes(q) &&
        !(ev.agentName ?? '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [snapshot.recentEvents, typeFilter, genFilter, search]);

  return (
    <div className="space-y-6">
      {/* Society & Language Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">العلاقات الاجتماعية</div>
          <div className="text-xl font-semibold font-mono-tabular text-slate-100 mt-1">
            {soc.totalRelationships}
          </div>
          <div className="text-xs text-slate-500 font-mono-tabular">
            إيجابية {soc.positiveRelationships} · سلبية {soc.negativeRelationships}
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">المجموعات المتشكلة</div>
          <div className="text-xl font-semibold font-mono-tabular text-cyan-400 mt-1">
            {soc.formedGroups}
          </div>
          <div className="text-xs text-slate-500">تجمعات (3+ أفراد)</div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">معدل التعاون / النزاع</div>
          <div className="text-xl font-semibold font-mono-tabular text-emerald-400 mt-1">
            {(soc.cooperationRate * 100).toFixed(0)}% / {(soc.conflictRate * 100).toFixed(0)}%
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">التعلم بالمشاهدة</div>
          <div className="text-xl font-semibold font-mono-tabular text-slate-100 mt-1">
            {soc.observationalLearnings}
          </div>
          <div className="text-xs text-slate-500 font-mono-tabular">
            تبادل معرفي: {soc.knowledgeExchanges}
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">الرموز الصوتية الناشئة</div>
          <div className="text-xl font-semibold font-mono-tabular text-amber-400 mt-1">
            {soc.signalsCount}
          </div>
          <div className="text-xs text-slate-500 font-mono-tabular">
            مفردات مكتسبة: {soc.vocabularyCount}
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">مستوى التواصل الجماعي</div>
          <div className="text-xl font-semibold font-mono-tabular text-cyan-400 mt-1">
            {(soc.collectiveCommunicationLevel * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Emergent Vocabulary + Historical Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-4">
          <h3 className="text-sm font-semibold text-slate-100 mb-3">
            الإشارات والمفردات الناشئة بالتفاعل (بدون لغة مسبقة)
          </h3>
          {soc.symbols.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded">
              لم تنشأ رموز تواصل مشتركة بعد؛ ستظهر هنا بمجرد تبني الأفراد إشارات ذات معنى متفق عليه.
            </div>
          ) : (
            <div className="space-y-2 text-xs max-h-64 overflow-y-auto">
              {soc.symbols.map((sym) => (
                <div
                  key={sym.id}
                  className="border border-slate-800 rounded p-2.5 flex items-center justify-between gap-2"
                >
                  <div>
                    <span className="text-sm font-semibold text-cyan-300">"{sym.symbol}"</span>
                    <span className="text-slate-300 mr-2">— {sym.meaningAr}</span>
                    <div className="text-slate-500 font-mono-tabular mt-0.5">
                      النشأة: دورة {sym.createdTick} (جيل {sym.generation})
                    </div>
                  </div>
                  <div className="text-left font-mono-tabular">
                    <div className="text-emerald-400">متبنّون: {sym.adoptersCount}</div>
                    <div className="text-slate-400">ثقة: {(sym.confidence * 100).toFixed(0)}%</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-4">
          <h3 className="text-sm font-semibold text-slate-100 mb-3">
            الخط الزمني التاريخي للحضارة ({snapshot.timeline.length} محطة فعلية)
          </h3>
          <div className="max-h-64 overflow-y-auto space-y-2 text-xs">
            {snapshot.timeline
              .slice()
              .reverse()
              .map((ms) => (
                <div
                  key={ms.id}
                  className="border border-slate-800/80 rounded p-2.5 flex items-start justify-between gap-3"
                >
                  <div>
                    <div className="font-semibold text-slate-100">{ms.titleAr}</div>
                    <div className="text-slate-400 mt-0.5">{ms.descriptionAr}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectGeneration(ms.generation)}
                    className="font-mono-tabular text-cyan-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    دورة {ms.tick} · جيل {ms.generation}
                  </button>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Live Filterable Events Stream */}
      <div className="bg-[#0F1623] border border-slate-800 rounded-md p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-semibold text-slate-100">
            سجل الأحداث الحية من المحرك ({filteredEvents.length})
          </h3>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
            >
              <option value="all">جميع الأنواع</option>
              {Object.entries(EVENT_TYPE_AR).map(([k, lbl]) => (
                <option key={k} value={k}>
                  {lbl}
                </option>
              ))}
            </select>

            <select
              value={genFilter}
              onChange={(e) => setGenFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
            >
              <option value="all">كل الأجيال</option>
              {snapshot.generations.map((g) => (
                <option key={g.generation} value={String(g.generation)}>
                  الجيل {g.generation}
                </option>
              ))}
            </select>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث في الأحداث أو الأفراد…"
                className="bg-slate-900 border border-slate-800 rounded pr-8 pl-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto divide-y divide-slate-800/70 text-xs">
          {filteredEvents.length === 0 ? (
            <div className="py-8 text-center text-slate-500">لا توجد أحداث مطابقة.</div>
          ) : (
            filteredEvents.map((ev) => {
              const sevColor =
                ev.severity === 'critical'
                  ? 'text-rose-400'
                  : ev.severity === 'warning'
                    ? 'text-amber-400'
                    : ev.severity === 'positive'
                      ? 'text-emerald-400'
                      : 'text-cyan-400';
              return (
                <div key={ev.id} className="py-2.5 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold ${sevColor}`}>
                        [{EVENT_TYPE_AR[ev.type] ?? ev.type}]
                      </span>
                      <span className="text-slate-100 font-medium">{ev.titleAr}</span>
                    </div>
                    <div className="text-slate-400 mt-0.5">{ev.detailAr}</div>
                  </div>
                  <div className="font-mono-tabular text-slate-400 text-left whitespace-nowrap">
                    <div>
                      دورة {ev.tick}
                      {ev.generation ? ` · جيل ${ev.generation}` : ''}
                      {ev.sectorKey ? ` · قطاع ${ev.sectorKey}` : ''}
                    </div>
                    {ev.agentId && (
                      <button
                        type="button"
                        onClick={() => onSelectAgent(ev.agentId!)}
                        className="text-cyan-400 hover:underline cursor-pointer"
                      >
                        عرض {ev.agentName ?? ev.agentId}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

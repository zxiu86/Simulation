import React, { useMemo, useState } from 'react';
import { Search, ArrowUpDown } from 'lucide-react';
import type { AgentSummaryView, TelemetrySnapshot } from '../shared/types.ts';

type SortKey = 'name' | 'generation' | 'ageTicks' | 'health' | 'hunger' | 'thirst' | 'totalReward' | 'skillsSum';

export const PopulationPanel: React.FC<{
  snapshot: TelemetrySnapshot;
  onSelectAgent: (id: string) => void;
}> = ({ snapshot, onSelectAgent }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'alive' | 'deceased'>('alive');
  const [sortKey, setSortKey] = useState<SortKey>('totalReward');
  const [sortAsc, setSortAsc] = useState(false);

  const pop = snapshot.population;

  const filteredAgents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshot.agents
      .filter((a) => {
        if (statusFilter === 'alive' && !a.alive) return false;
        if (statusFilter === 'deceased' && a.alive) return false;
        if (q && !a.name.toLowerCase().includes(q) && !a.id.toLowerCase().includes(q)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const va = a[sortKey];
        const vb = b[sortKey];
        if (typeof va === 'string' && typeof vb === 'string') {
          return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        return sortAsc ? Number(va) - Number(vb) : Number(vb) - Number(va);
      });
  }, [snapshot.agents, search, statusFilter, sortKey, sortAsc]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc(!sortAsc);
    else {
      setSortKey(k);
      setSortAsc(false);
    }
  };

  const ageTotal = Math.max(1, pop.children + pop.adults + pop.elders);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">السكان الأحياء</div>
          <div className="text-xl font-semibold font-mono-tabular text-cyan-400 mt-1">{pop.alive}</div>
          <div className="text-xs text-slate-500 mt-0.5 font-mono-tabular">متوفون: {pop.deceased}</div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">توزيع الجنس (أحياء)</div>
          <div className="text-xl font-semibold font-mono-tabular text-slate-100 mt-1">
            {pop.females} / {pop.males}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">إناث / ذكور</div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">متوسط العمر والمواليد</div>
          <div className="text-xl font-semibold font-mono-tabular text-slate-100 mt-1">
            {pop.avgLifespanTicks}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 font-mono-tabular">
            معدل التكاثر: {pop.reproductionRate}
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">متوسط الصحة والطاقة</div>
          <div className="text-xl font-semibold font-mono-tabular text-emerald-400 mt-1">
            {pop.avgHealth}%
          </div>
          <div className="text-xs text-slate-500 mt-0.5 font-mono-tabular">طاقة: {pop.avgEnergy}%</div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">متوسط الجوع</div>
          <div className="text-xl font-semibold font-mono-tabular text-amber-400 mt-1">
            {pop.avgHunger}%
          </div>
          <div className="text-xs text-slate-500 mt-0.5">0% شبع تام</div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">متوسط العطش</div>
          <div className="text-xl font-semibold font-mono-tabular text-amber-400 mt-1">
            {pop.avgThirst}%
          </div>
          <div className="text-xs text-slate-500 mt-0.5">0% ارتواء تام</div>
        </div>
      </div>

      {/* Age & Physiological Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-4">
          <h3 className="text-sm font-semibold text-slate-100 mb-3">توزيع الفئات العمرية (الأحياء)</h3>
          <div className="space-y-2.5 text-xs">
            {[
              { label: 'الأطفال (أقل من 60 دورة)', count: pop.children, color: 'bg-cyan-500' },
              { label: 'البالغون (60 – 419 دورة)', count: pop.adults, color: 'bg-emerald-500' },
              { label: 'المسنون (420+ دورة)', count: pop.elders, color: 'bg-amber-500' },
            ].map((row) => (
              <div key={row.label} className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-300">{row.label}</span>
                  <span className="font-mono-tabular text-slate-200">
                    {row.count} ({((row.count / ageTotal) * 100).toFixed(1)}%)
                  </span>
                </div>
                <div className="h-2 bg-slate-900 rounded overflow-hidden">
                  <div
                    className={`h-full ${row.color}`}
                    style={{ width: `${(row.count / ageTotal) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-4">
          <h3 className="text-sm font-semibold text-slate-100 mb-3">مؤشرات التغير السكاني</h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="border border-slate-800 rounded p-2.5">
              <div className="text-slate-400">معدل المواليد (لكل 100 دورة)</div>
              <div className="font-mono-tabular text-base font-semibold text-emerald-400 mt-1">
                {pop.birthRatePer100Ticks}
              </div>
            </div>
            <div className="border border-slate-800 rounded p-2.5">
              <div className="text-slate-400">معدل الوفيات (لكل 100 دورة)</div>
              <div className="font-mono-tabular text-base font-semibold text-rose-400 mt-1">
                {pop.deathRatePer100Ticks}
              </div>
            </div>
            <div className="border border-slate-800 rounded p-2.5">
              <div className="text-slate-400">معدل بقاء الأطفال</div>
              <div className="font-mono-tabular text-base font-semibold text-slate-100 mt-1">
                {(pop.childSurvivalRate * 100).toFixed(1)}%
              </div>
            </div>
            <div className="border border-slate-800 rounded p-2.5">
              <div className="text-slate-400">القادرون على التكاثر</div>
              <div className="font-mono-tabular text-base font-semibold text-cyan-400 mt-1">
                {pop.reproductionCapable} فرد
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sortable Agents Table */}
      <div className="bg-[#0F1623] border border-slate-800 rounded-md p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              سجل الأفراد المستقلين ({filteredAgents.length})
            </h3>
            <p className="text-xs text-slate-400">اضغط على أي فرد لفتح ملفه التفصيلي وعقله وذاكرته</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded p-0.5 text-xs">
              {(
                [
                  { id: 'alive', label: 'الأحياء' },
                  { id: 'deceased', label: 'المتوفون' },
                  { id: 'all', label: 'الكل' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-2.5 py-1 rounded cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو المعرف…"
                className="bg-slate-900 border border-slate-800 rounded pr-8 pl-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[420px]">
          <table className="w-full text-right text-xs border-collapse">
            <thead className="sticky top-0 bg-[#0B111C] text-slate-400 border-b border-slate-800">
              <tr>
                {(
                  [
                    { k: 'name', label: 'الاسم' },
                    { k: 'generation', label: 'الجيل' },
                    { k: 'ageTicks', label: 'العمر' },
                    { k: 'health', label: 'الصحة' },
                    { k: 'hunger', label: 'الجوع' },
                    { k: 'thirst', label: 'العطش' },
                    { k: 'totalReward', label: 'المكافأة' },
                    { k: 'skillsSum', label: 'المهارات' },
                  ] as Array<{ k: SortKey; label: string }>
                ).map((col) => (
                  <th key={col.k} className="py-2.5 px-2 font-medium whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleSort(col.k)}
                      className="inline-flex items-center gap-1 hover:text-slate-200 cursor-pointer"
                    >
                      <span>{col.label}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                ))}
                <th className="py-2.5 px-2 font-medium">القطاع</th>
                <th className="py-2.5 px-2 font-medium">الحالة / آخر فعل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredAgents.slice(0, 100).map((a: AgentSummaryView) => (
                <tr
                  key={a.id}
                  onClick={() => onSelectAgent(a.id)}
                  className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                >
                  <td className="py-2 px-2 font-medium text-cyan-300 whitespace-nowrap">{a.name}</td>
                  <td className="py-2 px-2 font-mono-tabular text-slate-300">{a.generation}</td>
                  <td className="py-2 px-2 font-mono-tabular text-slate-300">{a.ageTicks}</td>
                  <td className="py-2 px-2 font-mono-tabular text-emerald-400">{a.health}%</td>
                  <td className="py-2 px-2 font-mono-tabular text-amber-300">{a.hunger}%</td>
                  <td className="py-2 px-2 font-mono-tabular text-amber-300">{a.thirst}%</td>
                  <td className="py-2 px-2 font-mono-tabular text-slate-200">{a.totalReward}</td>
                  <td className="py-2 px-2 font-mono-tabular text-slate-300">{a.skillsSum}</td>
                  <td className="py-2 px-2 font-mono-tabular text-slate-400">{a.sectorKey}</td>
                  <td className="py-2 px-2 text-slate-400 max-w-xs truncate">
                    {a.alive
                      ? a.lastActionOutcome ?? a.lastAction ?? 'نشط'
                      : `متوفى: ${a.causeOfDeath ?? 'غير محدد'}`}
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

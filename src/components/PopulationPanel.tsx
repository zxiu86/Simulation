import React, { useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import type { TelemetrySnapshot } from '../shared/types.ts';

export function PopulationPanel({
  snapshot,
  onSelectAgent,
  onSelectGeneration,
}: {
  snapshot: TelemetrySnapshot;
  onSelectAgent: (id: string) => void;
  onSelectGeneration: (gen: number) => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'alive' | 'deceased'>('alive');
  const [genFilter, setGenFilter] = useState<string>('all');

  const filteredAgents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshot.agents.filter((a) => {
      if (statusFilter === 'alive' && !a.alive) return false;
      if (statusFilter === 'deceased' && a.alive) return false;
      if (genFilter !== 'all' && String(a.generation) !== genFilter) return false;
      if (q) {
        return (
          a.name.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q) ||
          a.sectorKey.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [snapshot.agents, search, statusFilter, genFilter]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 text-xs">
        <div className="bg-[#0F1623] border border-slate-800 rounded p-2.5">
          <div className="text-slate-400">الأحياء / الوفيات</div>
          <div className="font-mono tabular-nums font-bold text-slate-100 mt-0.5">
            {snapshot.population.alive} / {snapshot.population.deceased}
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded p-2.5">
          <div className="text-slate-400">صغار / بالغون / كبار</div>
          <div className="font-mono tabular-nums font-bold text-cyan-300 mt-0.5">
            {snapshot.population.children} / {snapshot.population.adults} /{' '}
            {snapshot.population.elders}
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded p-2.5">
          <div className="text-slate-400">إناث / ذكور</div>
          <div className="font-mono tabular-nums font-bold text-slate-100 mt-0.5">
            {snapshot.population.females} / {snapshot.population.males}
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded p-2.5">
          <div className="text-slate-400">قادرون على التكاثر</div>
          <div className="font-mono tabular-nums font-bold text-emerald-300 mt-0.5">
            {snapshot.population.reproductionCapable}
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded p-2.5">
          <div className="text-slate-400">متوسط العمر (دورة)</div>
          <div className="font-mono tabular-nums font-bold text-slate-100 mt-0.5">
            {snapshot.population.avgLifespanTicks}
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded p-2.5">
          <div className="text-slate-400">بقاء الصغار</div>
          <div className="font-mono tabular-nums font-bold text-amber-300 mt-0.5">
            {(snapshot.population.childSurvivalRate * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Generations Table */}
      <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200 mb-2.5">
          <Users className="w-4 h-4 text-cyan-400" />
          <span>سجل الأجيال والتعلم التراكمي (اضغط على أي جيل للتفاصيل)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right">
            <thead className="bg-[#070B12] text-slate-400">
              <tr>
                <th className="p-2">الجيل</th>
                <th className="p-2">البداية (Tick)</th>
                <th className="p-2">العدد الكلي</th>
                <th className="p-2">الأحياء</th>
                <th className="p-2">الولادات / الوفيات</th>
                <th className="p-2">متوسط المكافأة</th>
                <th className="p-2">متوسط المهارات</th>
                <th className="p-2">المعارف المكتشفة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
              {snapshot.generations.map((g) => (
                <tr
                  key={g.generation}
                  onClick={() => onSelectGeneration(g.generation)}
                  className="hover:bg-slate-800/40 cursor-pointer"
                >
                  <td className="p-2 text-cyan-300 font-bold">الجيل {g.generation}</td>
                  <td className="p-2">T{g.startedAtTick}</td>
                  <td className="p-2">{g.totalAgents}</td>
                  <td className="p-2 text-emerald-300">{g.aliveCount}</td>
                  <td className="p-2">
                    {g.births} / {g.deaths}
                  </td>
                  <td className="p-2">{g.avgReward}</td>
                  <td className="p-2">{g.avgSkillTotal}</td>
                  <td className="p-2 text-amber-300">{g.knowledgeDiscoveredCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Agents Directory */}
      <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-slate-200">
            دليل الأفراد المستقلين ({filteredAgents.length})
          </h4>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو القطاع..."
                className="bg-[#070B12] border border-slate-700 rounded pr-8 pl-2.5 py-1 text-slate-100 placeholder:text-slate-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'alive' | 'deceased')}
              className="bg-[#070B12] border border-slate-700 rounded px-2 py-1 text-slate-200"
            >
              <option value="alive">الأحياء فقط</option>
              <option value="deceased">المتوفون</option>
              <option value="all">الجميع</option>
            </select>
            <select
              value={genFilter}
              onChange={(e) => setGenFilter(e.target.value)}
              className="bg-[#070B12] border border-slate-700 rounded px-2 py-1 text-slate-200"
            >
              <option value="all">كل الأجيال</option>
              {snapshot.generations.map((g) => (
                <option key={g.generation} value={String(g.generation)}>
                  الجيل {g.generation}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto max-h-96 overflow-y-auto border border-slate-800 rounded">
          <table className="w-full text-xs text-right">
            <thead className="bg-[#070B12] text-slate-400 sticky top-0">
              <tr>
                <th className="p-2">الفرد</th>
                <th className="p-2">الجيل</th>
                <th className="p-2">القطاع</th>
                <th className="p-2">الصحة</th>
                <th className="p-2">الجوع/العطش</th>
                <th className="p-2">المكافأة</th>
                <th className="p-2">الاحتفاظ</th>
                <th className="p-2">آخر قرار ونتيجة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filteredAgents.slice(0, 120).map((a) => (
                <tr
                  key={a.id}
                  onClick={() => onSelectAgent(a.id)}
                  className="hover:bg-slate-800/40 cursor-pointer"
                >
                  <td className="p-2">
                    <div className="font-medium text-cyan-300">{a.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {a.alive ? `${a.ageStage} · ${a.ageTicks}T` : `متوفى: ${a.causeOfDeath}`}
                    </div>
                  </td>
                  <td className="p-2 font-mono tabular-nums">{a.generation}</td>
                  <td className="p-2 font-mono tabular-nums">{a.sectorKey}</td>
                  <td className="p-2 font-mono tabular-nums">
                    <span
                      className={
                        a.health > 65
                          ? 'text-emerald-300'
                          : a.health > 35
                            ? 'text-amber-300'
                            : 'text-rose-400'
                      }
                    >
                      {a.health}%
                    </span>
                  </td>
                  <td className="p-2 font-mono tabular-nums">
                    {a.hunger}% / {a.thirst}%
                  </td>
                  <td className="p-2 font-mono tabular-nums">
                    <span className={a.totalReward >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                      {a.totalReward}
                    </span>
                  </td>
                  <td className="p-2 font-mono tabular-nums">
                    {(a.retentionScore * 100).toFixed(0)}%
                  </td>
                  <td className="p-2 text-slate-300 max-w-xs truncate">
                    {a.lastActionOutcome ?? '—'}
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

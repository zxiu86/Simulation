import React, { useState } from 'react';
import type { TelemetrySnapshot } from '../shared/types.ts';
import { TimeSeriesChart } from './ScientificCharts.tsx';

export const MindsPanel: React.FC<{
  snapshot: TelemetrySnapshot;
  onSelectAgent: (id: string) => void;
  onSelectGeneration: (gen: number) => void;
}> = ({ snapshot, onSelectAgent, onSelectGeneration }) => {
  const m = snapshot.mindsAndLearning;
  const aliveAgents = snapshot.agents.filter((a) => a.alive);
  const [agentAId, setAgentAId] = useState<string>(aliveAgents[0]?.id ?? '');
  const [agentBId, setAgentBId] = useState<string>(aliveAgents[1]?.id ?? '');

  const agentA = snapshot.agents.find((a) => a.id === agentAId) ?? aliveAgents[0];
  const agentB = snapshot.agents.find((a) => a.id === agentBId) ?? aliveAgents[1];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">العقول النشطة / الكلية</div>
          <div className="text-xl font-semibold font-mono-tabular text-cyan-400 mt-1">
            {m.activeBrains} / {m.neuralNetworksCount}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 font-mono-tabular">
            محفوظة: {m.savedBrains} · مستعادة: {m.restoredBrains}
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">خطوات التدريب واسترجاع Replay</div>
          <div className="text-xl font-semibold font-mono-tabular text-slate-100 mt-1">
            {m.totalTrainingSteps.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 font-mono-tabular">
            تجارب مسترجعة: {m.totalExperiencesReplayed.toLocaleString()}
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">الاحتفاظ بالمهارات مقابل النسيان</div>
          <div className="text-xl font-semibold font-mono-tabular text-emerald-400 mt-1">
            {(m.avgRetentionScore * 100).toFixed(1)}%
          </div>
          <div className="text-xs text-slate-500 mt-0.5 font-mono-tabular">
            معدل النسيان: {(m.avgForgettingRate * 100).toFixed(1)}%
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">دقة التنبؤ وتنوع الاستراتيجيات</div>
          <div className="text-xl font-semibold font-mono-tabular text-amber-400 mt-1">
            {(m.predictionAccuracy * 100).toFixed(1)}%
          </div>
          <div className="text-xs text-slate-500 mt-0.5 font-mono-tabular">
            التنوع: {(m.strategyDiversity * 100).toFixed(0)}% · إنذارات استغلال: {m.rewardHackingFlags}
          </div>
        </div>
      </div>

      <TimeSeriesChart
        titleAr="منحنى الاحتفاظ بالمهارات ومعدل النسيان الكارثي"
        subtitleAr="مراقبة استقرار الأوزان العصبية أثناء التعلم المستمر (EWC + Prioritized Replay)"
        data={snapshot.history}
        series={[
          { key: 'ret', labelAr: 'الاحتفاظ بالمهارات %', color: '#10B981', accessor: (p) => Math.round(p.retentionScore * 100) },
          { key: 'forg', labelAr: 'معدل النسيان %', color: '#F43F5E', accessor: (p) => Math.round(p.forgettingRate * 100) },
          { key: 'rew', labelAr: 'متوسط المكافأة', color: '#06B6D4', accessor: (p) => p.avgReward },
        ]}
      />

      {/* Compare Two Independent Individuals */}
      <div className="bg-[#0F1623] border border-slate-800 rounded-md p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              مقارنة استقلالية العقول بين فردين
            </h3>
            <p className="text-xs text-slate-400">
              إثبات تباين الأوزان والسلوك والمهارات وعدم تطابق القرارات بين الأفراد
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={agentA?.id ?? ''}
              onChange={(e) => setAgentAId(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
            >
              {snapshot.agents.slice(0, 80).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (جيل {a.generation})
                </option>
              ))}
            </select>
            <span className="text-slate-500">مقابل</span>
            <select
              value={agentB?.id ?? ''}
              onChange={(e) => setAgentBId(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
            >
              {snapshot.agents.slice(0, 80).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (جيل {a.generation})
                </option>
              ))}
            </select>
          </div>
        </div>

        {agentA && agentB ? (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="py-2 px-2">المعيار</th>
                  <th className="py-2 px-2 text-cyan-300">
                    <button type="button" onClick={() => onSelectAgent(agentA.id)} className="hover:underline cursor-pointer">
                      {agentA.name}
                    </button>
                  </th>
                  <th className="py-2 px-2 text-amber-300">
                    <button type="button" onClick={() => onSelectAgent(agentB.id)} className="hover:underline cursor-pointer">
                      {agentB.name}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono-tabular">
                <tr>
                  <td className="py-2 px-2 text-slate-400 font-sans">الجيل والعمر</td>
                  <td className="py-2 px-2">جيل {agentA.generation} · {agentA.ageTicks} دورة</td>
                  <td className="py-2 px-2">جيل {agentB.generation} · {agentB.ageTicks} دورة</td>
                </tr>
                <tr>
                  <td className="py-2 px-2 text-slate-400 font-sans">إجمالي المكافأة</td>
                  <td className="py-2 px-2">{agentA.totalReward}</td>
                  <td className="py-2 px-2">{agentB.totalReward}</td>
                </tr>
                <tr>
                  <td className="py-2 px-2 text-slate-400 font-sans">نسبة نجاح الأفعال</td>
                  <td className="py-2 px-2">{(agentA.actionSuccessRate * 100).toFixed(1)}%</td>
                  <td className="py-2 px-2">{(agentB.actionSuccessRate * 100).toFixed(1)}%</td>
                </tr>
                <tr>
                  <td className="py-2 px-2 text-slate-400 font-sans">الاحتفاظ بالمهارات</td>
                  <td className="py-2 px-2">{(agentA.retentionScore * 100).toFixed(1)}%</td>
                  <td className="py-2 px-2">{(agentB.retentionScore * 100).toFixed(1)}%</td>
                </tr>
                <tr>
                  <td className="py-2 px-2 text-slate-400 font-sans">مجموع المهارات</td>
                  <td className="py-2 px-2">{agentA.skillsSum}</td>
                  <td className="py-2 px-2">{agentB.skillsSum}</td>
                </tr>
                <tr>
                  <td className="py-2 px-2 text-slate-400 font-sans">المعارف / المفردات</td>
                  <td className="py-2 px-2">{agentA.knowledgeCount} / {agentA.vocabularyCount}</td>
                  <td className="py-2 px-2">{agentB.knowledgeCount} / {agentB.vocabularyCount}</td>
                </tr>
                <tr>
                  <td className="py-2 px-2 text-slate-400 font-sans">آخر قرار متخذ</td>
                  <td className="py-2 px-2 font-sans text-slate-300">{agentA.lastAction ?? '—'}</td>
                  <td className="py-2 px-2 font-sans text-slate-300">{agentB.lastAction ?? '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-xs text-slate-500">لا يوجد عدد كافٍ من الأفراد للمقارنة.</div>
        )}
      </div>

      {/* Generation Comparison Table */}
      <div className="bg-[#0F1623] border border-slate-800 rounded-md p-4">
        <h3 className="text-sm font-semibold text-slate-100 mb-3">مقارنة الأجيال وتراكم التعلم</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse">
            <thead className="border-b border-slate-800 text-slate-400">
              <tr>
                <th className="py-2 px-2">الجيل</th>
                <th className="py-2 px-2">بداية الظهور</th>
                <th className="py-2 px-2">الإجمالي / الأحياء</th>
                <th className="py-2 px-2">متوسط العمر</th>
                <th className="py-2 px-2">متوسط المكافأة</th>
                <th className="py-2 px-2">متوسط المهارات</th>
                <th className="py-2 px-2">بقاء الصغار</th>
                <th className="py-2 px-2">المعارف المكتشفة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono-tabular">
              {snapshot.generations.map((g) => (
                <tr
                  key={g.generation}
                  onClick={() => onSelectGeneration(g.generation)}
                  className="hover:bg-slate-800/40 cursor-pointer"
                >
                  <td className="py-2 px-2 text-cyan-300 font-semibold">الجيل {g.generation}</td>
                  <td className="py-2 px-2 text-slate-400">دورة {g.startedAtTick}</td>
                  <td className="py-2 px-2">
                    {g.totalAgents} / {g.aliveCount}
                  </td>
                  <td className="py-2 px-2">{g.avgLifespanTicks}</td>
                  <td className="py-2 px-2">{g.avgReward}</td>
                  <td className="py-2 px-2">{g.avgSkillTotal}</td>
                  <td className="py-2 px-2">{(g.childSurvivalRate * 100).toFixed(1)}%</td>
                  <td className="py-2 px-2 text-amber-300">{g.knowledgeDiscoveredCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

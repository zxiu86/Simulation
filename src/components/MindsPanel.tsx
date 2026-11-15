import React, { useState } from 'react';
import type { AgentActionType, TelemetrySnapshot } from '../shared/types.ts';
import { TimeSeriesChart } from './ScientificCharts.tsx';

const ACTION_AR: Record<AgentActionType, string> = {
  explore: 'استكشاف',
  forage_plant: 'جمع نباتات',
  drink_water: 'شرب ماء',
  hunt_prey: 'صيد',
  observe_peer: 'مراقبة أقران',
  cooperate_task: 'تعاون',
  share_resource: 'مشاركة',
  rest_sleep: 'راحة ونوم',
  craft_attempt: 'تصنيع/بناء',
  emit_signal: 'إصدار إشارة',
  tend_child: 'رعاية صغار',
  reconcile_or_bond: 'تواصل اجتماعي',
  treat_ailment: 'علاج صحي',
  move_sector: 'انتقال قطاعي',
};

export const MindsPanel: React.FC<{
  snapshot: TelemetrySnapshot;
  onSelectAgent: (id: string) => void;
  onSelectGeneration: (gen: number) => void;
}> = ({ snapshot, onSelectAgent, onSelectGeneration }) => {
  const m = snapshot.mindsAndLearning;
  const nn = m.neuralNetworkDetails;
  const aliveAgents = snapshot.agents.filter((a) => a.alive);
  const [agentAId, setAgentAId] = useState<string>(aliveAgents[0]?.id ?? '');
  const [agentBId, setAgentBId] = useState<string>(aliveAgents[1]?.id ?? '');

  const agentA = snapshot.agents.find((a) => a.id === agentAId) ?? aliveAgents[0];
  const agentB = snapshot.agents.find((a) => a.id === agentBId) ?? aliveAgents[1];
  const totalActionsNow = Math.max(
    1,
    Object.values(nn.actionDistribution).reduce((a, b) => a + b, 0),
  );

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

      {/* Neural Network Architecture & Live Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              تفاصيل معمارية الشبكة العصبية المستقلة لكل فرد
            </h3>
            <p className="text-xs text-slate-400 mt-0.5 font-mono-tabular">
              {nn.architectureVersion} · {nn.parametersPerBrain} معامل مستقل / عقل
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs border border-slate-800 rounded p-3 bg-[#0B111C]">
            <div>
              <div className="text-slate-400">طبقة الإدخال الحسي</div>
              <div className="font-mono-tabular text-base font-semibold text-cyan-400 mt-1">
                {nn.inputSize} عصبون
              </div>
              <div className="text-[11px] text-slate-500">فيزيولوجيا، بيئة، ذاكرة، ثقة</div>
            </div>
            <div className="border-x border-slate-800 px-2">
              <div className="text-slate-400">الطبقة المخفية</div>
              <div className="font-mono-tabular text-base font-semibold text-slate-100 mt-1">
                {nn.hiddenSize} عصبون
              </div>
              <div className="text-[11px] text-slate-500">تفعيل tanh + EWC Anchor</div>
            </div>
            <div>
              <div className="text-slate-400">مخرجات السياسة والقيمة</div>
              <div className="font-mono-tabular text-base font-semibold text-emerald-400 mt-1">
                {nn.outputSize} + 1
              </div>
              <div className="text-[11px] text-slate-500">Softmax Policy + V(s)</div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="border border-slate-800 rounded p-2.5">
              <div className="text-slate-400">متوسط خسارة الشبكة</div>
              <div className="font-mono-tabular text-slate-100 font-semibold mt-0.5">{nn.avgLoss}</div>
            </div>
            <div className="border border-slate-800 rounded p-2.5">
              <div className="text-slate-400">متوسط خطأ TD-Error</div>
              <div className="font-mono-tabular text-amber-300 font-semibold mt-0.5">{nn.avgTdError}</div>
            </div>
            <div className="border border-slate-800 rounded p-2.5">
              <div className="text-slate-400">إنتروبيا الاستكشاف</div>
              <div className="font-mono-tabular text-cyan-300 font-semibold mt-0.5">
                {(nn.avgPolicyEntropy * 100).toFixed(1)}%
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-400 border-t border-slate-800/80 pt-2">
            <div>دوال التفعيل: <span className="text-slate-200">{nn.activationFunction}</span></div>
            <div className="mt-1">التعلم المستمر: <span className="text-slate-200">{nn.continualLearningMethod}</span></div>
          </div>
        </div>

        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-4">
          <h3 className="text-sm font-semibold text-slate-100 mb-1">
            توزيع مخرجات الشبكات العصبية الحية (الأفعال المختارة)
          </h3>
          <p className="text-xs text-slate-400 mb-3">
            التوزيع الفعلي للقرارات الصادرة عن عقول الأفراد الأحياء في الدورة الحالية
          </p>
          <div className="space-y-1.5 text-xs max-h-56 overflow-y-auto pl-1">
            {Object.entries(nn.actionDistribution)
              .sort((a, b) => b[1] - a[1])
              .map(([act, count]) => {
                const pct = (count / totalActionsNow) * 100;
                return (
                  <div key={act} className="flex items-center justify-between gap-2">
                    <span className="text-slate-300 w-28 truncate">
                      {ACTION_AR[act as AgentActionType] ?? act}
                    </span>
                    <div className="flex-1 h-2 bg-slate-900 rounded overflow-hidden">
                      <div
                        className="h-full bg-cyan-500"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    <span className="font-mono-tabular text-slate-400 w-16 text-left">
                      {count} ({pct.toFixed(0)}%)
                    </span>
                  </div>
                );
              })}
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

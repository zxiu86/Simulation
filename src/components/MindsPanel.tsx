import React from 'react';
import { Brain, Cpu, Layers, ShieldAlert } from 'lucide-react';
import type { TelemetrySnapshot } from '../shared/types.ts';
import { HorizontalDistributionBars, TimeSeriesChart } from './ScientificCharts.tsx';

export function MindsPanel({
  snapshot,
  onSelectAgent,
}: {
  snapshot: TelemetrySnapshot;
  onSelectAgent: (id: string) => void;
}) {
  const m = snapshot.mindsAndLearning;
  const nn = m.neuralNetworkDetails;

  const topLearners = [...snapshot.agents]
    .sort((a, b) => b.totalReward - a.totalReward)
    .slice(0, 12);

  const actionItems = Object.entries(nn.actionDistribution)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between text-slate-400">
            <span>العقول النشطة / المحفوظة</span>
            <Brain className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-100">
            {m.activeBrains} / {m.savedBrains}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 font-mono tabular-nums">
            مستعادة: {m.restoredBrains} · متوفاة: {m.deceasedBrains}
          </div>
        </div>

        <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between text-slate-400">
            <span>خطوات التدريب و Replay</span>
            <Cpu className="w-4 h-4 text-violet-400" />
          </div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-violet-300">
            {m.totalTrainingSteps.toLocaleString('en-US')}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 font-mono tabular-nums">
            إعادة بث: {m.totalExperiencesReplayed} · قرارات: {m.totalDecisions}
          </div>
        </div>

        <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between text-slate-400">
            <span>الاحتفاظ / النسيان الكارثي</span>
            <Layers className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-emerald-300">
            {(m.avgRetentionScore * 100).toFixed(1)}%
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 font-mono tabular-nums">
            نسيان: {(m.avgForgettingRate * 100).toFixed(1)}% · دقة التنبؤ:{' '}
            {(m.predictionAccuracy * 100).toFixed(1)}%
          </div>
        </div>

        <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between text-slate-400">
            <span>تنوع الاستراتيجيات وحماية المكافأة</span>
            <ShieldAlert className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-amber-300">
            {(m.strategyDiversity * 100).toFixed(0)}%
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 font-mono tabular-nums">
            إنذارات تكرار عقيم: {m.rewardHackingFlags}
          </div>
        </div>
      </div>

      {/* Neural Network Architectural Card */}
      <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-4 space-y-3">
        <h4 className="text-xs font-semibold text-slate-100">
          البنية التفصيلية للشبكة العصبية المستقلة لكل فرد (Actor-Critic + EWC + Momentum)
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div className="bg-[#070B12] border border-slate-800 rounded p-3">
            <div className="text-slate-400 mb-1">طبقة الإدخال (Sensory State)</div>
            <div className="font-mono text-lg text-cyan-300 font-bold">{nn.inputSize} مدخل</div>
            <div className="text-[11px] text-slate-400 mt-1">
              جوع، عطش، صحة، طاقة، تسمم، إصابات، ضغط، موارد القطاع، معرفة جماعية، ثقة، مناخ.
            </div>
          </div>
          <div className="bg-[#070B12] border border-slate-800 rounded p-3">
            <div className="text-slate-400 mb-1">الطبقة المخفية (Hidden Representation)</div>
            <div className="font-mono text-lg text-violet-300 font-bold">{nn.hiddenSize} عصبون</div>
            <div className="text-[11px] text-slate-400 mt-1">
              دالة تفعيل <span className="font-mono">tanh</span> مع حماية أوزان EWC Anchor وFisher Diagonal.
            </div>
          </div>
          <div className="bg-[#070B12] border border-slate-800 rounded p-3">
            <div className="text-slate-400 mb-1">رأس السياسة والقيمة (Actor & Critic)</div>
            <div className="font-mono text-lg text-emerald-300 font-bold">
              {nn.outputSize} فعل + 1 قيمة
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              إنتروبيا السياسة الحالية: <span className="font-mono">{nn.avgPolicyEntropy}</span> · المعاملات:{' '}
              <span className="font-mono">{nn.parametersPerBrain}</span>/فرد.
            </div>
          </div>
          <div className="bg-[#070B12] border border-slate-800 rounded p-3">
            <div className="text-slate-400 mb-1">مؤشرات التحسين والأخطاء</div>
            <div className="font-mono text-sm text-amber-300 font-bold">
              Loss: {nn.avgLoss} · TD: {nn.avgTdError}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              نجاح الأفعال: {(m.actionSuccessRate * 100).toFixed(1)}% · فشل:{' '}
              {(m.actionFailureRate * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TimeSeriesChart
          title="منحنى الاحتفاظ بالمهارات مقابل النسيان عبر الزمن"
          data={snapshot.history as unknown as Array<Record<string, number>>}
          series={[
            { key: 'retentionScore', label: 'الاحتفاظ', color: '#10B981' },
            { key: 'forgettingRate', label: 'معدل النسيان', color: '#F43F5E' },
          ]}
        />
        <HorizontalDistributionBars
          title="توزيع السياسات والأفعال المختارة حياً"
          items={actionItems}
          accentClass="bg-cyan-500"
        />
      </div>

      <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3.5">
        <h4 className="text-xs font-semibold text-slate-200 mb-2.5">
          أعلى العقول أداءً وتعلماً (اضغط لعرض حالة المُحسّن والأوزان والذاكرة)
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right">
            <thead className="bg-[#070B12] text-slate-400">
              <tr>
                <th className="p-2">الفرد</th>
                <th className="p-2">الجيل</th>
                <th className="p-2">القرارات</th>
                <th className="p-2">معدل النجاح</th>
                <th className="p-2">المكافأة الكلية</th>
                <th className="p-2">الاحتفاظ EWC</th>
                <th className="p-2">مجموع المهارات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
              {topLearners.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => onSelectAgent(a.id)}
                  className="hover:bg-slate-800/40 cursor-pointer"
                >
                  <td className="p-2 text-cyan-300 font-sans font-medium">{a.name}</td>
                  <td className="p-2">{a.generation}</td>
                  <td className="p-2">{a.totalDecisions}</td>
                  <td className="p-2">{(a.actionSuccessRate * 100).toFixed(1)}%</td>
                  <td className="p-2 text-emerald-300">{a.totalReward}</td>
                  <td className="p-2">{(a.retentionScore * 100).toFixed(1)}%</td>
                  <td className="p-2 text-amber-300">{a.skillsSum}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

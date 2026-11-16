import React, { useEffect, useState } from 'react';
import { X, Brain, HeartPulse, History, Users } from 'lucide-react';
import type {
  AgentState,
  AgentSummaryView,
  CivilizationKnowledgeItem,
  CollectiveExperienceRecord,
  GenerationSummary,
} from '../shared/types.ts';

const SKILL_LABELS_AR: Record<string, string> = {
  foraging: 'الجمع والنباتات',
  waterFinding: 'اكتشاف المياه',
  hunting: 'الصيد والمطاردة',
  crafting: 'الصناعة والأدوات',
  healing: 'العناية الصحية',
  cooperation: 'التعاون الجماعي',
  signaling: 'الإشارات والتواصل',
  shelterBuilding: 'بناء المأوى',
  preservation: 'حفظ الموارد',
  protoAgriculture: 'رعاية النباتات',
};

export function AgentDetailModal({
  agentId,
  onClose,
}: {
  agentId: string | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [agent, setAgent] = useState<AgentState | null>(null);
  const [experiences, setExperiences] = useState<CollectiveExperienceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/agents/${encodeURIComponent(agentId)}`)
      .then((r) => {
        if (!r.ok) throw new Error('تعذر جلب ملف الفرد');
        return r.json();
      })
      .then((data: { agent: AgentState; experiences: CollectiveExperienceRecord[] }) => {
        if (!cancelled) {
          setAgent(data.agent);
          setExperiences(data.experiences ?? []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError((err as Error).message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  if (!agentId) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#0B111C] border border-slate-700/80 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#0F1623]">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-slate-100">
              ملف الفرد المستقل: {agent?.identity.name ?? agentId}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded border border-slate-700 hover:bg-slate-800 text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {loading && <div className="text-slate-400 py-8 text-center">جاري تحميل بيانات العقل والذاكرة...</div>}
          {error && <div className="text-rose-400 py-4">{error}</div>}
          {agent && !loading && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#0F1623] border border-slate-800 p-2.5 rounded">
                  <div className="text-slate-400">الحالة / الجيل</div>
                  <div className="font-semibold text-slate-100 mt-0.5">
                    {agent.alive ? 'حي' : `متوفى (${agent.causeOfDeath})`} · الجيل {agent.generation}
                  </div>
                </div>
                <div className="bg-[#0F1623] border border-slate-800 p-2.5 rounded">
                  <div className="text-slate-400">العمر / القطاع</div>
                  <div className="font-mono tabular-nums text-slate-100 mt-0.5">
                    {agent.ageTicks} دورة · ({agent.sectorX},{agent.sectorY})
                  </div>
                </div>
                <div className="bg-[#0F1623] border border-slate-800 p-2.5 rounded">
                  <div className="text-slate-400">خطوات المُحسّن / معدل التعلم</div>
                  <div className="font-mono tabular-nums text-cyan-300 mt-0.5">
                    step {agent.brain.optimizerStep} · lr {agent.brain.currentLearningRate.toFixed(5)}
                  </div>
                </div>
                <div className="bg-[#0F1623] border border-slate-800 p-2.5 rounded">
                  <div className="text-slate-400">الاحتفاظ / النسيان (EWC)</div>
                  <div className="font-mono tabular-nums text-emerald-300 mt-0.5">
                    {(agent.rlStats.retentionScore * 100).toFixed(1)}% احتفاظ · TD {agent.brain.avgTdError.toFixed(3)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-[#0F1623] border border-slate-800 rounded p-3 space-y-2">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                    <HeartPulse className="w-3.5 h-3.5 text-emerald-400" />
                    الحالة الجسدية والنفسية والمهارات المكتسبة
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-[11px] font-mono tabular-nums">
                    <div>صحة: {agent.physical.health.toFixed(0)}</div>
                    <div>جوع: {agent.physical.hunger.toFixed(0)}</div>
                    <div>عطش: {agent.physical.thirst.toFixed(0)}</div>
                    <div>طاقة: {agent.physical.energy.toFixed(0)}</div>
                    <div>تسمم: {agent.physical.poison.toFixed(0)}</div>
                    <div>إصابة: {agent.physical.injury.toFixed(0)}</div>
                    <div>ضغط: {agent.psychological.stress.toFixed(0)}</div>
                    <div>معنويات: {agent.psychological.morale.toFixed(0)}</div>
                  </div>
                  <div className="pt-2 border-t border-slate-800 space-y-1.5">
                    {Object.entries(agent.skills).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2">
                        <span className="w-28 text-slate-400 truncate">
                          {SKILL_LABELS_AR[k] ?? k}
                        </span>
                        <div className="flex-1 h-1.5 bg-slate-900 rounded overflow-hidden">
                          <div
                            className="h-full bg-cyan-500"
                            style={{ width: `${Math.round(v * 100)}%` }}
                          />
                        </div>
                        <span className="w-10 text-left font-mono tabular-nums text-slate-200">
                          {(v * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-[#0F1623] border border-slate-800 rounded p-3 space-y-2">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                    <Brain className="w-3.5 h-3.5 text-violet-400" />
                    الشبكة العصبية المستقلة والمفردات المكتسبة
                  </div>
                  <div className="text-[11px] text-slate-300 space-y-1 font-mono tabular-nums">
                    <div>
                      البنية: {agent.brain.architectureVersion} ({agent.brain.inputSize}-
                      {agent.brain.hiddenSize}-{agent.brain.outputSize})
                    </div>
                    <div>
                      تدريب: {agent.brain.trainingSteps} · إعادة بث: {agent.rlStats.replayUpdates} ·
                      متوسط الخسارة: {agent.brain.avgLoss.toFixed(4)}
                    </div>
                    <div>
                      المكافأة الكلية: {agent.rlStats.totalReward.toFixed(2)} (قصيرة:{' '}
                      {agent.rlStats.shortTermRewardSum.toFixed(1)} / طويلة:{' '}
                      {agent.rlStats.longTermRewardSum.toFixed(1)})
                    </div>
                    <div>
                      علاقات: {Object.keys(agent.relationships).length} · نسل: {agent.offspringCount}{' '}
                      · معارف: {agent.knowledgeIds.length}
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-800">
                    <div className="text-slate-400 mb-1">المفردات الناشئة ({Object.keys(agent.vocabulary).length}):</div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.values(agent.vocabulary).length === 0 ? (
                        <span className="text-slate-500">لم يعتمد رموزاً بعد</span>
                      ) : (
                        Object.values(agent.vocabulary).map((v) => (
                          <span
                            key={v.symbol + v.meaning}
                            className="px-2 py-0.5 bg-slate-900 border border-slate-700 rounded text-slate-200"
                          >
                            {v.symbol} = {v.meaning} ({Math.round(v.confidence * 100)}%)
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-[#0F1623] border border-slate-800 rounded p-3 space-y-2">
                <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                  <History className="w-3.5 h-3.5 text-amber-400" />
                  الذاكرة العرضية الشخصية (آخر {agent.episodicMemory.length} حدثاً)
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {agent.episodicMemory
                    .slice()
                    .reverse()
                    .map((m, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 px-2 py-1 bg-slate-900/70 border border-slate-800/70 rounded"
                      >
                        <span className="font-mono text-slate-400">T{m.tick}</span>
                        <span className="flex-1 text-slate-200 truncate">{m.outcomeSummary}</span>
                        <span
                          className={`font-mono tabular-nums ${m.reward >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
                        >
                          {m.reward >= 0 ? `+${m.reward}` : m.reward}
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              {experiences.length > 0 && (
                <div className="bg-[#0F1623] border border-slate-800 rounded p-3 space-y-2">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                    <Users className="w-3.5 h-3.5 text-cyan-400" />
                    مساهماته في قاعدة التجارب الجماعية
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {experiences.map((ex) => (
                      <div
                        key={ex.id}
                        className="flex items-center justify-between gap-2 px-2 py-1 bg-slate-900/60 border border-slate-800/70 rounded"
                      >
                        <span className="font-mono text-slate-400">T{ex.simTimeTick}</span>
                        <span className="text-cyan-300">{ex.entityKey}</span>
                        <span className="flex-1 text-slate-300 truncate">{ex.immediateOutcome}</span>
                        <span className="font-mono tabular-nums text-slate-200">
                          موثوقية {(ex.reliabilityScore * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function GenerationDetailModal({
  generationNum,
  onClose,
  onSelectAgent,
}: {
  generationNum: number | null;
  onClose: () => void;
  onSelectAgent: (id: string) => void;
}) {
  const [data, setData] = useState<{
    summary: GenerationSummary | null;
    members: AgentSummaryView[];
    knowledgeItems: CivilizationKnowledgeItem[];
  } | null>(null);

  useEffect(() => {
    if (generationNum === null) return;
    fetch(`/api/generations/${generationNum}`)
      .then((r) => r.json())
      .then((res) => setData(res))
      .catch(() => setData(null));
  }, [generationNum]);

  if (generationNum === null) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#0B111C] border border-slate-700/80 rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#0F1623]">
          <h3 className="text-sm font-bold text-slate-100">ملف الجيل {generationNum}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded border border-slate-700 hover:bg-slate-800 text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {!data?.summary ? (
            <div className="text-slate-400 text-center py-8">جاري تحميل بيانات الجيل...</div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono tabular-nums">
                <div className="bg-[#0F1623] border border-slate-800 p-2.5 rounded">
                  <div className="text-slate-400 font-sans">الأفراد / الأحياء</div>
                  <div className="text-slate-100 font-semibold mt-0.5">
                    {data.summary.totalAgents} / {data.summary.aliveCount}
                  </div>
                </div>
                <div className="bg-[#0F1623] border border-slate-800 p-2.5 rounded">
                  <div className="text-slate-400 font-sans">متوسط المكافأة</div>
                  <div className="text-cyan-300 font-semibold mt-0.5">{data.summary.avgReward}</div>
                </div>
                <div className="bg-[#0F1623] border border-slate-800 p-2.5 rounded">
                  <div className="text-slate-400 font-sans">معدل بقاء الصغار</div>
                  <div className="text-emerald-300 font-semibold mt-0.5">
                    {(data.summary.childSurvivalRate * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="bg-[#0F1623] border border-slate-800 p-2.5 rounded">
                  <div className="text-slate-400 font-sans">معارف مكتشفة</div>
                  <div className="text-amber-300 font-semibold mt-0.5">
                    {data.summary.knowledgeDiscoveredCount}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-slate-200 mb-2">
                  أفراد الجيل ({data.members.length})
                </h4>
                <div className="max-h-56 overflow-y-auto border border-slate-800 rounded">
                  <table className="w-full text-right">
                    <thead className="bg-[#0F1623] text-slate-400">
                      <tr>
                        <th className="p-2">الاسم</th>
                        <th className="p-2">الحالة</th>
                        <th className="p-2">العمر</th>
                        <th className="p-2">المكافأة</th>
                        <th className="p-2">المهارات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {data.members.map((m) => (
                        <tr
                          key={m.id}
                          onClick={() => {
                            onClose();
                            onSelectAgent(m.id);
                          }}
                          className="hover:bg-slate-800/40 cursor-pointer"
                        >
                          <td className="p-2 text-cyan-300 font-medium">{m.name}</td>
                          <td className="p-2">{m.alive ? 'حي' : 'متوفى'}</td>
                          <td className="p-2 font-mono tabular-nums">{m.ageTicks}</td>
                          <td className="p-2 font-mono tabular-nums">{m.totalReward}</td>
                          <td className="p-2 font-mono tabular-nums">{m.skillsSum}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

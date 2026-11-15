import React from 'react';
import { X } from 'lucide-react';
import type {
  AgentState,
  CivilizationKnowledgeItem,
  CollectiveExperienceRecord,
  GenerationSummary,
  AgentSummaryView,
} from '../shared/types.ts';

const SKILL_LABELS_AR: Record<keyof AgentState['skills'], string> = {
  foraging: 'الجمع والتمييز النباتي',
  waterFinding: 'اكتشاف المياه النقية',
  hunting: 'الصيد والمطاردة',
  crafting: 'التصنيع والأدوات',
  healing: 'التداوي والرعاية الصحية',
  cooperation: 'التعاون الجماعي',
  signaling: 'الإشارة والتواصل',
  shelterBuilding: 'بناء الملاجئ',
  preservation: 'حفظ وتخزين الموارد',
  protoAgriculture: 'رعاية النباتات (زراعة أولية)',
};

const ORIGIN_AR: Record<AgentState['identity']['originType'], string> = {
  initial: 'الجيل المؤسس الأولي',
  natural_birth: 'ولادة طبيعية داخل العالم',
  isolated_promoted: 'مدموج من التدريب المعزول',
  recovery_revived: 'مستعاد بهويته الأصلية',
  recovery_new: 'جيل استعادة مستقل',
};

export const AgentDetailModal: React.FC<{
  agent: AgentState | null;
  experiences: CollectiveExperienceRecord[];
  loading: boolean;
  onClose: () => void;
}> = ({ agent, experiences, loading, onClose }) => {
  if (!agent && !loading) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="bg-[#0F1623] border border-slate-700 rounded-md w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              {agent ? `ملف الفرد: ${agent.identity.name}` : 'جاري تحميل بيانات الفرد…'}
            </h2>
            {agent && (
              <p className="text-xs text-slate-400 mt-0.5 font-mono-tabular">
                {agent.identity.id} · الجيل {agent.generation} ·{' '}
                {ORIGIN_AR[agent.identity.originType]} ·{' '}
                {agent.alive ? 'حي' : `متوفى (${agent.causeOfDeath ?? 'غير محدد'})`}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 border border-slate-800 rounded cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 text-sm">
          {loading || !agent ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              جاري استرجاع الحالة الكاملة للعقل والذاكرة…
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="border border-slate-800 rounded p-3">
                  <div className="text-xs text-slate-400">العمر / المرحلة</div>
                  <div className="font-mono-tabular text-slate-100 font-semibold mt-1">
                    {agent.ageTicks} دورة ({agent.ageStage === 'child' ? 'طفل' : agent.ageStage === 'adult' ? 'بالغ' : 'مسن'})
                  </div>
                </div>
                <div className="border border-slate-800 rounded p-3">
                  <div className="text-xs text-slate-400">الموقع والجنس</div>
                  <div className="font-mono-tabular text-slate-100 font-semibold mt-1">
                    قطاع {agent.sectorX},{agent.sectorY} · {agent.sex === 'female' ? 'أنثى' : 'ذكر'}
                  </div>
                </div>
                <div className="border border-slate-800 rounded p-3">
                  <div className="text-xs text-slate-400">الأداء التراكمي (المكافأة)</div>
                  <div className="font-mono-tabular text-cyan-400 font-semibold mt-1">
                    {agent.rlStats.totalReward.toFixed(2)}
                  </div>
                </div>
                <div className="border border-slate-800 rounded p-3">
                  <div className="text-xs text-slate-400">خطوات التعلم والاحتفاظ</div>
                  <div className="font-mono-tabular text-emerald-400 font-semibold mt-1">
                    {agent.brain.trainingSteps} · {(agent.rlStats.retentionScore * 100).toFixed(1)}%
                  </div>
                </div>
              </div>

              {!agent.alive && (
                <div className="border border-rose-500/40 bg-rose-950/20 rounded p-3 text-xs text-rose-200">
                  سبب الوفاة المسجل: <strong>{agent.causeOfDeath}</strong> (عند الدورة{' '}
                  <span className="font-mono-tabular">{agent.deathTick}</span>)
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-800 rounded p-4">
                  <h3 className="text-xs font-semibold text-slate-300 mb-3">
                    الحالة الجسدية والنفسية
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono-tabular">
                    <div>الصحة: {agent.physical.health.toFixed(1)}%</div>
                    <div>الطاقة: {agent.physical.energy.toFixed(1)}%</div>
                    <div>الجوع: {agent.physical.hunger.toFixed(1)}%</div>
                    <div>العطش: {agent.physical.thirst.toFixed(1)}%</div>
                    <div>التسمم: {agent.physical.poison.toFixed(1)}%</div>
                    <div>الإصابة: {agent.physical.injury.toFixed(1)}%</div>
                    <div>المرض: {agent.physical.illness.toFixed(1)}%</div>
                    <div>الضغط النفسي: {agent.psychological.stress.toFixed(1)}%</div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-400">
                    آخر قرار: <span className="text-slate-200">{agent.lastAction ?? '—'}</span>
                    {agent.lastActionReason && (
                      <div className="mt-1 text-slate-400">{agent.lastActionReason}</div>
                    )}
                  </div>
                </div>

                <div className="border border-slate-800 rounded p-4">
                  <h3 className="text-xs font-semibold text-slate-300 mb-3">
                    المهارات المكتسبة والشبكة العصبية
                  </h3>
                  <div className="space-y-1.5 text-xs">
                    {(Object.keys(agent.skills) as Array<keyof AgentState['skills']>).map((sk) => (
                      <div key={sk} className="flex items-center justify-between gap-2">
                        <span className="text-slate-400">{SKILL_LABELS_AR[sk]}</span>
                        <div className="flex items-center gap-2 w-36">
                          <div className="flex-1 h-1.5 bg-slate-800 rounded overflow-hidden">
                            <div
                              className="h-full bg-cyan-500"
                              style={{ width: `${Math.round(agent.skills[sk] * 100)}%` }}
                            />
                          </div>
                          <span className="font-mono-tabular text-slate-200 w-9 text-left">
                            {Math.round(agent.skills[sk] * 100)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-800 rounded p-4">
                  <h3 className="text-xs font-semibold text-slate-300 mb-2">
                    المفردات والعلاقات الاجتماعية
                  </h3>
                  <div className="text-xs text-slate-400 mb-2">
                    عدد العلاقات: <span className="font-mono-tabular text-slate-200">{Object.keys(agent.relationships).length}</span> ·
                    المفردات المكتسبة: <span className="font-mono-tabular text-slate-200">{Object.keys(agent.vocabulary).length}</span> ·
                    الأبناء: <span className="font-mono-tabular text-slate-200">{agent.offspringCount}</span>
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-1 text-xs">
                    {Object.entries(agent.vocabulary).length === 0 ? (
                      <div className="text-slate-500">لم يكتسب إشارات لغوية بعد.</div>
                    ) : (
                      Object.entries(agent.vocabulary).map(([k, v]) => (
                        <div key={k} className="flex justify-between border-b border-slate-800/60 py-1">
                          <span className="text-cyan-300 font-semibold">"{v.symbol}" — {v.meaning}</span>
                          <span className="font-mono-tabular text-slate-400">تعرض: {v.exposures}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="border border-slate-800 rounded p-4">
                  <h3 className="text-xs font-semibold text-slate-300 mb-2">
                    الذاكرة العرضية الحديثة ({agent.episodicMemory.length})
                  </h3>
                  <div className="max-h-40 overflow-y-auto space-y-1.5 text-xs">
                    {agent.episodicMemory
                      .slice()
                      .reverse()
                      .slice(0, 12)
                      .map((mem, idx) => (
                        <div key={idx} className="border-b border-slate-800/60 pb-1">
                          <div className="flex justify-between font-mono-tabular">
                            <span className={mem.success ? 'text-emerald-400' : 'text-rose-400'}>
                              دورة {mem.tick} · {mem.action}
                            </span>
                            <span className="text-slate-300">مكافأة: {mem.reward}</span>
                          </div>
                          <div className="text-slate-400">{mem.outcomeSummary}</div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              <div className="border border-slate-800 rounded p-4">
                <h3 className="text-xs font-semibold text-slate-300 mb-2">
                  التجارب المسجلة في القاعدة الجماعية ({experiences.length})
                </h3>
                {experiences.length === 0 ? (
                  <div className="text-xs text-slate-500">لا توجد تجارب مسجلة لهذا الفرد بعد.</div>
                ) : (
                  <div className="max-h-44 overflow-y-auto divide-y divide-slate-800/70 text-xs">
                    {experiences.slice(0, 15).map((exp) => (
                      <div key={exp.id} className="py-2 flex flex-wrap justify-between gap-2">
                        <div>
                          <span className="text-slate-200 font-medium">{exp.immediateOutcome}</span>
                          <div className="text-slate-500 mt-0.5">{exp.actionReason}</div>
                        </div>
                        <div className="font-mono-tabular text-slate-400">
                          دورة {exp.simTimeTick} · مكافأة {exp.reward} · موثوقية {(exp.reliabilityScore * 100).toFixed(0)}%
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export const GenerationDetailModal: React.FC<{
  detail: {
    summary: GenerationSummary;
    agents: AgentSummaryView[];
    discoveries: CivilizationKnowledgeItem[];
  } | null;
  onClose: () => void;
  onSelectAgent: (id: string) => void;
}> = ({ detail, onClose, onSelectAgent }) => {
  if (!detail) return null;
  const { summary, agents, discoveries } = detail;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="bg-[#0F1623] border border-slate-700 rounded-md w-full max-w-3xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              تفاصيل الجيل {summary.generation}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 font-mono-tabular">
              بدأ عند الدورة {summary.startedAtTick} · الإجمالي: {summary.totalAgents} · الأحياء:{' '}
              {summary.aliveCount}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 border border-slate-800 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="border border-slate-800 rounded p-3">
              <div className="text-slate-400">متوسط المكافأة</div>
              <div className="font-mono-tabular text-sm font-semibold text-cyan-400 mt-1">
                {summary.avgReward}
              </div>
            </div>
            <div className="border border-slate-800 rounded p-3">
              <div className="text-slate-400">متوسط العمر (دورة)</div>
              <div className="font-mono-tabular text-sm font-semibold text-slate-100 mt-1">
                {summary.avgLifespanTicks}
              </div>
            </div>
            <div className="border border-slate-800 rounded p-3">
              <div className="text-slate-400">معدل بقاء الصغار</div>
              <div className="font-mono-tabular text-sm font-semibold text-emerald-400 mt-1">
                {(summary.childSurvivalRate * 100).toFixed(1)}%
              </div>
            </div>
            <div className="border border-slate-800 rounded p-3">
              <div className="text-slate-400">المعارف المكتشفة</div>
              <div className="font-mono-tabular text-sm font-semibold text-amber-400 mt-1">
                {discoveries.length}
              </div>
            </div>
          </div>

          <div className="border border-slate-800 rounded p-3">
            <h3 className="font-semibold text-slate-200 mb-2">الاكتشافات المنسوبة لهذا الجيل</h3>
            {discoveries.length === 0 ? (
              <div className="text-slate-500">لم يسجل هذا الجيل اكتشافات جديدة منفردة بعد.</div>
            ) : (
              <div className="space-y-1.5">
                {discoveries.map((k) => (
                  <div key={k.id} className="flex justify-between border-b border-slate-800/60 pb-1">
                    <span className="text-slate-200">{k.titleAr}</span>
                    <span className="font-mono-tabular text-slate-400">
                      ثقة {(k.confidence * 100).toFixed(0)}% · تجارب {k.totalTrials}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border border-slate-800 rounded p-3">
            <h3 className="font-semibold text-slate-200 mb-2">أفراد الجيل ({agents.length})</h3>
            <div className="max-h-52 overflow-y-auto divide-y divide-slate-800/60">
              {agents.slice(0, 60).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onSelectAgent(a.id)}
                  className="w-full py-1.5 flex items-center justify-between text-right hover:bg-slate-800/40 px-2 rounded cursor-pointer"
                >
                  <span className="text-slate-200 font-medium">{a.name}</span>
                  <span className="font-mono-tabular text-slate-400">
                    {a.alive ? 'حي' : 'متوفى'} · صحة {a.health}% · مكافأة {a.totalReward}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

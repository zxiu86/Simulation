import React, { useState } from 'react';
import { CheckCircle2, Play, Rocket, Square, Upload, XCircle } from 'lucide-react';
import type {
  PromotionVerificationResult,
  TelemetrySnapshot,
  TrainingSessionState,
} from '../shared/types.ts';

export function IsolatedTrainingPanel({
  snapshot,
  onStartTraining,
  onStopTraining,
  onExportPackage,
  onPromotePackage,
}: {
  snapshot: TelemetrySnapshot;
  onStartTraining: (params: {
    episodesTarget: number;
    focusMode: TrainingSessionState['focusMode'];
    cohortSize: number;
  }) => Promise<void>;
  onStopTraining: () => Promise<void>;
  onExportPackage: () => Promise<void>;
  onPromotePackage: (packageId: string) => Promise<PromotionVerificationResult>;
}) {
  const [episodesTarget, setEpisodesTarget] = useState(16);
  const [cohortSize, setCohortSize] = useState(14);
  const [focusMode, setFocusMode] = useState<TrainingSessionState['focusMode']>('balanced');
  const [promotionResult, setPromotionResult] = useState<PromotionVerificationResult | null>(null);

  const trn = snapshot.training;

  return (
    <div className="space-y-4 text-xs">
      <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-slate-100">
              بيئة التدريب المعزولة (Isolated RL Sandbox)
            </h4>
            <p className="text-slate-400 text-[11px] mt-0.5">
              تدريب عقول مستقلة في عالم معزول دون التأثير على الخط الزمني الأصلي، ثم فحص الحزم قبل الدمج.
            </p>
          </div>
          <span className="font-mono px-2.5 py-1 rounded bg-[#070B12] border border-slate-700 text-cyan-300">
            {trn.status} ({trn.episodesCompleted}/{trn.episodesTarget})
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-slate-400 mb-1">عدد الحلقات (Episodes)</label>
            <input
              type="number"
              min={4}
              max={60}
              value={episodesTarget}
              onChange={(e) => setEpisodesTarget(Number(e.target.value))}
              className="w-full bg-[#070B12] border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">حجم الفوج المعزول</label>
            <input
              type="number"
              min={8}
              max={30}
              value={cohortSize}
              onChange={(e) => setCohortSize(Number(e.target.value))}
              className="w-full bg-[#070B12] border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">تركيز التدريب</label>
            <select
              value={focusMode}
              onChange={(e) => setFocusMode(e.target.value as TrainingSessionState['focusMode'])}
              className="w-full bg-[#070B12] border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
            >
              <option value="balanced">متوازن (بقاء وتعلم عام)</option>
              <option value="survival">البقاء وإدارة الغذاء والماء</option>
              <option value="hunting">الصيد ومواجهة المخاطر</option>
              <option value="cooperation">التعاون وبناء الثقة</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            {trn.status !== 'running' ? (
              <button
                onClick={() => void onStartTraining({ episodesTarget, focusMode, cohortSize })}
                className="flex-1 px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-semibold flex items-center justify-center gap-1"
              >
                <Play className="w-3.5 h-3.5" />
                بدء التدريب
              </button>
            ) : (
              <button
                onClick={() => void onStopTraining()}
                className="flex-1 px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold flex items-center justify-center gap-1"
              >
                <Square className="w-3.5 h-3.5" />
                إيقاف
              </button>
            )}
            <button
              onClick={() => void onExportPackage()}
              className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 flex items-center gap-1"
              title="تصدير أفضل عقل من الجلسة"
            >
              <Upload className="w-3.5 h-3.5" />
              تصدير
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono tabular-nums pt-2">
          <div className="bg-[#070B12] border border-slate-800 rounded p-2.5">
            <div className="text-slate-400 font-sans">متوسط المكافأة</div>
            <div className="text-cyan-300 font-bold text-base mt-0.5">{trn.avgReward}</div>
          </div>
          <div className="bg-[#070B12] border border-slate-800 rounded p-2.5">
            <div className="text-slate-400 font-sans">معدل البقاء</div>
            <div className="text-emerald-300 font-bold text-base mt-0.5">
              {(trn.avgSurvivalRate * 100).toFixed(1)}%
            </div>
          </div>
          <div className="bg-[#070B12] border border-slate-800 rounded p-2.5">
            <div className="text-slate-400 font-sans">نجاح الأفعال</div>
            <div className="text-amber-300 font-bold text-base mt-0.5">
              {(trn.actionSuccessRate * 100).toFixed(1)}%
            </div>
          </div>
          <div className="bg-[#070B12] border border-slate-800 rounded p-2.5">
            <div className="text-slate-400 font-sans">بوابة الجودة</div>
            <div className="text-slate-100 font-bold text-base mt-0.5">
              {trn.evaluationPassed ? 'ناجح ✓' : 'قيد التقييم'}
            </div>
          </div>
        </div>
      </div>

      {promotionResult && (
        <div
          className={`p-4 rounded-lg border space-y-2 ${
            promotionResult.passed
              ? 'bg-emerald-950/30 border-emerald-700/60'
              : 'bg-rose-950/30 border-rose-700/60'
          }`}
        >
          <div className="font-semibold text-sm text-slate-100">{promotionResult.reasonAr}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {promotionResult.checks.map((c) => (
              <div
                key={c.nameAr}
                className="p-2 rounded bg-[#070B12] border border-slate-800 flex items-start gap-2"
              >
                {c.passed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-semibold text-slate-200">{c.nameAr}</div>
                  <div className="text-[11px] text-slate-400">{c.detailAr}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exported Brain Packages */}
      <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3.5 space-y-2.5">
        <h4 className="font-semibold text-slate-200">
          حزم العقول المدربة الجاهزة للتحقق والدمج ({snapshot.packages.length})
        </h4>
        {snapshot.packages.length === 0 ? (
          <p className="text-slate-500">لم تُصدّر حزم عقول بعد. شغّل جلسة تدريب أو نفّذ التصديـر.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {snapshot.packages.map((pkg) => (
              <div
                key={pkg.packageId}
                className="p-3 bg-[#070B12] border border-slate-800 rounded space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-cyan-300">
                      {pkg.identityTemplate.suggestedName}
                    </div>
                    <div className="font-mono text-[10px] text-slate-500">{pkg.packageId}</div>
                  </div>
                  <button
                    onClick={async () => {
                      const res = await onPromotePackage(pkg.packageId);
                      setPromotionResult(res);
                    }}
                    className="px-2.5 py-1.5 rounded bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-200 flex items-center gap-1"
                  >
                    <Rocket className="w-3.5 h-3.5" />
                    فحص ودمج بالحضارة
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 font-mono tabular-nums text-[11px] text-slate-300">
                  <div>مكافأة: {pkg.trainingMetadata.avgReward}</div>
                  <div>نجاح: {(pkg.trainingMetadata.actionSuccessRate * 100).toFixed(0)}%</div>
                  <div>خطوات: {pkg.trainingMetadata.totalSteps}</div>
                </div>
                <div className="font-mono text-[10px] text-slate-500 truncate">
                  SHA-256: {pkg.integrityHash}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

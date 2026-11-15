import React, { useState } from 'react';
import { Play, Square, Download, Upload, CheckCircle2, XCircle, Cpu } from 'lucide-react';
import type {
  BrainPackage,
  PromotionVerificationResult,
  TelemetrySnapshot,
  TrainingSessionState,
} from '../shared/types.ts';

export const IsolatedTrainingPanel: React.FC<{
  snapshot: TelemetrySnapshot;
  onStartTraining: (episodes: number, focus: TrainingSessionState['focusMode']) => void;
  onStopTraining: () => void;
  onExportPackage: () => void;
  onPromotePackage: (
    packageId?: string,
    rawPackage?: BrainPackage,
  ) => Promise<PromotionVerificationResult>;
}> = ({ snapshot, onStartTraining, onStopTraining, onExportPackage, onPromotePackage }) => {
  const [episodes, setEpisodes] = useState(15);
  const [focusMode, setFocusMode] = useState<TrainingSessionState['focusMode']>('balanced');
  const [verifyResult, setVerifyResult] = useState<PromotionVerificationResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const trn = snapshot.training;

  const handlePromote = async (pkgId?: string, rawPkg?: BrainPackage) => {
    setUploadError(null);
    const res = await onPromotePackage(pkgId, rawPkg);
    setVerifyResult(res);
  };

  const handleDownloadPackage = (pkg: BrainPackage) => {
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pkg.packageId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BrainPackage;
      await handlePromote(undefined, parsed);
    } catch (err) {
      setUploadError(`تعذر قراءة ملف الحزمة: ${(err as Error).message}`);
    }
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Isolated Training Controls */}
      <div className="bg-[#0F1623] border border-slate-800 rounded-md p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span>بيئة التدريب المعزول وتوليد حزم العقول</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            تدريب مستقل عن العالم الرئيسي مع تقييم فعلي لجودة السياسة قبل السماح بالدمج في الحضارة
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={focusMode}
            onChange={(e) => setFocusMode(e.target.value as TrainingSessionState['focusMode'])}
            className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
          >
            <option value="balanced">تدريب شامل (بقاء + غذاء + تعاون)</option>
            <option value="survival">التركيز على البقاء والماء والغذاء</option>
            <option value="hunting">التركيز على الصيد وتجنب المخاطر</option>
            <option value="cooperation">التركيز على التعاون والتواصل</option>
          </select>

          <select
            value={episodes}
            onChange={(e) => setEpisodes(Number(e.target.value))}
            className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 font-mono-tabular"
          >
            <option value={10}>10 حلقات تدريب</option>
            <option value={15}>15 حلقة تدريب</option>
            <option value={25}>25 حلقة تدريب</option>
            <option value={40}>40 حلقة تدريب</option>
          </select>

          {trn.status === 'running' ? (
            <button
              type="button"
              onClick={onStopTraining}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded flex items-center gap-1.5 cursor-pointer"
            >
              <Square className="w-3.5 h-3.5" />
              <span>إيقاف التدريب</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onStartTraining(episodes, focusMode)}
              className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-medium rounded flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>بدء تدريب معزول</span>
            </button>
          )}

          <button
            type="button"
            onClick={onExportPackage}
            className="px-3 py-2 border border-slate-700 hover:border-cyan-500 text-slate-200 rounded cursor-pointer"
          >
            تصدير أفضل حزمة حالية
          </button>
        </div>
      </div>

      {/* Live Training Session Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">حالة الجلسة</div>
          <div className="text-lg font-semibold text-cyan-400 mt-1">
            {trn.status === 'running'
              ? 'قيد التشغيل'
              : trn.status === 'completed'
                ? 'مكتملة'
                : trn.status === 'stopped'
                  ? 'متوقفة'
                  : 'جاهزة'}
          </div>
          <div className="text-xs text-slate-500 font-mono-tabular">
            حلقات: {trn.episodesCompleted} / {trn.episodesTarget}
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">خطوات التدريب</div>
          <div className="text-lg font-semibold font-mono-tabular text-slate-100 mt-1">
            {trn.totalSteps}
          </div>
          <div className="text-xs text-slate-500 font-mono-tabular">
            مجموعة التدريب: {trn.currentCohortSize} فرد
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">متوسط المكافأة</div>
          <div className="text-lg font-semibold font-mono-tabular text-amber-400 mt-1">
            {trn.avgReward}
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">معدل البقاء والنجاح</div>
          <div className="text-lg font-semibold font-mono-tabular text-emerald-400 mt-1">
            {(trn.avgSurvivalRate * 100).toFixed(1)}%
          </div>
          <div className="text-xs text-slate-500 font-mono-tabular">
            نجاح الأفعال: {(trn.actionSuccessRate * 100).toFixed(1)}%
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">بوابة تقييم الجودة</div>
          <div
            className={`text-lg font-semibold mt-1 ${
              trn.evaluationPassed ? 'text-emerald-400' : 'text-slate-400'
            }`}
          >
            {trn.status === 'idle'
              ? 'غير مختبر'
              : trn.evaluationPassed
                ? 'اجتاز التقييم'
                : 'دون العتبة'}
          </div>
        </div>
      </div>

      {/* Verification Result Box */}
      {(verifyResult || uploadError) && (
        <div
          className={`border rounded-md p-4 text-xs space-y-2 ${
            uploadError || !verifyResult?.passed
              ? 'border-rose-500/40 bg-rose-950/20'
              : 'border-emerald-500/40 bg-emerald-950/20'
          }`}
        >
          {uploadError ? (
            <div className="text-rose-300 font-semibold">{uploadError}</div>
          ) : verifyResult ? (
            <>
              <div className="flex items-center gap-2 font-semibold text-sm">
                {verifyResult.passed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400" />
                )}
                <span className={verifyResult.passed ? 'text-emerald-300' : 'text-rose-300'}>
                  نتيجة فحص Promote to Civilization — {verifyResult.reasonAr}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2">
                {verifyResult.checks.map((chk, idx) => (
                  <div key={idx} className="border border-slate-800/80 bg-[#0F1623] rounded p-2">
                    <div className={chk.passed ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                      {chk.passed ? '✓ ' : '✗ '}
                      {chk.nameAr}
                    </div>
                    <div className="text-slate-400 mt-0.5">{chk.detailAr}</div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Unified Brain Packages List + File Upload Promote */}
      <div className="bg-[#0F1623] border border-slate-800 rounded-md p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              حزم العقول المدربة الموحدة ({snapshot.packages.length})
            </h3>
            <p className="text-xs text-slate-400">
              تحتوي كل حزمة على الأوزان، إصدار المعمارية، السياسة، المهارات، المراجع المعرفية، وتوقيع SHA-256
            </p>
          </div>

          <label className="px-3 py-1.5 text-xs border border-slate-700 hover:border-cyan-500 text-slate-200 rounded flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>استيراد ودمج حزمة JSON</span>
            <input type="file" accept=".json" onChange={handleUploadFile} className="hidden" />
          </label>
        </div>

        {snapshot.packages.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded">
            لا توجد حزم عقول مصدرة بعد. شغّل جلسة تدريب معزول لتوليد حزمة قابلة للفحص والدمج.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/70 text-xs">
            {snapshot.packages.map((pkg) => (
              <div key={pkg.packageId} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-mono-tabular font-semibold text-slate-100">
                    {pkg.packageId} · {pkg.identityTemplate.suggestedName}
                  </div>
                  <div className="text-slate-400 font-mono-tabular mt-0.5">
                    توافق: {pkg.engineVersion} · خطوات: {pkg.trainingMetadata.totalSteps} · مكافأة:{' '}
                    {pkg.trainingMetadata.avgReward} · نجاح:{' '}
                    {(pkg.trainingMetadata.actionSuccessRate * 100).toFixed(1)}% · Hash:{' '}
                    {pkg.integrityHash.slice(0, 12)}…
                  </div>
                  <div
                    className={`mt-0.5 ${
                      pkg.trainingMetadata.evaluationPassed ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {pkg.trainingMetadata.evaluationNotesAr}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadPackage(pkg)}
                    className="px-2.5 py-1.5 border border-slate-700 hover:border-slate-500 text-slate-200 rounded inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تنزيل</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePromote(pkg.packageId)}
                    className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-medium rounded cursor-pointer whitespace-nowrap"
                  >
                    فحص ودمج في الحضارة
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

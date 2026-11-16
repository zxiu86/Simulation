import React, { useState } from 'react';
import {
  Activity,
  BrainCircuit,
  Cpu,
  Database,
  HardDrive,
  HeartPulse,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { TelemetrySnapshot } from '../shared/types.ts';
import { HorizontalDistributionBars, TimeSeriesChart } from './ScientificCharts.tsx';

export function OverviewPanel({
  snapshot,
  onSaveCheckpoint,
  onRestoreCheckpoint,
  onVerifyCheckpoint,
}: {
  snapshot: TelemetrySnapshot;
  onSaveCheckpoint: () => Promise<void>;
  onRestoreCheckpoint: (checkpointId?: string) => Promise<void>;
  onVerifyCheckpoint: (checkpointId: string) => Promise<{ valid: boolean; reasonAr: string }>;
}) {
  const [verifyMsg, setVerifyMsg] = useState<{ id: string; valid: boolean; msg: string } | null>(
    null,
  );
  const [busyAction, setBusyAction] = useState(false);

  const actionDistItems = Object.entries(
    snapshot.mindsAndLearning.neuralNetworkDetails.actionDistribution,
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([act, count]) => ({ label: act, value: count }));

  return (
    <div className="space-y-4">
      {/* Top 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>السكان الأحياء / الكلي</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-100">
            {snapshot.population.alive}{' '}
            <span className="text-sm font-normal text-slate-400">
              / {snapshot.population.totalCreated}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400 font-mono tabular-nums">
            ولادات: {snapshot.population.births} · وفيات: {snapshot.population.deaths} · جيل{' '}
            {snapshot.currentGeneration}
          </div>
        </div>

        <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>العقول والشبكات العصبية</span>
            <BrainCircuit className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-cyan-300">
            {snapshot.mindsAndLearning.activeBrains}{' '}
            <span className="text-sm font-normal text-slate-400">نشط</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400 font-mono tabular-nums">
            متوسط الاحتفاظ: {(snapshot.mindsAndLearning.avgRetentionScore * 100).toFixed(1)}% · دقة{' '}
            {(snapshot.mindsAndLearning.predictionAccuracy * 100).toFixed(1)}%
          </div>
        </div>

        <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>قاعدة المعرفة والتجارب</span>
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-amber-300">
            {snapshot.knowledgeItems.length}{' '}
            <span className="text-sm font-normal text-slate-400">مفهوم</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400 font-mono tabular-nums">
            تجارب مسجلة: {snapshot.mindsAndLearning.totalExperiencesRecorded} · رموز لغة:{' '}
            {snapshot.societyAndLanguage.signalsCount}
          </div>
        </div>

        <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>صحة الأفراد ومؤشر البقاء</span>
            <HeartPulse className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-100">
            {snapshot.population.avgHealth}%{' '}
            <span className="text-xs font-normal text-slate-400">متوسط صحة</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400 font-mono tabular-nums">
            جوع: {snapshot.population.avgHunger}% · عطش: {snapshot.population.avgThirst}% · خطر:{' '}
            {snapshot.survivalAndExtinction.riskLevel}
          </div>
        </div>
      </div>

      {/* Live Sync Identity & Operational Status Strip */}
      <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800/80">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>هوية التشغيل المتزامن والسلامة الحتمية (Run & Sync Identity)</span>
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-400">
            بدء التشغيل: {new Date(snapshot.startedAt).toLocaleString('ar-EG')}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-2.5 text-xs">
          <div className="bg-[#070B12] border border-slate-800/80 rounded p-2">
            <div className="text-[11px] text-slate-500">معرف الحضارة (Sim ID)</div>
            <div className="font-mono text-cyan-300 truncate mt-0.5">{snapshot.simulationId}</div>
          </div>
          <div className="bg-[#070B12] border border-slate-800/80 rounded p-2">
            <div className="text-[11px] text-slate-500">معرف التشغيل (Run ID)</div>
            <div className="font-mono text-slate-200 truncate mt-0.5">{snapshot.runId}</div>
          </div>
          <div className="bg-[#070B12] border border-slate-800/80 rounded p-2">
            <div className="text-[11px] text-slate-500">تسلسل الأحداث (Seq)</div>
            <div className="font-mono tabular-nums text-emerald-300 mt-0.5">
              #{snapshot.lastSequence}
            </div>
          </div>
          <div className="bg-[#070B12] border border-slate-800/80 rounded p-2">
            <div className="text-[11px] text-slate-500">حالة سير العمل</div>
            <div className="font-mono text-slate-100 mt-0.5">{snapshot.workflowStatus}</div>
          </div>
          <div className="bg-[#070B12] border border-slate-800/80 rounded p-2">
            <div className="text-[11px] text-slate-500">حالة المحاكاة</div>
            <div className="font-mono text-amber-300 mt-0.5">{snapshot.simStatus}</div>
          </div>
          <div className="bg-[#070B12] border border-slate-800/80 rounded p-2">
            <div className="text-[11px] text-slate-500">بصمة Checkpoint الجذرية</div>
            <div className="font-mono text-slate-300 truncate mt-0.5">
              {snapshot.persistenceStatus.lastRootChecksum
                ? `${snapshot.persistenceStatus.lastRootChecksum.slice(0, 14)}…`
                : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TimeSeriesChart
          title="تطور السكان والصحة عبر الدورات"
          data={snapshot.history as unknown as Array<Record<string, number>>}
          series={[
            { key: 'alive', label: 'الأحياء', color: '#10B981' },
            { key: 'avgHealth', label: 'متوسط الصحة', color: '#06B6D4' },
            { key: 'avgHunger', label: 'متوسط الجوع', color: '#F59E0B' },
          ]}
        />
        <TimeSeriesChart
          title="معدل التعلم التراكمي والاحتفاظ المعرفي"
          data={snapshot.history as unknown as Array<Record<string, number>>}
          series={[
            { key: 'avgReward', label: 'متوسط المكافأة', color: '#8B5CF6' },
            { key: 'knowledgeCount', label: 'المعارف المكتشفة', color: '#F59E0B' },
            { key: 'symbolsCount', label: 'الرموز اللغوية', color: '#06B6D4' },
          ]}
        />
      </div>

      {/* Neural Network Specs + Performance Benchmarks + Persistence Checkpoints */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3.5 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <BrainCircuit className="w-4 h-4 text-violet-400" />
            <span>مواصفات الشبكة العصبية (Per-Agent Brain)</span>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">الإصدار المعماري:</span>
              <span className="font-mono text-slate-200">
                {snapshot.mindsAndLearning.neuralNetworkDetails.architectureVersion}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">الطبقات (إدخال/مخفي/إخراج):</span>
              <span className="font-mono tabular-nums text-cyan-300">
                {snapshot.mindsAndLearning.neuralNetworkDetails.inputSize} →{' '}
                {snapshot.mindsAndLearning.neuralNetworkDetails.hiddenSize} →{' '}
                {snapshot.mindsAndLearning.neuralNetworkDetails.outputSize}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">المعاملات لكل فرد:</span>
              <span className="font-mono tabular-nums text-slate-200">
                {snapshot.mindsAndLearning.neuralNetworkDetails.parametersPerBrain} وزن
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">التعلم المستمر:</span>
              <span className="text-emerald-300 text-[11px]">
                {snapshot.mindsAndLearning.neuralNetworkDetails.continualLearningMethod}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">متوسط الخسارة / TD Error:</span>
              <span className="font-mono tabular-nums text-slate-200">
                {snapshot.mindsAndLearning.neuralNetworkDetails.avgLoss} /{' '}
                {snapshot.mindsAndLearning.neuralNetworkDetails.avgTdError}
              </span>
            </div>
          </div>
          <HorizontalDistributionBars
            title="توزيع القرارات الحالية"
            items={actionDistItems}
            accentClass="bg-violet-500"
          />
        </div>

        <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3.5 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span>مؤشرات الأداء والموارد (Benchmarks)</span>
          </div>
          <div className="space-y-1.5 text-xs font-mono tabular-nums">
            <div className="flex justify-between">
              <span className="font-sans text-slate-400">قرار/ثانية:</span>
              <span className="text-emerald-300">{snapshot.benchmarks.decisionsPerSecond}/s</span>
            </div>
            <div className="flex justify-between">
              <span className="font-sans text-slate-400">زمن الدورة الواحدة:</span>
              <span className="text-slate-200">{snapshot.benchmarks.lastDecisionDurationMs} ms</span>
            </div>
            <div className="flex justify-between">
              <span className="font-sans text-slate-400">ذاكرة RSS / Heap:</span>
              <span className="text-cyan-300">
                {snapshot.benchmarks.rssMb} MB / {snapshot.benchmarks.heapUsedMb} MB
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-sans text-slate-400">حجم قاعدة التجارب الحية:</span>
              <span className="text-slate-200">{snapshot.benchmarks.experienceDbCount} سجل</span>
            </div>
            <div className="flex justify-between">
              <span className="font-sans text-slate-400">زمن استرجاع Replay:</span>
              <span className="text-slate-200">{snapshot.benchmarks.experienceRecallTimeMs} ms</span>
            </div>
            <div className="flex justify-between">
              <span className="font-sans text-slate-400">حجم آخر Checkpoint مضغوط:</span>
              <span className="text-amber-300">
                {(snapshot.benchmarks.latestCheckpointBytes / 1024).toFixed(1)} KB
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-sans text-slate-400">حجم SQLite:</span>
              <span className="text-slate-200">
                {(snapshot.benchmarks.sqliteDbBytes / 1024).toFixed(1)} KB
              </span>
            </div>
          </div>
        </div>

        <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <Database className="w-4 h-4 text-emerald-400" />
              <span>نقاط الحفظ المتدرجة (Chunked Checkpoints)</span>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              {snapshot.persistenceStatus.state}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={busyAction}
              onClick={async () => {
                setBusyAction(true);
                try {
                  await onSaveCheckpoint();
                } finally {
                  setBusyAction(false);
                }
              }}
              className="flex-1 px-2.5 py-1.5 rounded bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-200 text-xs font-medium disabled:opacity-50"
            >
              حفظ Checkpoint الآن
            </button>
            <button
              disabled={busyAction}
              onClick={async () => {
                setBusyAction(true);
                try {
                  await onRestoreCheckpoint();
                } finally {
                  setBusyAction(false);
                }
              }}
              className="flex-1 px-2.5 py-1.5 rounded bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-200 text-xs font-medium disabled:opacity-50"
            >
              استعادة آخر نسخة سليمة
            </button>
          </div>

          {verifyMsg && (
            <div
              className={`p-2 rounded text-[11px] border ${
                verifyMsg.valid
                  ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-200'
                  : 'bg-rose-950/40 border-rose-700/60 text-rose-200'
              }`}
            >
              {verifyMsg.id}: {verifyMsg.msg}
            </div>
          )}

          <div className="max-h-48 overflow-y-auto space-y-1.5">
            {snapshot.persistenceStatus.checkpoints.map((cp) => (
              <div
                key={cp.checkpointId}
                className="p-2 bg-[#070B12] border border-slate-800/80 rounded text-[11px] flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="font-mono text-slate-200 truncate">{cp.checkpointId}</div>
                  <div className="text-slate-400 font-mono tabular-nums">
                    T{cp.tick} · جيل {cp.generationNumber} · {cp.chunkCount} جزء ·{' '}
                    {(cp.compressedBytes / 1024).toFixed(1)} KB
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={async () => {
                      const res = await onVerifyCheckpoint(cp.checkpointId);
                      setVerifyMsg({ id: cp.checkpointId, valid: res.valid, msg: res.reasonAr });
                    }}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                    title="فحص التكامل"
                  >
                    <HardDrive className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => void onRestoreCheckpoint(cp.checkpointId)}
                    className="px-2 py-1 rounded bg-cyan-900/50 hover:bg-cyan-800/60 text-cyan-200"
                  >
                    استعادة
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

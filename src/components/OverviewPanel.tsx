import React from 'react';
import { Play, Pause, StepForward, Save, RotateCcw } from 'lucide-react';
import type { TelemetrySnapshot } from '../shared/types.ts';
import { TimeSeriesChart } from './ScientificCharts.tsx';

const RISK_LABEL_AR: Record<TelemetrySnapshot['survivalAndExtinction']['riskLevel'], { text: string; cls: string }> = {
  stable: { text: 'استقرار السكان', cls: 'text-emerald-400' },
  decline: { text: 'انخفاض السكان', cls: 'text-amber-400' },
  critical: { text: 'حالة حرجة', cls: 'text-rose-400' },
  near_extinction: { text: 'شبه انقراض', cls: 'text-rose-400' },
  total_extinction: { text: 'انقراض كلي — قيد الاستعادة', cls: 'text-rose-500' },
};

const TRAINING_STATUS_AR: Record<TelemetrySnapshot['training']['status'], string> = {
  idle: 'متوقف (خامل)',
  running: 'قيد التدريب المعزول',
  completed: 'مكتمل',
  failed: 'فشل',
  stopped: 'أُوقف يدوياً',
};

export const OverviewPanel: React.FC<{
  snapshot: TelemetrySnapshot;
  onSimControl: (action: string, payload?: Record<string, unknown>) => void;
  onSaveCheckpoint: () => void;
}> = ({ snapshot, onSimControl, onSaveCheckpoint }) => {
  const risk = RISK_LABEL_AR[snapshot.survivalAndExtinction.riskLevel];
  const minds = snapshot.mindsAndLearning;
  const pop = snapshot.population;

  const statItems = [
    {
      label: 'السكان الأحياء / المتوفون',
      value: `${pop.alive} / ${pop.deceased}`,
      sub: `المواليد: ${pop.births} · الأجيال: ${snapshot.currentGeneration}`,
    },
    {
      label: 'الزمن الافتراضي والحقيقي',
      value: `${snapshot.tick} دورة`,
      sub: `${snapshot.worldDays} يوم افتراضي · ${snapshot.elapsedRealSeconds} ث`,
    },
    {
      label: 'إجمالي التجارب والقرارات',
      value: `${minds.totalExperiencesRecorded.toLocaleString()}`,
      sub: `قرارات: ${minds.totalDecisions.toLocaleString()} · مسترجعة: ${minds.totalExperiencesReplayed}`,
    },
    {
      label: 'متوسط الأداء والمكافأة',
      value: `${minds.avgReward}`,
      sub: `نجاح الأفعال: ${(minds.actionSuccessRate * 100).toFixed(1)}% · فشل: ${(minds.actionFailureRate * 100).toFixed(1)}%`,
    },
    {
      label: 'الاحتفاظ بالمهارات والشبكات',
      value: `${(minds.avgRetentionScore * 100).toFixed(1)}%`,
      sub: `عقول نشطة: ${minds.activeBrains} · نسيان: ${(minds.avgForgettingRate * 100).toFixed(1)}%`,
    },
    {
      label: 'المعارف المشتركة واللغة',
      value: `${snapshot.knowledgeItems.length} معرفة`,
      sub: `مؤكدة: ${snapshot.knowledgeItems.filter((k) => k.certaintyStatus === 'confirmed').length} · رموز تواصل: ${snapshot.societyAndLanguage.signalsCount}`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Control Strip */}
      <div className="bg-[#0F1623] border border-slate-800 rounded-md p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs text-slate-400">
            حالة المحاكاة:{' '}
            <span className={snapshot.simStatus === 'running' ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
              {snapshot.simStatus === 'running'
                ? 'تعمل الآن'
                : snapshot.simStatus === 'recovering'
                  ? 'قيد الاستعادة من الانقراض'
                  : 'متوقفة مؤقتاً'}
            </span>
            {' · '}
            حالة التدريب المعزول:{' '}
            <span className="text-slate-200">{TRAINING_STATUS_AR[snapshot.training.status]}</span>
            {' · '}
            خطر الانقراض: <span className={risk.cls}>{risk.text}</span>
          </div>
          <div className="text-xs font-mono-tabular text-slate-400">
            التخزين: {snapshot.persistenceStatus.sqliteReady ? 'SQLite نشط' : 'غير متاح'} · نقاط الفحص:{' '}
            {snapshot.persistenceStatus.totalCheckpoints} · آخر حفظ:{' '}
            {snapshot.persistenceStatus.lastCheckpointAt
              ? new Date(snapshot.persistenceStatus.lastCheckpointAt).toLocaleTimeString('ar-EG')
              : 'غير متاح'}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {snapshot.simStatus === 'running' ? (
            <button
              type="button"
              onClick={() => onSimControl('pause')}
              className="px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 rounded flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>إيقاف مؤقت</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSimControl('start')}
              className="px-3.5 py-2 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-slate-950 rounded flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>تشغيل المحاكاة</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onSimControl('step', { steps: 10 })}
            className="px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <StepForward className="w-3.5 h-3.5" />
            <span>تنفيذ 10 دورات</span>
          </button>

          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded p-0.5">
            {[1, 2, 4, 8].map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => onSimControl('set_speed', { speedMultiplier: spd })}
                className={`px-2.5 py-1 text-xs font-mono-tabular rounded whitespace-nowrap cursor-pointer ${
                  snapshot.speedMultiplier === spd
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onSaveCheckpoint}
            className="px-3.5 py-2 text-xs font-medium border border-slate-700 hover:border-cyan-500/60 text-slate-200 rounded flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>حفظ نقطة فحص</span>
          </button>

          <button
            type="button"
            onClick={() => onSimControl('reset')}
            className="px-3 py-2 text-xs font-medium border border-slate-800 hover:border-rose-500/50 text-slate-400 hover:text-rose-300 rounded flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>إعادة ضبط العالم</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statItems.map((item) => (
          <div key={item.label} className="bg-[#0F1623] border border-slate-800 rounded-md p-4">
            <div className="text-xs text-slate-400">{item.label}</div>
            <div className="text-2xl font-semibold font-mono-tabular text-slate-100 mt-1.5">
              {item.value}
            </div>
            <div className="text-xs text-slate-400 mt-1.5 font-mono-tabular">{item.sub}</div>
          </div>
        ))}
      </div>

      {/* Time-Series Telemetry Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TimeSeriesChart
          titleAr="تطور السكان والمواليد والوفيات"
          subtitleAr="بيانات زمنية مستخرجة مباشرة من دورات المحرك"
          data={snapshot.history}
          series={[
            { key: 'alive', labelAr: 'الأحياء', color: '#06B6D4', accessor: (p) => p.alive },
            { key: 'births', labelAr: 'المواليد التراكمي', color: '#10B981', accessor: (p) => p.birthsCumulative },
            { key: 'deaths', labelAr: 'الوفيات التراكمي', color: '#F43F5E', accessor: (p) => p.deathsCumulative },
          ]}
        />

        <TimeSeriesChart
          titleAr="تطور الأداء المعرفي والاحتفاظ بالمهارات"
          subtitleAr="متوسط المكافأة مقابل الاحتفاظ بالمهارات ونمو المعرفة"
          data={snapshot.history}
          series={[
            { key: 'reward', labelAr: 'متوسط المكافأة', color: '#F59E0B', accessor: (p) => p.avgReward },
            { key: 'ret', labelAr: 'نسبة الاحتفاظ %', color: '#10B981', accessor: (p) => Math.round(p.retentionScore * 100) },
            { key: 'know', labelAr: 'المعارف المكتشفة', color: '#06B6D4', accessor: (p) => p.knowledgeCount },
          ]}
        />
      </div>

      {/* Engine Performance & Resource Telemetry */}
      <div className="bg-[#0F1623] border border-slate-800 rounded-md p-4">
        <h3 className="text-sm font-semibold text-slate-100 mb-3">
          قياسات الأداء والموارد الفعلية للمحرك
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
          <div>
            <div className="text-slate-400">زمن تنفيذ الدورة</div>
            <div className="font-mono-tabular text-slate-100 font-semibold mt-0.5">
              {snapshot.benchmarks.lastDecisionDurationMs} مللي ث
            </div>
          </div>
          <div>
            <div className="text-slate-400">القرارات بالثانية</div>
            <div className="font-mono-tabular text-cyan-400 font-semibold mt-0.5">
              {snapshot.benchmarks.decisionsPerSecond.toLocaleString()} قرار/ث
            </div>
          </div>
          <div>
            <div className="text-slate-400">استهلاك الذاكرة (RSS)</div>
            <div className="font-mono-tabular text-slate-100 font-semibold mt-0.5">
              {snapshot.benchmarks.rssMb} MB
            </div>
          </div>
          <div>
            <div className="text-slate-400">زمن استرجاع التجارب</div>
            <div className="font-mono-tabular text-slate-100 font-semibold mt-0.5">
              {snapshot.benchmarks.experienceRecallTimeMs} مللي ث
            </div>
          </div>
          <div>
            <div className="text-slate-400">حجم نقطة الفحص المضغوطة</div>
            <div className="font-mono-tabular text-slate-100 font-semibold mt-0.5">
              {(snapshot.benchmarks.latestCheckpointBytes / 1024).toFixed(1)} KB
            </div>
          </div>
          <div>
            <div className="text-slate-400">حجم قاعدة SQLite</div>
            <div className="font-mono-tabular text-slate-100 font-semibold mt-0.5">
              {(snapshot.benchmarks.sqliteDbBytes / 1024).toFixed(1)} KB
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

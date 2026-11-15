import React, { useState } from 'react';
import { ShieldAlert, RotateCw, Database, CheckCircle2 } from 'lucide-react';
import type { RecoveryPolicyMode, TelemetrySnapshot } from '../shared/types.ts';
import { SectorEcologicalMap, TimeSeriesChart } from './ScientificCharts.tsx';

const SEASON_AR: Record<TelemetrySnapshot['environment']['season'], string> = {
  temperate: 'معتدل',
  wet: 'ممطر',
  dry: 'جاف',
  harsh: 'قاسٍ / بارد',
};

const RISK_AR: Record<TelemetrySnapshot['survivalAndExtinction']['riskLevel'], { text: string; cls: string }> = {
  stable: { text: 'استقرار السكان', cls: 'text-emerald-400' },
  decline: { text: 'انخفاض السكان', cls: 'text-amber-400' },
  critical: { text: 'انخفاض حرج', cls: 'text-rose-400' },
  near_extinction: { text: 'شبه انقراض', cls: 'text-rose-400' },
  total_extinction: { text: 'انقراض كلي', cls: 'text-rose-500' },
};

export const EnvironmentSurvivalPanel: React.FC<{
  snapshot: TelemetrySnapshot;
  onSimControl: (action: string, payload?: Record<string, unknown>) => void;
  onRestoreCheckpoint: (checkpointId?: string, knowledgeOnly?: boolean) => void;
  onVerifyCheckpoint: (checkpointId: string) => Promise<{ valid: boolean; reasonAr: string }>;
}> = ({ snapshot, onSimControl, onRestoreCheckpoint, onVerifyCheckpoint }) => {
  const [selectedSectorKey, setSelectedSectorKey] = useState<string>('0,0');
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);

  const env = snapshot.environment;
  const surv = snapshot.survivalAndExtinction;
  const risk = RISK_AR[surv.riskLevel];
  const selectedSector =
    env.sectors.find((s) => s.key === selectedSectorKey) ?? env.sectors[0];

  const handleVerify = async (cpId: string) => {
    const res = await onVerifyCheckpoint(cpId);
    setVerifyMsg(`${cpId}: ${res.reasonAr}`);
  };

  return (
    <div className="space-y-6">
      {/* Environment Overview Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">المساحة والموسم</div>
          <div className="text-lg font-semibold font-mono-tabular text-slate-100 mt-1">
            {env.areaKm2} كم² · {SEASON_AR[env.season]}
          </div>
          <div className="text-xs text-slate-500 font-mono-tabular">
            حرارة: {env.temperatureC}°C · مطر: {(env.rainfall * 100).toFixed(0)}%
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">مخزون النباتات</div>
          <div className="text-lg font-semibold font-mono-tabular text-emerald-400 mt-1">
            {env.totalPlants.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 font-mono-tabular">
            رعاية نباتية: {env.plantedPlots} قطعة
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">كمية المياه</div>
          <div className="text-lg font-semibold font-mono-tabular text-cyan-400 mt-1">
            {env.totalWater.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 font-mono-tabular">
            تجدد: +{env.regenerationRate} / دورة
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">الحيوانات البرية</div>
          <div className="text-lg font-semibold font-mono-tabular text-amber-400 mt-1">
            {env.totalAnimals}
          </div>
          <div className="text-xs text-slate-500 font-mono-tabular">
            استهلاك: {env.consumptionRate} / دورة
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">البنى الناشئة (مكتشفة)</div>
          <div className="text-lg font-semibold font-mono-tabular text-slate-100 mt-1">
            {env.sheltersBuilt} مأوى
          </div>
          <div className="text-xs text-slate-500 font-mono-tabular">
            مخازن طعام/ماء: {env.foodCaches} / {env.waterCaches}
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-3.5">
          <div className="text-xs text-slate-400">مستوى خطر الانقراض</div>
          <div className={`text-lg font-semibold mt-1 ${risk.cls}`}>{risk.text}</div>
          <div className="text-xs text-slate-500 font-mono-tabular">
            بقاء: {(surv.survivalRate * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      {/* 2D Spatial Ecological Grid + Sector Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <SectorEcologicalMap
            sectors={env.sectors}
            selectedKey={selectedSectorKey}
            onSelectSector={(s) => setSelectedSectorKey(s.key)}
          />
        </div>

        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-4 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              فاحص القطاع ({selectedSector?.key})
            </h3>
            {selectedSector ? (
              <div className="mt-3 space-y-2 text-xs font-mono-tabular">
                <div className="flex justify-between border-b border-slate-800/70 pb-1.5">
                  <span className="text-slate-400 font-sans">البيئة الحيوية</span>
                  <span className="text-slate-200">{selectedSector.biome}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/70 pb-1.5">
                  <span className="text-slate-400 font-sans">الأفراد المتواجدون</span>
                  <span className="text-cyan-400">{selectedSector.agentsCount}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/70 pb-1.5">
                  <span className="text-slate-400 font-sans">وفرة النباتات</span>
                  <span className="text-emerald-400">{selectedSector.plantSupply}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/70 pb-1.5">
                  <span className="text-slate-400 font-sans">المياه المحلية</span>
                  <span className="text-cyan-300">
                    {selectedSector.waterVolume}{' '}
                    {selectedSector.waterVolume > 0
                      ? selectedSector.waterContaminated
                        ? '(خطر تلوث)'
                        : '(نقي غالباً)'
                      : '(غير متاح)'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-800/70 pb-1.5">
                  <span className="text-slate-400 font-sans">الحيوانات / المفترسات</span>
                  <span className="text-amber-300">
                    {selectedSector.animalsCount} / {selectedSector.predatorsCount}
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-800/70 pb-1.5">
                  <span className="text-slate-400 font-sans">خطر البيئة</span>
                  <span className="text-rose-300">{(selectedSector.hazardLevel * 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">الملاجئ ومخازن الغذاء</span>
                  <span className="text-slate-200">
                    {selectedSector.sheltersBuilt} / {selectedSector.foodCaches}
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          <TimeSeriesChart
            titleAr="تغير النباتات والمياه"
            subtitleAr="تتبع التجدد مقابل الاستهلاك"
            data={snapshot.history}
            height={140}
            series={[
              { key: 'pl', labelAr: 'نباتات', color: '#10B981', accessor: (p) => p.totalPlants },
              { key: 'wt', labelAr: 'مياه', color: '#06B6D4', accessor: (p) => p.totalWater },
            ]}
          />
        </div>
      </div>

      {/* Survival, Extinction Prevention & Recovery Protocol */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                نظام استمرارية الحضارة والوقاية من الانقراض
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                يحفظ التجارب والأوزان والخط الزمني الأصلي ويستعيد الحضارة عند الانقراض دون خلق موارد مجانية
              </p>
            </div>
            <span className={`text-xs font-semibold ${risk.cls}`}>{risk.text}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="border border-slate-800 rounded p-2.5">
              <div className="text-slate-400">نسبة الاحتياجات غير الملباة</div>
              <div className="font-mono-tabular text-base font-semibold text-amber-400 mt-1">
                {(surv.unmetNeedsRatio * 100).toFixed(1)}%
              </div>
            </div>
            <div className="border border-slate-800 rounded p-2.5">
              <div className="text-slate-400">حالات الانقراض / الاستعادة</div>
              <div className="font-mono-tabular text-base font-semibold text-slate-100 mt-1">
                {surv.extinctionCount} / {surv.recoveryCount}
              </div>
            </div>
          </div>

          {surv.crisisDiagnosticsAr.length > 0 && (
            <div className="border border-amber-500/40 bg-amber-950/20 rounded p-3 text-xs text-amber-200 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4" />
                <span>تحليل أسباب الأزمة الحالية</span>
              </div>
              {surv.crisisDiagnosticsAr.map((d, i) => (
                <div key={i}>· {d}</div>
              ))}
            </div>
          )}

          <div>
            <h4 className="text-xs font-semibold text-slate-300 mb-2">أسباب الوفيات المسجلة</h4>
            {Object.keys(surv.causesOfDeath).length === 0 ? (
              <div className="text-xs text-slate-500">لا توجد وفيات مسجلة حتى الآن.</div>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(surv.causesOfDeath)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cause, count]) => (
                    <div key={cause} className="flex justify-between border-b border-slate-800/70 py-1">
                      <span className="text-slate-300">{cause}</span>
                      <span className="font-mono-tabular text-rose-400">{count}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">سياسة الاستعادة:</span>
              <select
                value={snapshot.recoveryPolicy}
                onChange={(e) =>
                  onSimControl('set_recovery_policy', {
                    recoveryPolicy: e.target.value as RecoveryPolicyMode,
                  })
                }
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
              >
                <option value="spawn_new_generation">إطلاق جيل جديد مستقل (مع المعرفة التراكمية)</option>
                <option value="revive_preserved_individuals">إحياء الأفراد المحفوظين بهوياتهم وذاكرتهم</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => onSimControl('trigger_extinction_test')}
              className="px-3 py-1.5 border border-rose-500/40 text-rose-300 hover:bg-rose-950/40 rounded cursor-pointer whitespace-nowrap"
            >
              محاكاة اختبار انقراض واستعادة
            </button>
          </div>
        </div>

        {/* Checkpoints & Backup Control */}
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-cyan-400" />
                <span>نقاط الفحص والنسخ الاحتياطية المضغوطة</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                فصل العقول والذاكرة والمعرفة والتجارب مع توقيع SHA-256 والتراجع عن التالف
              </p>
            </div>
            <button
              type="button"
              onClick={() => onRestoreCheckpoint()}
              className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>استعادة أحدث نسخة سليمة</span>
            </button>
          </div>

          {verifyMsg && (
            <div className="text-xs text-cyan-300 border border-cyan-500/30 bg-cyan-950/20 rounded p-2 font-mono-tabular">
              {verifyMsg}
            </div>
          )}

          <div className="max-h-64 overflow-y-auto divide-y divide-slate-800/70 text-xs">
            {snapshot.persistenceStatus.checkpoints.length === 0 ? (
              <div className="py-6 text-center text-slate-500">لا توجد نقاط فحص محفوظة بعد.</div>
            ) : (
              snapshot.persistenceStatus.checkpoints.map((cp) => (
                <div key={cp.checkpointId} className="py-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-mono-tabular text-slate-200">{cp.checkpointId}</div>
                    <div className="font-mono-tabular text-slate-500">
                      دورة {cp.tick} · جيل {cp.generationNumber} · أحياء {cp.aliveCount} ·{' '}
                      {(cp.compressedBytes / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleVerify(cp.checkpointId)}
                      className="px-2 py-1 border border-slate-700 hover:border-cyan-500 text-slate-300 rounded cursor-pointer inline-flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span>فحص</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRestoreCheckpoint(cp.checkpointId, true)}
                      className="px-2 py-1 border border-slate-700 hover:border-amber-500 text-amber-300 rounded cursor-pointer"
                    >
                      المعرفة فقط
                    </button>
                    <button
                      type="button"
                      onClick={() => onRestoreCheckpoint(cp.checkpointId, false)}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded cursor-pointer"
                    >
                      استعادة كاملة
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Extinction & Recovery History */}
      {surv.extinctionRecords.length > 0 && (
        <div className="bg-[#0F1623] border border-slate-800 rounded-md p-4">
          <h3 className="text-sm font-semibold text-slate-100 mb-3">
            سجل حوادث الانقراض والاستعادة الموثقة (الخط الزمني الأصلي محفوظ)
          </h3>
          <div className="space-y-2 text-xs">
            {surv.extinctionRecords.map((ex) => {
              const rec = surv.recoveryEvents.find((r) => r.extinctionId === ex.id);
              return (
                <div key={ex.id} className="border border-slate-800 rounded p-3 flex flex-wrap justify-between gap-2">
                  <div>
                    <div className="font-semibold text-rose-400">
                      انقراض عند الدورة {ex.tick} (الجيل {ex.generationAtExtinction})
                    </div>
                    <div className="text-slate-400 mt-0.5">
                      الأسباب: {ex.rootCausesAr.join('، ')} · محفوظات: {ex.preservedExperienceCount} تجربة،{' '}
                      {ex.preservedKnowledgeCount} معرفة، {ex.preservedBrainCount} عقل
                    </div>
                  </div>
                  <div className="text-left">
                    {rec ? (
                      <div className="text-emerald-400">{rec.notesAr}</div>
                    ) : (
                      <div className="text-amber-400">بانتظار تنفيذ الاستعادة…</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

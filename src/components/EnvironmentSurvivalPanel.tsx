import React, { useState } from 'react';
import { AlertTriangle, CloudRain, Compass, RotateCcw, ShieldAlert } from 'lucide-react';
import type { RecoveryPolicyMode, TelemetrySnapshot } from '../shared/types.ts';

const BIOME_COLORS: Record<string, string> = {
  riverbank: 'border-cyan-700/60 bg-cyan-950/35',
  forest: 'border-emerald-700/60 bg-emerald-950/30',
  savanna: 'border-amber-700/50 bg-amber-950/25',
  marsh: 'border-teal-700/50 bg-teal-950/30',
  rocky_highland: 'border-slate-600/60 bg-slate-900/60',
  arid_steppe: 'border-orange-800/50 bg-orange-950/25',
};

export function EnvironmentSurvivalPanel({
  snapshot,
  onSetRecoveryPolicy,
  onManualRecover,
  onTriggerExtinctionTest,
}: {
  snapshot: TelemetrySnapshot;
  onSetRecoveryPolicy: (policy: RecoveryPolicyMode) => Promise<void>;
  onManualRecover: (policy: RecoveryPolicyMode) => Promise<void>;
  onTriggerExtinctionTest: () => Promise<void>;
}) {
  const [selectedSectorKey, setSelectedSectorKey] = useState<string>('0,0');
  const [confirmExtinctionTest, setConfirmExtinctionTest] = useState(false);

  const selectedSector =
    snapshot.environment.sectors.find((s) => s.key === selectedSectorKey) ??
    snapshot.environment.sectors[0];

  const env = snapshot.environment;
  const surv = snapshot.survivalAndExtinction;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 text-xs">
        <div className="bg-[#0F1623] border border-slate-800 rounded p-2.5">
          <div className="text-slate-400 flex items-center gap-1">
            <CloudRain className="w-3.5 h-3.5 text-cyan-400" />
            الموسم والمناخ
          </div>
          <div className="font-mono font-bold text-slate-100 mt-0.5">
            {env.season} · {env.temperatureC}°C
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            إجهاد مناخي: {(env.climateStress * 100).toFixed(0)}%
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded p-2.5">
          <div className="text-slate-400">النباتات / المياه</div>
          <div className="font-mono tabular-nums font-bold text-emerald-300 mt-0.5">
            {env.totalPlants.toLocaleString('en-US')} / {env.totalWater.toLocaleString('en-US')}
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded p-2.5">
          <div className="text-slate-400">الحيوانات البرية</div>
          <div className="font-mono tabular-nums font-bold text-amber-300 mt-0.5">
            {env.totalAnimals}
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded p-2.5">
          <div className="text-slate-400">مآوٍ / مخازن / زراعة أولية</div>
          <div className="font-mono tabular-nums font-bold text-cyan-300 mt-0.5">
            {env.sheltersBuilt} / {env.foodCaches} / {env.plantedPlots}
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded p-2.5">
          <div className="text-slate-400">معدل البقاء</div>
          <div className="font-mono tabular-nums font-bold text-slate-100 mt-0.5">
            {(surv.survivalRate * 100).toFixed(1)}%
          </div>
        </div>
        <div className="bg-[#0F1623] border border-slate-800 rounded p-2.5">
          <div className="text-slate-400">خطر الانقراض</div>
          <div className="font-mono font-bold text-rose-300 mt-0.5">{surv.riskLevel}</div>
        </div>
      </div>

      {/* 10x10 World Grid (5 km2) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 bg-[#0F1623] border border-slate-800 rounded-lg p-3.5">
          <div className="flex items-center justify-between mb-2.5 text-xs">
            <div className="flex items-center gap-2 font-semibold text-slate-200">
              <Compass className="w-4 h-4 text-cyan-400" />
              <span>خريطة العالم الأولي ({env.areaKm2} كم² — 100 قطاع تفاعلي)</span>
            </div>
            <span className="text-[11px] text-slate-400">اضغط على أي قطاع للمعاينة</span>
          </div>
          <div className="grid grid-cols-10 gap-1">
            {env.sectors.map((sec) => {
              const isSelected = sec.key === selectedSectorKey;
              return (
                <button
                  key={sec.key}
                  onClick={() => setSelectedSectorKey(sec.key)}
                  className={`aspect-square rounded border p-1 flex flex-col justify-between text-right transition ${
                    BIOME_COLORS[sec.biome] ?? 'border-slate-700 bg-slate-900'
                  } ${isSelected ? 'ring-2 ring-cyan-400' : ''}`}
                  title={`قطاع ${sec.key} (${sec.biome}) - أفراد: ${sec.agentsCount}`}
                >
                  <div className="flex items-center justify-between text-[9px] font-mono tabular-nums text-slate-300">
                    <span>{sec.key}</span>
                    {sec.waterVolume > 0 && <span className="text-cyan-300">●</span>}
                  </div>
                  <div className="text-[11px] font-mono tabular-nums font-bold text-slate-100 text-center">
                    {sec.agentsCount > 0 ? sec.agentsCount : ''}
                  </div>
                  <div className="text-[8px] font-mono text-slate-400 flex justify-between">
                    <span>{sec.sheltersBuilt > 0 ? `⌂${sec.sheltersBuilt}` : ''}</span>
                    <span>{sec.predatorsCount > 0 ? '!' : ''}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3.5 space-y-3 text-xs">
          <h4 className="font-semibold text-slate-200">
            تفاصيل القطاع المحدد ({selectedSector?.key})
          </h4>
          {selectedSector && (
            <div className="space-y-2 font-mono tabular-nums">
              <div className="flex justify-between">
                <span className="font-sans text-slate-400">البيئة الحيوية:</span>
                <span className="text-cyan-300">{selectedSector.biome}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-sans text-slate-400">السكان المتواجدون:</span>
                <span>{selectedSector.agentsCount} فرد</span>
              </div>
              <div className="flex justify-between">
                <span className="font-sans text-slate-400">إمداد النباتات:</span>
                <span className="text-emerald-300">{selectedSector.plantSupply}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-sans text-slate-400">حجم المياه:</span>
                <span className={selectedSector.waterContaminated ? 'text-amber-300' : 'text-cyan-300'}>
                  {selectedSector.waterVolume}{' '}
                  {selectedSector.waterContaminated ? '(احتمال تلوث)' : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-sans text-slate-400">الحيوانات / المفترسات:</span>
                <span>
                  {selectedSector.animalsCount} / {selectedSector.predatorsCount}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-sans text-slate-400">مستوى الخطر البيئي:</span>
                <span className="text-rose-300">
                  {(selectedSector.hazardLevel * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-sans text-slate-400">مآوٍ / مخازن غذاء:</span>
                <span>
                  {selectedSector.sheltersBuilt} / {selectedSector.foodCaches}
                </span>
              </div>
            </div>
          )}

          {/* Extinction & Rebirth Controls */}
          <div className="pt-3 border-t border-slate-800 space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-slate-200">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>بروتوكول الأزمات والانقراض (Rebirth)</span>
            </div>
            <label className="block text-[11px] text-slate-400">سياسة الاستعادة التلقائية:</label>
            <select
              value={snapshot.recoveryPolicy}
              onChange={(e) => void onSetRecoveryPolicy(e.target.value as RecoveryPolicyMode)}
              className="w-full bg-[#070B12] border border-slate-700 rounded px-2 py-1.5 text-slate-200"
            >
              <option value="spawn_new_generation">إنشاء جيل جديد مع وراثة المعرفة الجماعية</option>
              <option value="revive_preserved_individuals">إحياء الأفراد المحفوظين بأوزانهم الأصلية</option>
            </select>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => void onManualRecover(snapshot.recoveryPolicy)}
                className="flex-1 px-2.5 py-1.5 rounded bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-200 font-medium flex items-center justify-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                إطلاق استعادة جيل
              </button>
              {!confirmExtinctionTest ? (
                <button
                  onClick={() => setConfirmExtinctionTest(true)}
                  className="px-2.5 py-1.5 rounded bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-200"
                >
                  اختبار انقراض
                </button>
              ) : (
                <button
                  onClick={() => {
                    setConfirmExtinctionTest(false);
                    void onTriggerExtinctionTest();
                  }}
                  className="px-2.5 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold"
                >
                  تأكيد الاختبار
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Crisis Diagnostics & Extinction Archive */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
        <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3.5 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-slate-200">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>مسببات الوفيات وتشخيص الأزمات</span>
          </div>
          {surv.crisisDiagnosticsAr.length > 0 && (
            <div className="p-2 rounded bg-amber-950/30 border border-amber-700/40 text-amber-200">
              {surv.crisisDiagnosticsAr.join(' · ')}
            </div>
          )}
          <div className="space-y-1">
            {Object.entries(surv.causesOfDeath).length === 0 ? (
              <p className="text-slate-500">لم تسجل وفيات بعد.</p>
            ) : (
              Object.entries(surv.causesOfDeath)
                .sort((a, b) => b[1] - a[1])
                .map(([cause, count]) => (
                  <div
                    key={cause}
                    className="flex justify-between px-2 py-1 bg-[#070B12] border border-slate-800/70 rounded"
                  >
                    <span className="text-slate-200">{cause}</span>
                    <span className="font-mono tabular-nums text-rose-300">{count} حالة</span>
                  </div>
                ))
            )}
          </div>
        </div>

        <div className="bg-[#0F1623] border border-slate-800 rounded-lg p-3.5 space-y-2">
          <h4 className="font-semibold text-slate-200">
            أرشيف الانقراض والاستعادة ({surv.extinctionRecords.length})
          </h4>
          {surv.extinctionRecords.length === 0 ? (
            <p className="text-slate-500">لم يحدث أي انقراض جماعي في هذا الخط الزمني.</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {surv.extinctionRecords.map((ext) => (
                <div
                  key={ext.id}
                  className="p-2 bg-[#070B12] border border-rose-900/50 rounded space-y-1"
                >
                  <div className="flex justify-between font-mono text-rose-300">
                    <span>{ext.id}</span>
                    <span>
                      T{ext.tick} · الجيل {ext.generationAtExtinction}
                    </span>
                  </div>
                  <div className="text-slate-300">الأسباب: {ext.rootCausesAr.join('، ')}</div>
                  <div className="text-[11px] text-emerald-300 font-mono">
                    محفوظات مستمرة: {ext.preservedKnowledgeCount} معرفة ·{' '}
                    {ext.preservedExperienceCount} تجربة · {ext.preservedBrainCount} عقل
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

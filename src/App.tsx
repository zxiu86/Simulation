import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BookOpen,
  Brain,
  Compass,
  FastForward,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Rocket,
  SkipForward,
  Users,
  WifiOff,
} from 'lucide-react';
import type {
  PromotionVerificationResult,
  RecoveryPolicyMode,
  SimulationEvent,
  TelemetrySnapshot,
  TrainingSessionState,
} from './shared/types.ts';
import { AgentDetailModal, GenerationDetailModal } from './components/DetailModals.tsx';
import { EnvironmentSurvivalPanel } from './components/EnvironmentSurvivalPanel.tsx';
import { IsolatedTrainingPanel } from './components/IsolatedTrainingPanel.tsx';
import { KnowledgePanel } from './components/KnowledgePanel.tsx';
import { MindsPanel } from './components/MindsPanel.tsx';
import { OverviewPanel } from './components/OverviewPanel.tsx';
import { PopulationPanel } from './components/PopulationPanel.tsx';
import { SocietyTimelinePanel } from './components/SocietyTimelinePanel.tsx';

type TabKey =
  | 'overview'
  | 'population'
  | 'minds'
  | 'knowledge'
  | 'environment'
  | 'society'
  | 'training';

type ConnectionState = 'connected' | 'reconnecting' | 'disconnected';

const TABS: Array<{ key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'overview', label: 'النظرة الشاملة', icon: Activity },
  { key: 'population', label: 'السكان والأجيال', icon: Users },
  { key: 'minds', label: 'العقول والشبكات', icon: Brain },
  { key: 'knowledge', label: 'المعرفة والتجارب', icon: BookOpen },
  { key: 'environment', label: 'البيئة والانقراض', icon: Compass },
  { key: 'society', label: 'المجتمع والأحداث', icon: Radio },
  { key: 'training', label: 'التدريب المعزول', icon: Rocket },
];

export default function App() {
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot | null>(null);
  const [liveEvents, setLiveEvents] = useState<SimulationEvent[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('reconnecting');
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedGeneration, setSelectedGeneration] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [bannerNote, setBannerNote] = useState<string | null>(null);

  const lastSequenceRef = useRef<number>(0);
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const simulationIdRef = useRef<string>('civ-main-timeline');

  const mergeIncomingEvents = useCallback((incoming: SimulationEvent[]) => {
    if (!incoming || incoming.length === 0) return;
    setLiveEvents((prev) => {
      const additions: SimulationEvent[] = [];
      for (const evt of incoming) {
        const key = evt.eventId ?? evt.id;
        if (seenEventIdsRef.current.has(key)) continue;
        seenEventIdsRef.current.add(key);
        if (typeof evt.sequence === 'number' && evt.sequence > lastSequenceRef.current) {
          lastSequenceRef.current = evt.sequence;
        }
        additions.push(evt);
      }
      if (additions.length === 0) return prev;
      // Keep newest first sorted by sequence desc
      const merged = [...additions, ...prev].sort(
        (a, b) => (b.sequence ?? 0) - (a.sequence ?? 0),
      );
      if (merged.length > 300) merged.length = 300;
      if (seenEventIdsRef.current.size > 1200) {
        seenEventIdsRef.current = new Set(merged.map((e) => e.eventId ?? e.id));
      }
      return merged;
    });
  }, []);

  const recoverMissedEvents = useCallback(
    async (afterSeq: number, simId: string) => {
      try {
        const res = await fetch(
          `/api/telemetry/events?afterSequence=${afterSeq}&simulationId=${encodeURIComponent(simId)}&limit=250`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as { events: SimulationEvent[] };
        if (Array.isArray(data.events) && data.events.length > 0) {
          mergeIncomingEvents(data.events);
        }
      } catch {
        // ignore transient fetch failure
      }
    },
    [mergeIncomingEvents],
  );

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      setConnectionState((prev) => (prev === 'connected' ? 'reconnecting' : prev));
      es = new EventSource('/api/stream');

      es.addEventListener('telemetry', (e) => {
        const data = JSON.parse((e as MessageEvent).data) as TelemetrySnapshot;
        const prevSimId = simulationIdRef.current;
        if (data.simulationId && data.simulationId !== prevSimId) {
          simulationIdRef.current = data.simulationId;
          lastSequenceRef.current = 0;
          seenEventIdsRef.current.clear();
          setLiveEvents([]);
        }
        setSnapshot(data);
        setConnectionState('connected');

        if (data.recentEvents && data.recentEvents.length > 0) {
          mergeIncomingEvents(data.recentEvents);
        }

        // Sequence gap recovery when client missed events while disconnected or due to backpressure
        if (
          typeof data.lastSequence === 'number' &&
          data.lastSequence > lastSequenceRef.current
        ) {
          void recoverMissedEvents(lastSequenceRef.current, data.simulationId);
        }
      });

      es.addEventListener('sim_event', (e) => {
        const evt = JSON.parse((e as MessageEvent).data) as SimulationEvent;
        const expectedNext = lastSequenceRef.current + 1;
        if (
          typeof evt.sequence === 'number' &&
          lastSequenceRef.current > 0 &&
          evt.sequence > expectedNext
        ) {
          void recoverMissedEvents(lastSequenceRef.current, evt.simulationId ?? simulationIdRef.current);
        }
        mergeIncomingEvents([evt]);
      });

      es.addEventListener('ping', () => {
        setConnectionState('connected');
      });

      es.onerror = () => {
        es?.close();
        setConnectionState('reconnecting');
        if (!disposed) {
          reconnectTimer = setTimeout(() => {
            setConnectionState('disconnected');
            connect();
          }, 2500);
        }
      };
    };

    // Initial state bootstrap via HTTP
    fetch('/api/state')
      .then((r) => r.json())
      .then((data: TelemetrySnapshot) => {
        simulationIdRef.current = data.simulationId;
        setSnapshot(data);
        if (data.recentEvents) mergeIncomingEvents(data.recentEvents);
        if (typeof data.lastSequence === 'number') {
          lastSequenceRef.current = Math.max(lastSequenceRef.current, data.lastSequence);
        }
      })
      .catch(() => setConnectionState('disconnected'));

    connect();

    return () => {
      disposed = true;
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [mergeIncomingEvents, recoverMissedEvents]);

  const sendSimControl = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/sim/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { snapshot?: TelemetrySnapshot };
    if (data.snapshot) setSnapshot(data.snapshot);
  };

  if (!snapshot) {
    return (
      <div className="min-h-screen bg-[#070B12] text-slate-200 flex items-center justify-center p-6">
        <div className="bg-[#0F1623] border border-slate-800 rounded-xl p-6 text-center space-y-2 max-w-md">
          <div className="text-base font-bold text-cyan-300">مرصد «من البداية إلى الحضارة»</div>
          <div className="text-xs text-slate-400">
            جاري الاتصال بمحرك المحاكاة واستعادة آخر نقطة فحص سليمة...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#070B12] text-[#E6EDF6] flex flex-col">
      {/* Top Observatory Control & Telemetry Header */}
      <header className="sticky top-0 z-30 bg-[#0A0F1A]/95 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-8 rounded bg-cyan-500" />
            <div>
              <h1 className="text-sm sm:text-base font-bold text-slate-100 leading-tight">
                من البداية إلى الحضارة — مرصد التطور الجماعي
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums text-slate-400 mt-0.5">
                <span>Tick: {snapshot.tick}</span>
                <span>·</span>
                <span>الأيام: {snapshot.worldDays}</span>
                <span>·</span>
                <span>الجيل: {snapshot.currentGeneration}</span>
                <span>·</span>
                <span>الأحياء: {snapshot.population.alive}</span>
                <span>·</span>
                <span className="text-cyan-300">Seq: #{snapshot.lastSequence}</span>
              </div>
            </div>
          </div>

          {/* Explicit Separated Operational States */}
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <div
              className={`px-2 py-1 rounded border font-medium flex items-center gap-1.5 ${
                connectionState === 'connected'
                  ? 'border-emerald-700/60 bg-emerald-950/30 text-emerald-300'
                  : connectionState === 'reconnecting'
                    ? 'border-amber-700/60 bg-amber-950/30 text-amber-300'
                    : 'border-rose-700/60 bg-rose-950/30 text-rose-300'
              }`}
            >
              {connectionState === 'connected' ? (
                <Radio className="w-3 h-3" />
              ) : (
                <WifiOff className="w-3 h-3" />
              )}
              <span>
                الاتصال:{' '}
                {connectionState === 'connected'
                  ? 'متصل (SSE)'
                  : connectionState === 'reconnecting'
                    ? 'إعادة مزامنة...'
                    : 'منقطع'}
              </span>
            </div>

            <div className="px-2 py-1 rounded border border-slate-700 bg-[#0F1623] text-slate-200 font-mono">
              المحاكاة: {snapshot.simStatus}
            </div>
            <div className="px-2 py-1 rounded border border-slate-700 bg-[#0F1623] text-cyan-300 font-mono">
              سير العمل: {snapshot.workflowStatus}
            </div>
            <div className="px-2 py-1 rounded border border-slate-700 bg-[#0F1623] text-slate-300 font-mono">
              الحفظ: {snapshot.persistenceStatus.state}
            </div>
          </div>

          {/* Engine Controls */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {snapshot.simStatus !== 'Running' ? (
              <button
                onClick={() => void sendSimControl({ action: 'start' })}
                className="px-2.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1"
              >
                <Play className="w-3.5 h-3.5" />
                تشغيل
              </button>
            ) : (
              <button
                onClick={() => void sendSimControl({ action: 'pause' })}
                className="px-2.5 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold flex items-center gap-1"
              >
                <Pause className="w-3.5 h-3.5" />
                إيقاف مؤقت
              </button>
            )}

            <button
              onClick={() => void sendSimControl({ action: 'step', steps: 1 })}
              className="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 flex items-center gap-1"
            >
              <SkipForward className="w-3.5 h-3.5" />
              +1
            </button>
            <button
              onClick={() => void sendSimControl({ action: 'step', steps: 10 })}
              className="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 flex items-center gap-1"
            >
              <FastForward className="w-3.5 h-3.5" />
              +10
            </button>

            <select
              value={String(snapshot.speedMultiplier)}
              onChange={(e) =>
                void sendSimControl({
                  action: 'set_speed',
                  speedMultiplier: Number(e.target.value),
                })
              }
              className="bg-[#0F1623] border border-slate-700 rounded px-2 py-1.5 text-slate-200 font-mono"
            >
              <option value="0.5">0.5x</option>
              <option value="1">1x</option>
              <option value="2">2x</option>
              <option value="4">4x</option>
              <option value="8">8x</option>
            </select>

            {!confirmReset ? (
              <button
                onClick={() => setConfirmReset(true)}
                className="px-2 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300"
                title="بدء تجربة جديدة"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={() => {
                  setConfirmReset(false);
                  void sendSimControl({ action: 'reset' });
                }}
                className="px-2.5 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold"
              >
                تأكيد التصفير
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 border-t border-slate-800/80 flex overflow-x-auto gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-3 py-2 text-xs font-medium flex items-center gap-1.5 border-b-2 whitespace-nowrap transition ${
                  active
                    ? 'border-cyan-400 text-cyan-300 bg-[#0F1623]/60'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Honest Banner for Persistence Errors or Disconnections */}
      {(connectionState !== 'connected' || snapshot.persistenceStatus.lastError || bannerNote) && (
        <div className="max-w-7xl w-full mx-auto px-4 pt-3">
          <div className="p-2.5 rounded-lg border border-amber-700/60 bg-amber-950/30 text-amber-200 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                {bannerNote ??
                  snapshot.persistenceStatus.lastError ??
                  'انقطع البث اللحظي SSE مؤقتاً؛ يتم إعادة الاتصال واسترجاع الأحداث الفائتة بالترتيب التسلسلي.'}
              </span>
            </div>
            {bannerNote && (
              <button
                onClick={() => setBannerNote(null)}
                className="text-[11px] underline text-amber-300"
              >
                إغلاق
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-4">
        {activeTab === 'overview' && (
          <OverviewPanel
            snapshot={snapshot}
            onSaveCheckpoint={async () => {
              const r = await fetch('/api/checkpoints/save', { method: 'POST' });
              const data = (await r.json()) as { ok?: boolean; error?: string };
              if (!data.ok && data.error) setBannerNote(data.error);
              else setBannerNote('تم حفظ نقطة الفحص المتدرجة وتحديث البصمة الرقمية.');
            }}
            onRestoreCheckpoint={async (checkpointId) => {
              const r = await fetch('/api/checkpoints/restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ checkpointId }),
              });
              const data = (await r.json()) as { reasonAr?: string };
              if (data.reasonAr) setBannerNote(data.reasonAr);
            }}
            onVerifyCheckpoint={async (checkpointId) => {
              const r = await fetch('/api/checkpoints/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ checkpointId }),
              });
              return (await r.json()) as { valid: boolean; reasonAr: string };
            }}
          />
        )}

        {activeTab === 'population' && (
          <PopulationPanel
            snapshot={snapshot}
            onSelectAgent={(id) => setSelectedAgentId(id)}
            onSelectGeneration={(g) => setSelectedGeneration(g)}
          />
        )}

        {activeTab === 'minds' && (
          <MindsPanel snapshot={snapshot} onSelectAgent={(id) => setSelectedAgentId(id)} />
        )}

        {activeTab === 'knowledge' && <KnowledgePanel snapshot={snapshot} />}

        {activeTab === 'environment' && (
          <EnvironmentSurvivalPanel
            snapshot={snapshot}
            onSetRecoveryPolicy={async (policy: RecoveryPolicyMode) => {
              await sendSimControl({ action: 'set_recovery_policy', recoveryPolicy: policy });
            }}
            onManualRecover={async (policy: RecoveryPolicyMode) => {
              await sendSimControl({ action: 'manual_recover', recoveryPolicy: policy });
            }}
            onTriggerExtinctionTest={async () => {
              await sendSimControl({ action: 'trigger_extinction_test' });
            }}
          />
        )}

        {activeTab === 'society' && (
          <SocietyTimelinePanel snapshot={snapshot} liveEvents={liveEvents} />
        )}

        {activeTab === 'training' && (
          <IsolatedTrainingPanel
            snapshot={snapshot}
            onStartTraining={async (params: {
              episodesTarget: number;
              focusMode: TrainingSessionState['focusMode'];
              cohortSize: number;
            }) => {
              await fetch('/api/training/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params),
              });
            }}
            onStopTraining={async () => {
              await fetch('/api/training/stop', { method: 'POST' });
            }}
            onExportPackage={async () => {
              await fetch('/api/training/export', { method: 'POST' });
            }}
            onPromotePackage={async (packageId: string) => {
              const r = await fetch('/api/training/promote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ packageId }),
              });
              return (await r.json()) as PromotionVerificationResult;
            }}
          />
        )}
      </main>

      <AgentDetailModal agentId={selectedAgentId} onClose={() => setSelectedAgentId(null)} />
      <GenerationDetailModal
        generationNum={selectedGeneration}
        onClose={() => setSelectedGeneration(null)}
        onSelectAgent={(id) => setSelectedAgentId(id)}
      />
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import type {
  AgentState,
  AgentSummaryView,
  BrainPackage,
  CivilizationKnowledgeItem,
  CollectiveExperienceRecord,
  GenerationSummary,
  PromotionVerificationResult,
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

type TabId =
  | 'overview'
  | 'population'
  | 'minds'
  | 'knowledge'
  | 'environment'
  | 'society'
  | 'training';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'نظرة عامة' },
  { id: 'population', label: 'السكان والأفراد' },
  { id: 'minds', label: 'العقول والتعلم' },
  { id: 'knowledge', label: 'المعرفة واللغة' },
  { id: 'environment', label: 'البيئة والبقاء' },
  { id: 'society', label: 'المجتمع والتاريخ' },
  { id: 'training', label: 'التدريب المعزول' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot | null>(null);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [lastUpdateAt, setLastUpdateAt] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);

  // Modals state
  const [selectedAgent, setSelectedAgent] = useState<AgentState | null>(null);
  const [selectedAgentExps, setSelectedAgentExps] = useState<CollectiveExperienceRecord[]>([]);
  const [agentModalLoading, setAgentModalLoading] = useState(false);

  const [selectedGenDetail, setSelectedGenDetail] = useState<{
    summary: GenerationSummary;
    agents: AgentSummaryView[];
    discoveries: CivilizationKnowledgeItem[];
  } | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const connectSSE = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    setConnectionState('connecting');
    const es = new EventSource('/api/stream');
    esRef.current = es;

    es.addEventListener('telemetry', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data) as TelemetrySnapshot;
        setSnapshot(data);
        setConnectionState('connected');
        setLastUpdateAt(new Date().toLocaleTimeString('ar-EG'));
      } catch {
        // ignore malformed frame
      }
    });

    es.addEventListener('ping', () => {
      setConnectionState('connected');
    });

    es.onerror = () => {
      setConnectionState('disconnected');
      es.close();
      esRef.current = null;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      reconnectTimerRef.current = window.setTimeout(() => {
        connectSSE();
      }, 3000);
    };
  }, []);

  useEffect(() => {
    // Initial fetch fallback + real SSE stream
    fetch('/api/state')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: TelemetrySnapshot | null) => {
        if (data) {
          setSnapshot(data);
          setLastUpdateAt(new Date().toLocaleTimeString('ar-EG'));
        }
      })
      .catch(() => {});

    connectSSE();

    return () => {
      esRef.current?.close();
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
    };
  }, [connectSSE]);

  const showNotice = (msg: string) => {
    setNoticeMsg(msg);
    window.setTimeout(() => setNoticeMsg(null), 5000);
  };

  const handleSimControl = async (action: string, payload?: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/sim/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      if (res.ok) {
        const data = (await res.json()) as { snapshot?: TelemetrySnapshot };
        if (data.snapshot) {
          setSnapshot(data.snapshot);
          setLastUpdateAt(new Date().toLocaleTimeString('ar-EG'));
        }
      }
    } catch {
      showNotice('تعذر إرسال أمر التحكم إلى الخادم.');
    }
  };

  const handleSaveCheckpoint = async () => {
    try {
      const res = await fetch('/api/checkpoints/save', { method: 'POST' });
      const data = (await res.json()) as { ok: boolean; manifest?: { checkpointId: string } };
      if (data.ok) showNotice(`تم حفظ نقطة الفحص: ${data.manifest?.checkpointId}`);
    } catch {
      showNotice('فشل حفظ نقطة الفحص.');
    }
  };

  const handleRestoreCheckpoint = async (checkpointId?: string, knowledgeOnly?: boolean) => {
    try {
      const res = await fetch('/api/checkpoints/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkpointId, knowledgeOnly }),
      });
      const data = (await res.json()) as { reasonAr: string };
      showNotice(data.reasonAr);
    } catch {
      showNotice('تعذر تنفيذ الاستعادة.');
    }
  };

  const handleVerifyCheckpoint = async (checkpointId: string) => {
    const res = await fetch('/api/checkpoints/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkpointId }),
    });
    return (await res.json()) as { valid: boolean; reasonAr: string };
  };

  const handleStartTraining = async (
    episodesTarget: number,
    focusMode: TrainingSessionState['focusMode'],
  ) => {
    await fetch('/api/training/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ episodesTarget, focusMode, cohortSize: 16 }),
    });
    showNotice('بدأت جلسة التدريب المعزول على الخادم.');
  };

  const handleStopTraining = async () => {
    await fetch('/api/training/stop', { method: 'POST' });
    showNotice('تم إيقاف جلسة التدريب المعزول.');
  };

  const handleExportPackage = async () => {
    const res = await fetch('/api/training/export', { method: 'POST' });
    const data = (await res.json()) as { ok: boolean; reasonAr?: string };
    if (!data.ok && data.reasonAr) showNotice(data.reasonAr);
    else showNotice('تم تصدير حزمة العقل المدرب وتوقيعها رقمياً.');
  };

  const handlePromotePackage = async (
    packageId?: string,
    rawPackage?: BrainPackage,
  ): Promise<PromotionVerificationResult> => {
    const res = await fetch('/api/training/promote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packageId, rawPackage }),
    });
    return (await res.json()) as PromotionVerificationResult;
  };

  const handleOpenAgentDetail = async (id: string) => {
    setAgentModalLoading(true);
    setSelectedAgent(null);
    setSelectedGenDetail(null);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(id)}`);
      if (res.ok) {
        const data = (await res.json()) as {
          agent: AgentState;
          experiences: CollectiveExperienceRecord[];
        };
        setSelectedAgent(data.agent);
        setSelectedAgentExps(data.experiences);
      }
    } finally {
      setAgentModalLoading(false);
    }
  };

  const handleOpenGenDetail = async (gen: number) => {
    const res = await fetch(`/api/generations/${gen}`);
    if (res.ok) {
      const data = (await res.json()) as {
        summary: GenerationSummary;
        agents: AgentSummaryView[];
        discoveries: CivilizationKnowledgeItem[];
      };
      setSelectedGenDetail(data);
    }
  };

  return (
    <div className="min-h-screen bg-[#070B12] text-slate-100 flex flex-col">
      {/* 3-Zone Top Telemetry Header */}
      <header className="border-b border-slate-800 bg-[#0B111C] sticky top-0 z-30">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-6">
          {/* Zone 1: Brand Title */}
          <div className="text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
            من البداية إلى الحضارة
          </div>

          {/* Zone 2: Clean Single-line Navigation */}
          <nav className="hidden lg:flex items-center gap-5 text-xs font-medium">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                  activeTab === tab.id
                    ? 'text-cyan-400 border-cyan-400'
                    : 'text-slate-400 border-transparent hover:text-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: Real Live Connection Status & Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5 text-xs font-mono-tabular whitespace-nowrap">
              {connectionState === 'connected' ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">بث حي متصل</span>
                </>
              ) : connectionState === 'connecting' ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-amber-400">جاري الاتصال…</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                  <span className="text-rose-400">الاتصال منقطع</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Mobile/Tablet tab strip */}
        <div className="lg:hidden border-t border-slate-800/80 px-4 py-2 flex items-center gap-3 overflow-x-auto text-xs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-2.5 py-1 rounded whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Honest Disconnection / Stale-Data Warning Banner */}
      {connectionState === 'disconnected' && (
        <div className="bg-rose-950/60 border-b border-rose-500/40 px-4 py-2 text-xs text-rose-200 text-center">
          انقطع البث الحي مع المحرك الخلفي — البيانات المعروضة هي آخر حالة محفوظة وليست لحظية
          {lastUpdateAt ? ` (آخر تحديث: ${lastUpdateAt})` : ''}. جاري إعادة الاتصال تلقائياً…
        </div>
      )}

      {noticeMsg && (
        <div className="bg-cyan-950/60 border-b border-cyan-500/40 px-4 py-2 text-xs text-cyan-200 text-center">
          {noticeMsg}
        </div>
      )}

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6">
        {!snapshot ? (
          <div className="bg-[#0F1623] border border-slate-800 rounded-md p-10 text-center text-sm text-slate-400">
            جاري استلام القياسات الفعلية الأولى من محرك المحاكاة…
          </div>
        ) : (
          <>
            {activeTab === 'overview' && (
              <OverviewPanel
                snapshot={snapshot}
                onSimControl={handleSimControl}
                onSaveCheckpoint={handleSaveCheckpoint}
              />
            )}
            {activeTab === 'population' && (
              <PopulationPanel
                snapshot={snapshot}
                onSelectAgent={handleOpenAgentDetail}
              />
            )}
            {activeTab === 'minds' && (
              <MindsPanel
                snapshot={snapshot}
                onSelectAgent={handleOpenAgentDetail}
                onSelectGeneration={handleOpenGenDetail}
              />
            )}
            {activeTab === 'knowledge' && <KnowledgePanel snapshot={snapshot} />}
            {activeTab === 'environment' && (
              <EnvironmentSurvivalPanel
                snapshot={snapshot}
                onSimControl={handleSimControl}
                onRestoreCheckpoint={handleRestoreCheckpoint}
                onVerifyCheckpoint={handleVerifyCheckpoint}
              />
            )}
            {activeTab === 'society' && (
              <SocietyTimelinePanel
                snapshot={snapshot}
                onSelectAgent={handleOpenAgentDetail}
                onSelectGeneration={handleOpenGenDetail}
              />
            )}
            {activeTab === 'training' && (
              <IsolatedTrainingPanel
                snapshot={snapshot}
                onStartTraining={handleStartTraining}
                onStopTraining={handleStopTraining}
                onExportPackage={handleExportPackage}
                onPromotePackage={handlePromotePackage}
              />
            )}
          </>
        )}
      </main>

      {/* Modals */}
      <AgentDetailModal
        agent={selectedAgent}
        experiences={selectedAgentExps}
        loading={agentModalLoading}
        onClose={() => {
          setSelectedAgent(null);
          setAgentModalLoading(false);
        }}
      />
      <GenerationDetailModal
        detail={selectedGenDetail}
        onClose={() => setSelectedGenDetail(null)}
        onSelectAgent={handleOpenAgentDetail}
      />
    </div>
  );
}

import dotenv from 'dotenv';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import type {
  BrainPackage,
  RecoveryPolicyMode,
  SimulationEvent,
  TelemetrySnapshot,
  TrainingSessionState,
  WorkflowOperationalStatus,
} from './src/shared/types.ts';
import {
  IsolatedTrainingManager,
  verifyAndPromoteBrainPackage,
} from './src/server/engine/isolatedTrainer.ts';
import { CivilizationSimulationEngine } from './src/server/engine/simulationEngine.ts';
import { PersistenceManager } from './src/server/persistence/storage.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const AUTO_CHECKPOINT_INTERVAL_TICKS = 40;
const EVENT_FLUSH_BATCH_MS = 250;

export function createObservatoryApp(options?: {
  dataDir?: string;
  autoStartEngine?: boolean;
  skipVite?: boolean;
}) {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  const persistence = new PersistenceManager(options?.dataDir);
  persistence.acquireLock('express-server');

  const engine = new CivilizationSimulationEngine({
    simulationId: process.env.SIMULATION_ID ?? 'civ-main-timeline',
    runId: `srv_${Date.now()}`,
    workflowName: 'المرصد المحلي الخادمي',
  });
  const trainer = new IsolatedTrainingManager();

  // Remote GitHub Actions telemetry overlay (when external runner ingests live telemetry)
  let remoteOverlay: {
    snapshot?: TelemetrySnapshot;
    lastIngestMs: number;
    workflowStatus?: WorkflowOperationalStatus;
    runId?: string;
  } | null = null;

  // Event Producer -> Telemetry Pipeline -> SQLite Persistent Event Store + SSE
  const pendingEventStoreBatch: SimulationEvent[] = [];
  const sseClients = new Set<express.Response>();

  const safeSseWrite = (res: express.Response, frame: string): boolean => {
    if (res.writableEnded || res.destroyed) return false;
    try {
      const ok = res.write(frame);
      if (!ok && res.writableNeedDrain) {
        // Backpressure detected: drop non-essential live frame, client will recover missed events via sequence gap check
        return true;
      }
      return true;
    } catch {
      return false;
    }
  };

  const broadcastEventFrame = (evt: SimulationEvent) => {
    if (sseClients.size === 0) return;
    const frame = `id: ${evt.sequence ?? 0}\nevent: sim_event\ndata: ${JSON.stringify(evt)}\n\n`;
    for (const res of sseClients) {
      if (!safeSseWrite(res, frame)) {
        sseClients.delete(res);
      }
    }
  };

  const getEffectiveSnapshot = (): TelemetrySnapshot => {
    if (
      remoteOverlay?.snapshot &&
      Date.now() - remoteOverlay.lastIngestMs < 45_000 &&
      remoteOverlay.workflowStatus === 'Running'
    ) {
      return {
        ...remoteOverlay.snapshot,
        persistenceStatus: {
          ...remoteOverlay.snapshot.persistenceStatus,
          sqliteReady: persistence.sqliteReady,
        },
      };
    }
    const snap = engine.buildTelemetrySnapshot();
    if (remoteOverlay?.workflowStatus && Date.now() - remoteOverlay.lastIngestMs < 120_000) {
      snap.workflowStatus = remoteOverlay.workflowStatus;
    }
    return snap;
  };

  const broadcastTelemetry = () => {
    if (sseClients.size === 0) return;
    const snapshot = getEffectiveSnapshot();
    const payload = `event: telemetry\ndata: ${JSON.stringify(snapshot)}\n\n`;
    for (const res of sseClients) {
      if (!safeSseWrite(res, payload)) {
        sseClients.delete(res);
      }
    }
  };

  const flushEventsToSqlite = () => {
    if (pendingEventStoreBatch.length === 0) return;
    const batch = pendingEventStoreBatch.splice(0, pendingEventStoreBatch.length);
    try {
      persistence.appendTelemetryEvents(batch);
    } catch (err) {
      console.error('[TelemetryStore] Failed to persist event batch:', err);
    }
  };

  engine.setEventListener((evt) => {
    pendingEventStoreBatch.push(evt);
    broadcastEventFrame(evt);
  });

  const eventFlushTimer = setInterval(flushEventsToSqlite, EVENT_FLUSH_BATCH_MS);

  trainer.setUpdateListener((session, packages) => {
    engine.trainingState = session;
    for (const pkg of packages) {
      if (!engine.brainPackages.some((p) => p.packageId === pkg.packageId)) {
        engine.brainPackages.unshift(pkg);
        persistence.saveBrainPackage(pkg);
      }
    }
    if (engine.brainPackages.length > 25) {
      engine.brainPackages.length = 25;
    }
    broadcastTelemetry();
  });

  let tickTimer: NodeJS.Timeout | null = null;
  let checkpointInProgress = false;

  const triggerSafeAsyncCheckpoint = async () => {
    if (checkpointInProgress) return;
    checkpointInProgress = true;
    try {
      await persistence.saveCheckpoint(engine);
      flushEventsToSqlite();
    } catch (err) {
      console.error('[Checkpoint] Async auto-checkpoint failed:', err);
    } finally {
      checkpointInProgress = false;
    }
  };

  const startEngineLoop = () => {
    if (tickTimer) clearInterval(tickTimer);
    const intervalMs = Math.max(180, Math.round(750 / engine.speedMultiplier));
    tickTimer = setInterval(() => {
      if (engine.simStatus === 'Running' || engine.simStatus === 'Recovering') {
        engine.step();
        if (engine.world.tick % AUTO_CHECKPOINT_INTERVAL_TICKS === 0) {
          void triggerSafeAsyncCheckpoint();
        }
        broadcastTelemetry();
      }
    }, intervalMs);
  };

  const heartbeatTimer = setInterval(() => {
    const ping = `event: ping\ndata: ${JSON.stringify({
      serverTime: new Date().toISOString(),
      tick: engine.world.tick,
      lastSequence: engine.eventSequence,
      simulationId: engine.simulationId,
    })}\n\n`;
    for (const res of sseClients) {
      if (!safeSseWrite(res, ping)) {
        sseClients.delete(res);
      }
    }
  }, 4000);

  // ---------------- API Routes ----------------

  app.get('/api/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    sseClients.add(res);
    const initial = getEffectiveSnapshot();
    res.write(`event: telemetry\ndata: ${JSON.stringify(initial)}\n\n`);

    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  app.get('/api/state', (_req, res) => {
    res.json(getEffectiveSnapshot());
  });

  app.get('/api/telemetry/events', (req, res) => {
    const simulationId = String(req.query.simulationId || engine.simulationId);
    const afterSequence = Number(req.query.afterSequence ?? 0);
    const limit = Math.max(1, Math.min(500, Number(req.query.limit ?? 200)));

    flushEventsToSqlite();
    const events = persistence.getTelemetryEventsAfter(
      simulationId,
      Number.isFinite(afterSequence) ? afterSequence : 0,
      limit,
    );
    res.json({
      simulationId,
      afterSequence,
      lastSequence: engine.eventSequence,
      events,
    });
  });

  app.post('/api/telemetry/ingest', (req, res) => {
    const requiredToken = process.env.TELEMETRY_INGEST_TOKEN;
    if (requiredToken && requiredToken.length > 0) {
      const auth = String(req.headers.authorization || '');
      if (auth !== `Bearer ${requiredToken}`) {
        res.status(401).json({ ok: false, error: 'Unauthorized telemetry ingest token' });
        return;
      }
    }

    const body = req.body as {
      simulationId?: string;
      runId?: string;
      workflowStatus?: WorkflowOperationalStatus;
      simStatus?: TelemetrySnapshot['simStatus'];
      snapshot?: TelemetrySnapshot;
      events?: SimulationEvent[];
    };

    if (!body || typeof body !== 'object') {
      res.status(400).json({ ok: false, error: 'Invalid telemetry ingest payload' });
      return;
    }

    if (Array.isArray(body.events) && body.events.length > 0) {
      const normalized = body.events.slice(0, 500).map((e) => ({
        ...e,
        simulationId: e.simulationId ?? body.simulationId ?? engine.simulationId,
        runId: e.runId ?? body.runId ?? engine.runId,
      }));
      persistence.appendTelemetryEvents(normalized);
      for (const evt of normalized) {
        engine.events.unshift(evt);
        broadcastEventFrame(evt);
      }
      if (engine.events.length > 400) engine.events.length = 400;
    }

    remoteOverlay = {
      snapshot: body.snapshot ?? remoteOverlay?.snapshot,
      lastIngestMs: Date.now(),
      workflowStatus: body.workflowStatus ?? body.snapshot?.workflowStatus,
      runId: body.runId ?? body.snapshot?.runId,
    };

    if (body.workflowStatus) {
      engine.workflowStatus = body.workflowStatus;
    }

    broadcastTelemetry();
    res.json({ ok: true, receivedEvents: body.events?.length ?? 0 });
  });

  app.post('/api/sim/control', async (req, res) => {
    const { action, speedMultiplier, steps, recoveryPolicy } = req.body as {
      action:
        | 'start'
        | 'pause'
        | 'step'
        | 'set_speed'
        | 'reset'
        | 'set_recovery_policy'
        | 'trigger_extinction_test'
        | 'manual_recover';
      speedMultiplier?: number;
      steps?: number;
      recoveryPolicy?: RecoveryPolicyMode;
    };

    if (action === 'start') {
      engine.simStatus = 'Running';
      engine.workflowStatus = 'Running';
    } else if (action === 'pause') {
      engine.simStatus = 'Paused';
      engine.workflowStatus = 'Idle';
    } else if (action === 'step') {
      const count = Math.max(1, Math.min(50, steps ?? 1));
      for (let i = 0; i < count; i++) engine.step();
    } else if (action === 'set_speed' && speedMultiplier) {
      engine.speedMultiplier = Math.max(0.5, Math.min(8, speedMultiplier));
      startEngineLoop();
    } else if (action === 'set_recovery_policy' && recoveryPolicy) {
      engine.recoveryPolicy = recoveryPolicy;
    } else if (action === 'trigger_extinction_test') {
      engine.triggerControlledExtinctionForTest();
    } else if (action === 'manual_recover') {
      engine.executeExtinctionRecovery(recoveryPolicy);
    } else if (action === 'reset') {
      engine.reset();
      await persistence.saveCheckpoint(engine);
    }

    flushEventsToSqlite();
    broadcastTelemetry();
    res.json({ ok: true, snapshot: getEffectiveSnapshot() });
  });

  app.get('/api/agents/:id', (req, res) => {
    const agent = engine.getAgentDetail(req.params.id);
    if (!agent) {
      res.status(404).json({ error: 'الفرد غير موجود' });
      return;
    }
    const experiences = engine.collectiveMemory.experiences
      .filter((e) => e.agentId === agent.identity.id)
      .slice(-30)
      .reverse();
    res.json({ agent, experiences });
  });

  app.get('/api/generations/:num', (req, res) => {
    const genNum = Number(req.params.num);
    const detail = engine.getGenerationDetail(genNum);
    if (!detail.summary) {
      res.status(404).json({ error: 'الجيل غير موجود' });
      return;
    }
    res.json(detail);
  });

  app.get('/api/knowledge', (req, res) => {
    const category = String(req.query.category || '');
    const certainty = String(req.query.certainty || '');
    const search = String(req.query.search || '').trim().toLowerCase();

    let items = engine.collectiveMemory.getKnowledgeArray();
    if (category) items = items.filter((k) => k.category === category);
    if (certainty) items = items.filter((k) => k.certaintyStatus === certainty);
    if (search) {
      items = items.filter(
        (k) =>
          k.titleAr.toLowerCase().includes(search) ||
          k.summaryAr.toLowerCase().includes(search) ||
          k.entityKey.toLowerCase().includes(search),
      );
    }
    res.json({ items, symbols: engine.collectiveMemory.getSymbolsArray() });
  });

  app.get('/api/events', (req, res) => {
    const type = String(req.query.type || '');
    const generation = req.query.generation ? Number(req.query.generation) : null;
    const agentId = String(req.query.agentId || '');
    const search = String(req.query.search || '').trim().toLowerCase();

    let list = engine.events;
    if (type) list = list.filter((e) => e.type === type);
    if (generation !== null && !Number.isNaN(generation)) {
      list = list.filter((e) => e.generation === generation);
    }
    if (agentId) list = list.filter((e) => e.agentId === agentId);
    if (search) {
      list = list.filter(
        (e) =>
          e.titleAr.toLowerCase().includes(search) ||
          e.detailAr.toLowerCase().includes(search) ||
          (e.agentName ?? '').toLowerCase().includes(search),
      );
    }
    res.json({ events: list.slice(0, 200) });
  });

  app.post('/api/checkpoints/save', async (_req, res) => {
    try {
      const manifest = await persistence.saveCheckpoint(engine);
      flushEventsToSqlite();
      broadcastTelemetry();
      res.json({ ok: true, manifest });
    } catch (err) {
      res.status(500).json({ ok: false, error: (err as Error).message });
    }
  });

  app.post('/api/checkpoints/restore', async (req, res) => {
    const { checkpointId, knowledgeOnly } = req.body as {
      checkpointId?: string;
      knowledgeOnly?: boolean;
    };
    if (knowledgeOnly && checkpointId) {
      const result = await persistence.restoreKnowledgeDomainOnly(engine, checkpointId);
      broadcastTelemetry();
      res.json(result);
      return;
    }
    const result = await persistence.restoreLatestValidCheckpoint(engine, checkpointId);
    broadcastTelemetry();
    res.json(result);
  });

  app.post('/api/checkpoints/verify', async (req, res) => {
    const { checkpointId } = req.body as { checkpointId: string };
    const cpPath = persistence.getCheckpointPath(checkpointId);
    if (!cpPath) {
      res.status(404).json({ valid: false, reasonAr: 'نقطة الفحص غير موجودة' });
      return;
    }
    const check = await persistence.verifyCheckpoint(cpPath, false);
    res.json({
      valid: check.valid,
      reasonAr: check.valid ? 'نقطة الفحص سليمة ومتطابقة مع التوقيع الرقمي.' : check.reasonAr,
      manifest: check.manifest,
    });
  });

  app.post('/api/training/start', (req, res) => {
    const { episodesTarget, focusMode, cohortSize } = req.body as {
      episodesTarget?: number;
      focusMode?: TrainingSessionState['focusMode'];
      cohortSize?: number;
    };
    const session = trainer.startSession({ episodesTarget, focusMode, cohortSize });
    engine.trainingState = session;
    engine.emitEvent({
      type: 'TrainingResumed',
      generation: engine.currentGeneration,
      titleAr: 'بدء جلسة التدريب المعزول',
      detailAr: `جلسة ${session.sessionId} (${session.episodesTarget} حلقة، فوج ${session.currentCohortSize})`,
      severity: 'info',
    });
    broadcastTelemetry();
    res.json({ ok: true, session });
  });

  app.post('/api/training/stop', (_req, res) => {
    const session = trainer.stopSession();
    engine.trainingState = session;
    engine.emitEvent({
      type: 'TrainingPaused',
      generation: engine.currentGeneration,
      titleAr: 'إيقاف مؤقت للتدريب المعزول',
      detailAr: `توقف التدريب عند الحلقة ${session.episodesCompleted}/${session.episodesTarget}`,
      severity: 'warning',
    });
    broadcastTelemetry();
    res.json({ ok: true, session });
  });

  app.post('/api/training/export', (_req, res) => {
    const pkg = trainer.exportBestBrainPackage();
    if (!pkg) {
      res.status(400).json({ ok: false, reasonAr: 'لا توجد جلسة تدريب نشطة أو مكتملة لتصديرها.' });
      return;
    }
    persistence.saveBrainPackage(pkg);
    if (!engine.brainPackages.some((p) => p.packageId === pkg.packageId)) {
      engine.brainPackages.unshift(pkg);
    }
    broadcastTelemetry();
    res.json({ ok: true, package: pkg });
  });

  app.post('/api/training/promote', (req, res) => {
    const { packageId, rawPackage } = req.body as {
      packageId?: string;
      rawPackage?: BrainPackage;
    };
    const targetPkg =
      rawPackage ??
      engine.brainPackages.find((p) => p.packageId === packageId) ??
      trainer.packages.find((p) => p.packageId === packageId);

    if (!targetPkg) {
      res.status(404).json({
        passed: false,
        packageId: packageId ?? 'unknown',
        checks: [],
        reasonAr: 'حزمة العقل المطلوبة غير موجودة.',
      });
      return;
    }

    const result = verifyAndPromoteBrainPackage(targetPkg, engine);
    flushEventsToSqlite();
    broadcastTelemetry();
    res.json(result);
  });

  app.get('/api/benchmarks', (_req, res) => {
    res.json(engine.getBenchmarks());
  });

  const initialize = async () => {
    const restored = await persistence.restoreLatestValidCheckpoint(engine, undefined, {
      overrideRunId: `srv_${Date.now()}`,
    });
    engine.brainPackages = persistence.loadSavedPackages();
    if (!restored.restored) {
      await persistence.saveCheckpoint(engine);
    }
    persistence.syncEngineStorageStats(engine);
    flushEventsToSqlite();

    if (options?.autoStartEngine !== false) {
      engine.simStatus = 'Running';
      engine.workflowStatus = 'Running';
      startEngineLoop();
    }
  };

  const cleanup = async () => {
    if (tickTimer) clearInterval(tickTimer);
    clearInterval(heartbeatTimer);
    clearInterval(eventFlushTimer);
    trainer.stopSession();
    flushEventsToSqlite();
    try {
      await persistence.saveCheckpoint(engine);
    } catch {
      // ignore shutdown save error
    } finally {
      persistence.close();
    }
  };

  return { app, engine, persistence, trainer, initialize, cleanup, broadcastTelemetry };
}

async function startServer() {
  const { app, initialize, cleanup } = createObservatoryApp();
  await initialize();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[CivilizationEngine] Observatory server running on http://0.0.0.0:${PORT}`);
  });

  const gracefulShutdown = () => {
    void cleanup().finally(() => {
      server.close(() => process.exit(0));
    });
  };

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
}

// Start HTTP server only when executed directly as entrypoint
const isDirectEntry =
  process.argv[1] &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'));

if (isDirectEntry) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

import dotenv from 'dotenv';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import type { BrainPackage, RecoveryPolicyMode, TrainingSessionState } from './src/shared/types.ts';
import {
  IsolatedTrainingManager,
  verifyAndPromoteBrainPackage,
} from './src/server/engine/isolatedTrainer.ts';
import { CivilizationSimulationEngine } from './src/server/engine/simulationEngine.ts';
import { PersistenceManager } from './src/server/persistence/storage.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const AUTO_CHECKPOINT_INTERVAL_TICKS = 40;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  const persistence = new PersistenceManager();
  persistence.acquireLock('express-server');

  const engine = new CivilizationSimulationEngine();
  const trainer = new IsolatedTrainingManager();

  // Restore latest valid checkpoint if available; otherwise save baseline checkpoint
  const restored = persistence.restoreLatestValidCheckpoint(engine);
  engine.brainPackages = persistence.loadSavedPackages();
  if (!restored.restored) {
    persistence.saveCheckpoint(engine);
  }
  persistence.syncEngineStorageStats(engine);

  // Start simulation running smoothly so dashboard reflects live real engine execution
  engine.simStatus = 'running';

  // SSE connected clients
  const sseClients = new Set<express.Response>();

  const broadcastTelemetry = () => {
    if (sseClients.size === 0) return;
    const snapshot = engine.buildTelemetrySnapshot();
    const payload = `event: telemetry\ndata: ${JSON.stringify(snapshot)}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(payload);
      } catch {
        sseClients.delete(res);
      }
    }
  };

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

  // Main real-time simulation loop
  let tickTimer: NodeJS.Timeout | null = null;
  const startEngineLoop = () => {
    if (tickTimer) clearInterval(tickTimer);
    const intervalMs = Math.max(180, Math.round(750 / engine.speedMultiplier));
    tickTimer = setInterval(() => {
      if (engine.simStatus === 'running' || engine.simStatus === 'recovering') {
        engine.step();
        if (engine.world.tick % AUTO_CHECKPOINT_INTERVAL_TICKS === 0) {
          persistence.saveCheckpoint(engine);
        }
        broadcastTelemetry();
      }
    }, intervalMs);
  };
  startEngineLoop();

  // SSE Heartbeat every 4s
  const heartbeatTimer = setInterval(() => {
    const ping = `event: ping\ndata: ${JSON.stringify({ serverTime: new Date().toISOString(), tick: engine.world.tick })}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(ping);
      } catch {
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
    const initial = engine.buildTelemetrySnapshot();
    res.write(`event: telemetry\ndata: ${JSON.stringify(initial)}\n\n`);

    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  app.get('/api/state', (_req, res) => {
    res.json(engine.buildTelemetrySnapshot());
  });

  app.post('/api/sim/control', (req, res) => {
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
      engine.simStatus = 'running';
    } else if (action === 'pause') {
      engine.simStatus = 'paused';
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
      persistence.saveCheckpoint(engine);
    }

    broadcastTelemetry();
    res.json({ ok: true, snapshot: engine.buildTelemetrySnapshot() });
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

  // Checkpoints & Backup endpoints
  app.post('/api/checkpoints/save', (_req, res) => {
    const manifest = persistence.saveCheckpoint(engine);
    broadcastTelemetry();
    res.json({ ok: true, manifest });
  });

  app.post('/api/checkpoints/restore', (req, res) => {
    const { checkpointId, knowledgeOnly } = req.body as {
      checkpointId?: string;
      knowledgeOnly?: boolean;
    };
    if (knowledgeOnly && checkpointId) {
      const result = persistence.restoreKnowledgeDomainOnly(engine, checkpointId);
      broadcastTelemetry();
      res.json(result);
      return;
    }
    const result = persistence.restoreLatestValidCheckpoint(engine, checkpointId);
    broadcastTelemetry();
    res.json(result);
  });

  app.post('/api/checkpoints/verify', (req, res) => {
    const { checkpointId } = req.body as { checkpointId: string };
    const cpPath = persistence.getCheckpointPath(checkpointId);
    if (!cpPath) {
      res.status(404).json({ valid: false, reasonAr: 'نقطة الفحص غير موجودة' });
      return;
    }
    const check = persistence.verifyCheckpointFile(cpPath);
    res.json({
      valid: check.valid,
      reasonAr: check.valid ? 'نقطة الفحص سليمة ومتطابقة مع التوقيع الرقمي.' : check.reasonAr,
      manifest: check.envelope?.manifest,
    });
  });

  // Isolated Training & Brain Package endpoints
  app.post('/api/training/start', (req, res) => {
    const { episodesTarget, focusMode, cohortSize } = req.body as {
      episodesTarget?: number;
      focusMode?: TrainingSessionState['focusMode'];
      cohortSize?: number;
    };
    const session = trainer.startSession({ episodesTarget, focusMode, cohortSize });
    engine.trainingState = session;
    broadcastTelemetry();
    res.json({ ok: true, session });
  });

  app.post('/api/training/stop', (_req, res) => {
    const session = trainer.stopSession();
    engine.trainingState = session;
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
    broadcastTelemetry();
    res.json(result);
  });

  app.get('/api/benchmarks', (_req, res) => {
    res.json(engine.getBenchmarks());
  });

  // Vite dev middleware or static production build
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
    if (tickTimer) clearInterval(tickTimer);
    clearInterval(heartbeatTimer);
    trainer.stopSession();
    try {
      persistence.saveCheckpoint(engine);
    } finally {
      persistence.close();
      server.close(() => process.exit(0));
    }
  };

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

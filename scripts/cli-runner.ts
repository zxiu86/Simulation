import type { SimulationEvent, WorkflowOperationalStatus } from '../src/shared/types.ts';
import { IsolatedTrainingManager } from '../src/server/engine/isolatedTrainer.ts';
import { CivilizationSimulationEngine } from '../src/server/engine/simulationEngine.ts';
import { PersistenceManager } from '../src/server/persistence/storage.ts';

function parseNumberArg(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const match = process.argv.find((a) => a.startsWith(prefix));
  if (!match) return fallback;
  const val = Number(match.slice(prefix.length));
  return Number.isFinite(val) && val >= 0 ? val : fallback;
}

function parseStringArg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const match = process.argv.find((a) => a.startsWith(prefix));
  if (!match) return fallback;
  const val = match.slice(prefix.length).trim();
  return val.length > 0 ? val : fallback;
}

class RemoteTelemetryPusher {
  private endpointUrl = process.env.TELEMETRY_ENDPOINT_URL?.trim() || '';
  private token = process.env.TELEMETRY_INGEST_TOKEN?.trim() || '';
  private eventQueue: SimulationEvent[] = [];

  public isEnabled(): boolean {
    return this.endpointUrl.length > 0 && this.endpointUrl.startsWith('http');
  }

  public enqueue(evt: SimulationEvent): void {
    if (!this.isEnabled()) return;
    this.eventQueue.push(evt);
    if (this.eventQueue.length > 400) {
      this.eventQueue.splice(0, this.eventQueue.length - 400);
    }
  }

  public async push(
    engine: CivilizationSimulationEngine,
    workflowStatus: WorkflowOperationalStatus,
    includeSnapshot = true,
  ): Promise<void> {
    if (!this.isEnabled()) return;
    const events = this.eventQueue.splice(0, 200);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    try {
      await fetch(this.endpointUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          simulationId: engine.simulationId,
          runId: engine.runId,
          workflowStatus,
          simStatus: engine.simStatus,
          snapshot: includeSnapshot ? engine.buildTelemetrySnapshot() : undefined,
          events,
        }),
        signal: AbortSignal.timeout(4000),
      });
    } catch {
      // Remote endpoint unreachable; do not fail local simulation/checkpoints
    }
  }
}

async function runBatch() {
  const durationMinutes = parseNumberArg('duration-minutes', 0);
  const checkpointIntervalMinutes = parseNumberArg('checkpoint-interval-minutes', 3);
  const ticksArg = parseNumberArg('ticks', durationMinutes > 0 ? 0 : 120);
  const trainEpisodes = parseNumberArg('train-episodes', 8);
  const simulationId = parseStringArg(
    'simulation-id',
    process.env.SIMULATION_ID || 'civ-main-timeline',
  );
  const runId = process.env.GITHUB_RUN_ID
    ? `gha_${process.env.GITHUB_RUN_ID}_${process.env.GITHUB_RUN_ATTEMPT || '1'}`
    : `cli_${Date.now()}`;

  const durationMs = durationMinutes > 0 ? Math.round(durationMinutes * 60_000) : 0;
  const checkpointIntervalMs =
    checkpointIntervalMinutes > 0 ? Math.round(checkpointIntervalMinutes * 60_000) : 180_000;

  const persistence = new PersistenceManager();
  if (!persistence.acquireLock('github-actions-cli-runner')) {
    console.error('[CLI-Runner] Another simulation process holds sim.lock. Exiting safely.');
    process.exit(1);
  }

  const engine = new CivilizationSimulationEngine({
    simulationId,
    runId,
    workflowName: process.env.GITHUB_WORKFLOW || 'GitHub Actions Continuous Training',
  });
  const pusher = new RemoteTelemetryPusher();
  const pendingSqliteEvents: SimulationEvent[] = [];

  engine.setEventListener((evt) => {
    pendingSqliteEvents.push(evt);
    pusher.enqueue(evt);
  });

  let interrupted = false;

  const handleInterrupt = (sig: string) => {
    console.log(`[CLI-Runner] Received ${sig}; saving resumable checkpoint before exit...`);
    interrupted = true;
    engine.workflowStatus = 'Interrupted';
    engine.simStatus = 'Interrupted';
  };
  process.on('SIGTERM', () => handleInterrupt('SIGTERM'));
  process.on('SIGINT', () => handleInterrupt('SIGINT'));

  const flushEvents = () => {
    if (pendingSqliteEvents.length === 0) return;
    const batch = pendingSqliteEvents.splice(0, pendingSqliteEvents.length);
    persistence.appendTelemetryEvents(batch);
  };

  try {
    engine.workflowStatus = 'Initializing';
    engine.simStatus = 'Initializing';
    await pusher.push(engine, 'Initializing', true);

    const restoreResult = await persistence.restoreLatestValidCheckpoint(engine, undefined, {
      overrideRunId: runId,
    });
    console.log(`[CLI-Runner] Restore check: ${restoreResult.reasonAr}`);

    engine.workflowStatus = 'Running';
    engine.simStatus = 'Running';
    await pusher.push(engine, 'Running', true);

    const startTick = engine.world.tick;
    const t0 = performance.now();
    const startWallMs = Date.now();
    const deadlineMs = durationMs > 0 ? startWallMs + durationMs : Number.POSITIVE_INFINITY;
    let lastCheckpointWallMs = startWallMs;
    let lastRemotePushWallMs = startWallMs;
    let ticksExecuted = 0;

    console.log(
      `[CLI-Runner] Starting run | simulationId=${engine.simulationId} | runId=${engine.runId} | ` +
        `durationMinutes=${durationMinutes || 'unlimited(by ticks)'} | ` +
        `checkpointIntervalMinutes=${checkpointIntervalMinutes} | maxTicks=${ticksArg || 'unlimited(by time)'}`,
    );

    while (!interrupted) {
      if (ticksArg > 0 && ticksExecuted >= ticksArg) {
        console.log(`[CLI-Runner] Reached target ticks (${ticksArg}).`);
        break;
      }
      if (Date.now() >= deadlineMs) {
        console.log(
          `[CLI-Runner] Reached configured simulation duration (${durationMinutes} min). Stopping gracefully to save final state.`,
        );
        break;
      }

      engine.step();
      ticksExecuted += 1;

      const nowMs = Date.now();
      if (nowMs - lastCheckpointWallMs >= checkpointIntervalMs) {
        const cp = await persistence.saveCheckpoint(engine);
        flushEvents();
        lastCheckpointWallMs = nowMs;
        const elapsedMin = ((nowMs - startWallMs) / 60_000).toFixed(2);
        console.log(
          `[CLI-Runner] Scheduled backup checkpoint ${cp.checkpointId} at +${elapsedMin}m ` +
            `(${cp.compressedBytes} bytes, tick=${cp.tick}, gen=${cp.generationNumber}, alive=${cp.aliveCount}, root=${cp.rootChecksum.slice(0, 12)})`,
        );
        await pusher.push(engine, 'Running', true);
        lastRemotePushWallMs = nowMs;
      } else if (nowMs - lastRemotePushWallMs >= 2000) {
        flushEvents();
        await pusher.push(engine, 'Running', true);
        lastRemotePushWallMs = nowMs;
      }

      if (ticksExecuted % 8 === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }

    if (!interrupted && trainEpisodes > 0) {
      const trainer = new IsolatedTrainingManager();
      const { session, exportedPackage } = trainer.runSynchronousEpisodes(
        trainEpisodes,
        'balanced',
        14,
      );
      engine.trainingState = session;
      if (exportedPackage) {
        persistence.saveBrainPackage(exportedPackage);
        console.log(
          `[CLI-Runner] Exported BrainPackage ${exportedPackage.packageId} ` +
            `(evalPassed=${exportedPackage.trainingMetadata.evaluationPassed}, hash=${exportedPackage.integrityHash.slice(0, 12)}...)`,
        );
      }
      engine.emitEvent({
        type: 'TrainingCompleted',
        generation: engine.currentGeneration,
        titleAr: 'اكتمال جلسة التدريب المعزول الدفعية',
        detailAr: `تم إنجاز ${session.episodesCompleted} حلقة بمعدل مكافأة ${session.avgReward}`,
        severity: session.evaluationPassed ? 'positive' : 'warning',
      });
    }

    engine.workflowStatus = interrupted ? 'Interrupted' : 'Completed';
    engine.simStatus = interrupted ? 'Interrupted' : 'Completed';
    const finalCp = await persistence.saveCheckpoint(engine);
    flushEvents();
    await pusher.push(engine, engine.workflowStatus, true);

    const durationSec = ((performance.now() - t0) / 1000).toFixed(2);
    const bench = engine.getBenchmarks();

    console.log(
      `[CLI-Runner] Completed ticks ${startTick} -> ${engine.world.tick} (+${ticksExecuted}) in ${durationSec}s | ` +
        `Alive=${engine.agents.filter((a) => a.alive).length} | Gen=${engine.currentGeneration} | ` +
        `Experiences=${engine.collectiveMemory.totalExperiencesRecorded} | Knowledge=${engine.collectiveMemory.knowledgeMap.size} | ` +
        `Decisions/s=${bench.decisionsPerSecond} | RAM=${bench.rssMb}MB | FinalCheckpoint=${finalCp.checkpointId} (${finalCp.compressedBytes}B)`,
    );
  } catch (err) {
    engine.workflowStatus = 'Failed';
    engine.simStatus = 'Failed';
    flushEvents();
    await pusher.push(engine, 'Failed', true);
    throw err;
  } finally {
    persistence.close();
  }
}

runBatch().catch((err) => {
  console.error('[CLI-Runner] Fatal error:', err);
  process.exit(1);
});

import { IsolatedTrainingManager } from '../src/server/engine/isolatedTrainer.ts';
import { CivilizationSimulationEngine } from '../src/server/engine/simulationEngine.ts';
import { PersistenceManager } from '../src/server/persistence/storage.ts';

function parseArg(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const match = process.argv.find((a) => a.startsWith(prefix));
  if (!match) return fallback;
  const val = Number(match.slice(prefix.length));
  return Number.isFinite(val) && val >= 0 ? val : fallback;
}

async function runBatch() {
  const durationMinutes = parseArg('duration-minutes', 0);
  const checkpointIntervalMinutes = parseArg('checkpoint-interval-minutes', 3);
  const ticksArg = parseArg('ticks', durationMinutes > 0 ? 0 : 120);
  const trainEpisodes = parseArg('train-episodes', 8);

  const durationMs = durationMinutes > 0 ? Math.round(durationMinutes * 60_000) : 0;
  const checkpointIntervalMs =
    checkpointIntervalMinutes > 0 ? Math.round(checkpointIntervalMinutes * 60_000) : 180_000;

  const persistence = new PersistenceManager();
  if (!persistence.acquireLock('github-actions-cli-runner')) {
    console.error('[CLI-Runner] Another simulation process holds sim.lock. Exiting safely.');
    process.exit(1);
  }

  const engine = new CivilizationSimulationEngine();
  let interrupted = false;

  const handleInterrupt = (sig: string) => {
    console.log(`[CLI-Runner] Received ${sig}; saving resumable checkpoint before exit...`);
    interrupted = true;
  };
  process.on('SIGTERM', () => handleInterrupt('SIGTERM'));
  process.on('SIGINT', () => handleInterrupt('SIGINT'));

  try {
    const restoreResult = persistence.restoreLatestValidCheckpoint(engine);
    console.log(`[CLI-Runner] Restore check: ${restoreResult.reasonAr}`);
    engine.simStatus = 'running';

    const startTick = engine.world.tick;
    const t0 = performance.now();
    const startWallMs = Date.now();
    const deadlineMs = durationMs > 0 ? startWallMs + durationMs : Number.POSITIVE_INFINITY;
    let lastCheckpointWallMs = startWallMs;
    let ticksExecuted = 0;

    console.log(
      `[CLI-Runner] Starting run | durationMinutes=${durationMinutes || 'unlimited(by ticks)'} | ` +
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
        const cp = persistence.saveCheckpoint(engine);
        lastCheckpointWallMs = nowMs;
        const elapsedMin = ((nowMs - startWallMs) / 60_000).toFixed(2);
        console.log(
          `[CLI-Runner] Scheduled backup checkpoint ${cp.checkpointId} at +${elapsedMin}m ` +
            `(${cp.compressedBytes} bytes, tick=${cp.tick}, gen=${cp.generationNumber}, alive=${cp.aliveCount})`,
        );
      }

      // Yield briefly every 8 ticks so OS signals and accurate timers fire smoothly
      if (ticksExecuted % 8 === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }

    // Run isolated training batch and save unified BrainPackage
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
    }

    const finalCp = persistence.saveCheckpoint(engine);
    const durationSec = ((performance.now() - t0) / 1000).toFixed(2);
    const bench = engine.getBenchmarks();

    console.log(
      `[CLI-Runner] Completed ticks ${startTick} -> ${engine.world.tick} (+${ticksExecuted}) in ${durationSec}s | ` +
        `Alive=${engine.agents.filter((a) => a.alive).length} | Gen=${engine.currentGeneration} | ` +
        `Experiences=${engine.collectiveMemory.totalExperiencesRecorded} | Knowledge=${engine.collectiveMemory.knowledgeMap.size} | ` +
        `Decisions/s=${bench.decisionsPerSecond} | RAM=${bench.rssMb}MB | FinalCheckpoint=${finalCp.checkpointId} (${finalCp.compressedBytes}B)`,
    );
  } finally {
    persistence.close();
  }
}

runBatch().catch((err) => {
  console.error('[CLI-Runner] Fatal error:', err);
  process.exit(1);
});

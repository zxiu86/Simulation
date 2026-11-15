import { IsolatedTrainingManager } from '../src/server/engine/isolatedTrainer.ts';
import { CivilizationSimulationEngine } from '../src/server/engine/simulationEngine.ts';
import { PersistenceManager } from '../src/server/persistence/storage.ts';

function parseArg(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const match = process.argv.find((a) => a.startsWith(prefix));
  if (!match) return fallback;
  const val = Number(match.slice(prefix.length));
  return Number.isFinite(val) && val > 0 ? val : fallback;
}

async function runBatch() {
  const ticksTarget = parseArg('ticks', 120);
  const trainEpisodes = parseArg('train-episodes', 8);

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

    for (let i = 0; i < ticksTarget; i++) {
      if (interrupted) break;
      engine.step();
      if ((i + 1) % 40 === 0) {
        const cp = persistence.saveCheckpoint(engine);
        console.log(
          `[CLI-Runner] Periodic checkpoint ${cp.checkpointId} saved (${cp.compressedBytes} bytes, tick=${cp.tick}, alive=${cp.aliveCount})`,
        );
      }
    }

    // Run isolated training batch and save unified BrainPackage
    if (!interrupted && trainEpisodes > 0) {
      const trainer = new IsolatedTrainingManager();
      const { session, exportedPackage } = trainer.runSynchronousEpisodes(trainEpisodes, 'balanced', 14);
      engine.trainingState = session;
      if (exportedPackage) {
        persistence.saveBrainPackage(exportedPackage);
        console.log(
          `[CLI-Runner] Exported BrainPackage ${exportedPackage.packageId} (evalPassed=${exportedPackage.trainingMetadata.evaluationPassed}, hash=${exportedPackage.integrityHash.slice(0, 12)}...)`,
        );
      }
    }

    const finalCp = persistence.saveCheckpoint(engine);
    const durationSec = ((performance.now() - t0) / 1000).toFixed(2);
    const bench = engine.getBenchmarks();

    console.log(
      `[CLI-Runner] Completed ticks ${startTick} -> ${engine.world.tick} in ${durationSec}s | ` +
        `Alive=${engine.agents.filter((a) => a.alive).length} | Gen=${engine.currentGeneration} | ` +
        `Experiences=${engine.collectiveMemory.totalExperiencesRecorded} | Knowledge=${engine.collectiveMemory.knowledgeMap.size} | ` +
        `Decisions/s=${bench.decisionsPerSecond} | RAM=${bench.rssMb}MB | Checkpoint=${finalCp.compressedBytes}B`,
    );
  } finally {
    persistence.close();
  }
}

runBatch().catch((err) => {
  console.error('[CLI-Runner] Fatal error:', err);
  process.exit(1);
});

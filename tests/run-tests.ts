import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  IsolatedTrainingManager,
  verifyAndPromoteBrainPackage,
} from '../src/server/engine/isolatedTrainer.ts';
import { CivilizationSimulationEngine } from '../src/server/engine/simulationEngine.ts';
import { PersistenceManager } from '../src/server/persistence/storage.ts';

async function main() {
  const tStart = performance.now();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'civ-test-'));

  try {
    console.log('1. Testing initial world & 100 independent agents...');
    const engine = new CivilizationSimulationEngine('test_run');
    assert.equal(engine.agents.length, 100, 'Must start with 100 individuals');
    assert.equal(engine.world.areaKm2, 5.0, 'World area must be 5 km^2');
    assert.equal(engine.collectiveMemory.knowledgeMap.size, 0, 'Must start with zero pre-made knowledge');
    assert.equal(engine.collectiveMemory.symbolsMap.size, 0, 'Must start with zero pre-made language');
    // Verify brains are NOT clones
    const w0 = engine.agents[0].brain.w1[0];
    const w1 = engine.agents[1].brain.w1[0];
    assert.notEqual(w0, w1, 'Agents must possess independent neural weights');

    console.log('2. Running 80 simulation ticks with 100 agents...');
    engine.simStatus = 'running';
    for (let i = 0; i < 80; i++) {
      engine.step();
    }
    const snap = engine.buildTelemetrySnapshot();
    assert.ok(snap.mindsAndLearning.totalDecisions > 1000, 'Must execute thousands of concurrent decisions');
    assert.ok(snap.mindsAndLearning.totalExperiencesRecorded > 50, 'Must record collective experiences');
    assert.ok(snap.knowledgeItems.length > 0, 'Must discover initial knowledge through experience');
    assert.ok(snap.mindsAndLearning.totalExperiencesReplayed > 0, 'Must perform Experience Replay updates');
    assert.ok(snap.mindsAndLearning.avgRetentionScore > 0.5, 'Anti-forgetting retention must stay healthy');
    assert.ok(snap.societyAndLanguage.totalRelationships > 0, 'Social relationships must form naturally');

    console.log('3. Testing Extinction & Recovery Protocol (Timeline Preservation)...');
    const preExtTimelineLen = engine.timeline.length;
    const preExtKnowledgeLen = engine.collectiveMemory.knowledgeMap.size;
    engine.triggerControlledExtinctionForTest();
    assert.equal(
      engine.agents.filter((a) => a.alive).length,
      0,
      'Controlled extinction test sets alive population to 0',
    );
    assert.equal(engine.extinctionRecords.length, 1, 'Extinction event must be recorded');

    // Step 2 ticks to trigger automatic recovery
    engine.step();
    engine.step();
    const postRecoveryAlive = engine.agents.filter((a) => a.alive).length;
    assert.ok(postRecoveryAlive > 0, 'Simulation must recover automatically after extinction');
    assert.equal(engine.recoveryEvents.length, 1, 'Recovery event must be logged');
    assert.ok(engine.timeline.length > preExtTimelineLen, 'Original timeline must remain preserved and extended');
    assert.equal(
      engine.collectiveMemory.knowledgeMap.size >= preExtKnowledgeLen,
      true,
      'Collective knowledge must survive total extinction',
    );

    console.log('4. Testing Revive-Preserved-Individuals Recovery Policy...');
    engine.triggerControlledExtinctionForTest();
    const revEvt = engine.executeExtinctionRecovery('revive_preserved_individuals');
    assert.ok(revEvt && revEvt.success && revEvt.restoredAgentsCount > 0, 'Revival recovery must restore preserved individuals');
    assert.ok(engine.restoredBrainsCount > 0, 'Restored brains count must increment');

    console.log('5. Testing Persistence, Checkpoints & Corrupt Checkpoint Rollback...');
    const pm = new PersistenceManager(tmpDir);
    const cpA = pm.saveCheckpoint(engine);
    engine.step();
    engine.step();
    const cpB = pm.saveCheckpoint(engine);

    // Corrupt cpB file on disk
    const cpBPath = pm.getCheckpointPath(cpB.checkpointId)!;
    fs.writeFileSync(cpBPath, Buffer.from('corrupted-gzip-payload'));

    const freshEngine = new CivilizationSimulationEngine('fresh');
    const restoreRes = pm.restoreLatestValidCheckpoint(freshEngine);
    assert.equal(restoreRes.restored, true, 'Must restore valid fallback checkpoint');
    assert.equal(restoreRes.rolledBackFromCorrupt, cpB.checkpointId, 'Must detect corrupt newest checkpoint');
    assert.equal(restoreRes.manifest?.checkpointId, cpA.checkpointId, 'Must roll back to valid cpA');
    assert.equal(
      freshEngine.collectiveMemory.knowledgeMap.size,
      engine.collectiveMemory.knowledgeMap.size,
      'Restored knowledge must match checkpoint A',
    );
    pm.close();

    console.log('6. Testing Isolated Training & BrainPackage Promotion Security Checks...');
    const trainer = new IsolatedTrainingManager();
    const { exportedPackage } = trainer.runSynchronousEpisodes(8, 'balanced', 12);
    assert.ok(exportedPackage !== null, 'Isolated trainer must export a unified BrainPackage');

    // Force evaluationPassed true if stochastic run was borderline to test valid promotion path,
    // AND separately test tampered package rejection!
    if (exportedPackage) {
      const tampered = JSON.parse(JSON.stringify(exportedPackage)) as typeof exportedPackage;
      tampered.weights.w1[0] += 0.99; // tampers weights without updating integrityHash
      const rejectRes = verifyAndPromoteBrainPackage(tampered, engine);
      assert.equal(rejectRes.passed, false, 'Tampered BrainPackage must be rejected');

      exportedPackage.trainingMetadata.evaluationPassed = true;
      const beforePop = engine.agents.length;
      const acceptRes = verifyAndPromoteBrainPackage(exportedPackage, engine);
      assert.equal(acceptRes.passed, true, 'Valid BrainPackage must pass verification');
      assert.equal(engine.agents.length, beforePop + 1, 'Promoted individual must enter main civilization');
    }

    const totalSec = ((performance.now() - tStart) / 1000).toFixed(2);
    console.log(`ALL TESTS PASSED in ${totalSec}s (Decisions/s: ${engine.getBenchmarks().decisionsPerSecond})`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('TEST FAILURE:', err);
  process.exit(1);
});

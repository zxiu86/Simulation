import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createObservatoryApp } from '../server.ts';
import { CivilizationSimulationEngine } from '../src/server/engine/simulationEngine.ts';
import {
  CanonicalSerializationError,
  computeCanonicalSha256,
  streamCanonicalJson,
} from '../src/server/persistence/canonicalSerializer.ts';
import { PersistenceManager } from '../src/server/persistence/storage.ts';
import type { SimulationEvent, TelemetrySnapshot } from '../src/shared/types.ts';

function buildStructuredPayload(targetApproxBytes: number): {
  meta: { testSizeTarget: number; label: string };
  records: Array<{ id: number; zKey: string; aKey: string; weights: number[] }>;
} {
  // Each record serializes to ~520 bytes canonically
  const weightsTemplate = Array.from({ length: 48 }, (_, i) => Number(((i + 1) * 0.123456).toFixed(6)));
  const count = Math.max(10, Math.ceil(targetApproxBytes / 540));
  const records = new Array<{ id: number; zKey: string; aKey: string; weights: number[] }>(count);
  for (let i = 0; i < count; i++) {
    records[i] = {
      id: i,
      zKey: `sector_${i % 100}`,
      aKey: 'حالة_تجربة_محاكاة',
      weights: weightsTemplate,
    };
  }
  return {
    meta: { testSizeTarget: targetApproxBytes, label: 'canonical-stress' },
    records,
  };
}

function mb(bytes: number): number {
  return Number((bytes / (1024 * 1024)).toFixed(2));
}

async function runAllTests() {
  const report: Record<string, unknown> = {};
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'civ-repair-tests-'));

  try {
    console.log('=== [Test 1 & 2] Streaming Canonical SHA-256 (1MB, 10MB, 100MB+) & Memory Benchmarks ===');

    // Reference equivalence & key-order invariance
    const objOrderA = { b: 2, a: 1, nested: { z: 'مرحبا', x: [3, 1, 2], n: -0 } };
    const objOrderB = { nested: { x: [3, 1, 2], n: 0, z: 'مرحبا' }, a: 1, b: 2 };
    const refStr = '{"a":1,"b":2,"nested":{"n":0,"x":[3,1,2],"z":"مرحبا"}}';
    const refHash = crypto.createHash('sha256').update(refStr, 'utf8').digest('hex');
    const hashA = computeCanonicalSha256(objOrderA);
    const hashB = computeCanonicalSha256(objOrderB);
    assert.equal(hashA.sha256, refHash, 'Canonical hash must match reference canonical string');
    assert.equal(hashB.sha256, refHash, 'Canonical hash must be independent of object key order');

    // Circular reference & NaN rejection
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    assert.throws(() => computeCanonicalSha256(circular), CanonicalSerializationError);
    assert.throws(() => computeCanonicalSha256({ bad: Number.NaN }), CanonicalSerializationError);

    const sizeBenchmarks: Array<Record<string, unknown>> = [];
    for (const targetMb of [1, 10, 108]) {
      const payload = buildStructuredPayload(targetMb * 1024 * 1024);
      const memBefore = process.memoryUsage();
      const tStart = performance.now();
      let peakHeap = memBefore.heapUsed;
      let peakRss = memBefore.rss;
      let chunkCount = 0;
      let maxChunkBytes = 0;

      const hash = crypto.createHash('sha256');
      let streamedBytes = 0;
      streamCanonicalJson(payload, (chunk) => {
        chunkCount += 1;
        if (chunk.length > maxChunkBytes) maxChunkBytes = chunk.length;
        streamedBytes += chunk.length;
        hash.update(chunk);
        if (chunkCount % 64 === 0) {
          const m = process.memoryUsage();
          if (m.heapUsed > peakHeap) peakHeap = m.heapUsed;
          if (m.rss > peakRss) peakRss = m.rss;
        }
      });
      const digest = hash.digest('hex');
      const durationMs = Number((performance.now() - tStart).toFixed(2));
      const memAfter = process.memoryUsage();

      // Verify single-record mutation alters hash
      const firstIdBefore = payload.records[0].id;
      payload.records[0].id = 99999999;
      const mutatedDigest = computeCanonicalSha256(payload).sha256;
      payload.records[0].id = firstIdBefore;
      assert.notEqual(mutatedDigest, digest, `Corruption check failed for ${targetMb}MB payload`);

      // Verify reference string equivalence on 1MB and 10MB (safe size for string reference check)
      if (targetMb <= 10) {
        const chunksCollected: Buffer[] = [];
        streamCanonicalJson(payload, (c) => chunksCollected.push(c));
        const refBuf = Buffer.concat(chunksCollected);
        const directSha = crypto.createHash('sha256').update(refBuf).digest('hex');
        assert.equal(digest, directSha, `Reference SHA equivalence failed for ${targetMb}MB`);
      }

      const row = {
        targetMb,
        actualStreamedMb: mb(streamedBytes),
        chunkCount,
        maxChunkKb: Number((maxChunkBytes / 1024).toFixed(2)),
        durationMs,
        rssDeltaMb: Number((mb(memAfter.rss) - mb(memBefore.rss)).toFixed(2)),
        peakHeapMb: mb(peakHeap),
        peakRssMb: mb(peakRss),
        sha256Prefix: digest.slice(0, 16),
      };
      sizeBenchmarks.push(row);
      console.log('  Benchmark:', row);
      assert(streamedBytes >= targetMb * 1024 * 1024 * 0.9, `Expected >= ${targetMb}MB streamed`);
      assert(maxChunkBytes <= 70 * 1024, 'Chunk buffer must stay bounded near 64KB');
    }
    report.test1_2_streamingShaAndMemory = sizeBenchmarks;

    console.log('=== [Test 3] Chunked Checkpoint Full Roundtrip & State Equality ===');
    const cpDir3 = path.join(tmpRoot, 't3');
    const pm3 = new PersistenceManager(cpDir3);
    const eng3 = new CivilizationSimulationEngine({ simulationId: 'sim-test-3', seed: 424242 });
    eng3.simStatus = 'Running';
    for (let i = 0; i < 20; i++) eng3.step();
    const cp3 = await pm3.saveCheckpoint(eng3);
    assert.equal(cp3.format, 'chunked-v2');
    assert.equal(cp3.complete, true);
    assert.equal(cp3.domainCount, 10);
    assert(cp3.chunkCount >= 14, 'Expected multi-chunk layout across 10 domains');

    const verify3 = await pm3.verifyCheckpoint(pm3.getCheckpointPath(cp3.checkpointId)!, false);
    assert.equal(verify3.valid, true, verify3.reasonAr);

    const eng3Restored = new CivilizationSimulationEngine({ simulationId: 'sim-test-3', seed: 99 });
    const res3 = await pm3.restoreLatestValidCheckpoint(eng3Restored, cp3.checkpointId);
    assert.equal(res3.restored, true, res3.reasonAr);
    assert.equal(eng3Restored.world.tick, eng3.world.tick);
    assert.equal(eng3Restored.agents.length, eng3.agents.length);
    assert.equal(eng3Restored.prng.getState(), eng3.prng.getState());
    assert.equal(eng3Restored.eventSequence, eng3.eventSequence);
    assert.equal(
      eng3Restored.agents[0].brain.optimizerStep,
      eng3.agents[0].brain.optimizerStep,
    );
    assert.deepEqual(eng3Restored.agents[0].brain.w1, eng3.agents[0].brain.w1);
    assert.deepEqual(eng3Restored.agents[0].brain.momentumW1, eng3.agents[0].brain.momentumW1);
    assert.equal(
      eng3Restored.collectiveMemory.experiences.length,
      eng3.collectiveMemory.experiences.length,
    );
    pm3.close();
    report.test3_chunkedRoundtrip = {
      checkpointId: cp3.checkpointId,
      tick: cp3.tick,
      domainCount: cp3.domainCount,
      chunkCount: cp3.chunkCount,
      compressedBytes: cp3.compressedBytes,
      rootChecksum: cp3.rootChecksum,
    };

    console.log('=== [Test 4] Interrupted Checkpoint Write & Corrupt Rollback Protection ===');
    const cpDir4 = path.join(tmpRoot, 't4');
    const pm4 = new PersistenceManager(cpDir4);
    const eng4 = new CivilizationSimulationEngine({ simulationId: 'sim-test-4', seed: 777 });
    for (let i = 0; i < 10; i++) eng4.step();
    const validCp1 = await pm4.saveCheckpoint(eng4);

    for (let i = 0; i < 10; i++) eng4.step();
    await assert.rejects(
      () => pm4.saveCheckpoint(eng4, { simulateInterruptAfterChunks: 3 }),
      /Simulated interruption/,
    );
    assert.equal(eng4.persistenceState, 'Error');

    const cpFiles = fs.readdirSync(path.join(cpDir4, 'checkpoints'));
    assert(
      !cpFiles.some((f) => f.startsWith('.tmp_')),
      'No .tmp_ staging dirs should survive failed save',
    );
    const latestPointer = JSON.parse(
      fs.readFileSync(path.join(cpDir4, 'checkpoints', 'latest.json'), 'utf8'),
    ) as { checkpointId: string };
    assert.equal(latestPointer.checkpointId, validCp1.checkpointId, 'latest.json must remain untouched');

    // Now save a second valid checkpoint cp2, then corrupt one of cp2's chunks and verify rollback to cp1!
    const validCp2 = await pm4.saveCheckpoint(eng4);
    const cp2Dir = pm4.getCheckpointPath(validCp2.checkpointId)!;
    const targetChunk = path.join(cp2Dir, 'neural.chunk_000.bin.gz');
    const rawBuf = fs.readFileSync(targetChunk);
    rawBuf[rawBuf.length - 5] ^= 0xff; // Flip byte in gzip payload
    fs.writeFileSync(targetChunk, rawBuf);

    const eng4Rec = new CivilizationSimulationEngine({ simulationId: 'sim-test-4', seed: 1 });
    const rec4 = await pm4.restoreLatestValidCheckpoint(eng4Rec);
    assert.equal(rec4.restored, true);
    assert.equal(rec4.rolledBackFromCorrupt, validCp2.checkpointId);
    assert.equal(rec4.manifest?.checkpointId, validCp1.checkpointId);
    assert.equal(eng4Rec.world.tick, validCp1.tick);
    pm4.close();
    report.test4_interruptionAndRollback = {
      validBaselineCp: validCp1.checkpointId,
      corruptCpRolledBack: rec4.rolledBackFromCorrupt,
      restoredCp: rec4.manifest?.checkpointId,
      restoredTick: eng4Rec.world.tick,
    };

    console.log('=== [Test 5] Exact Simulation & Training Resume Across Separate Engine Instances ===');
    const cpDir5 = path.join(tmpRoot, 't5');
    const pm5 = new PersistenceManager(cpDir5);
    const eng5A = new CivilizationSimulationEngine({ simulationId: 'sim-test-5', seed: 555111 });
    for (let i = 0; i < 15; i++) eng5A.step();
    const cp5 = await pm5.saveCheckpoint(eng5A);

    // Continue Engine A for 15 more ticks
    for (let i = 0; i < 15; i++) eng5A.step();

    // Restore cp5 into brand-new Engine B and step 15 ticks
    const eng5B = new CivilizationSimulationEngine({ simulationId: 'sim-test-5', seed: 999999 });
    const res5 = await pm5.restoreLatestValidCheckpoint(eng5B, cp5.checkpointId);
    assert.equal(res5.restored, true);
    for (let i = 0; i < 15; i++) eng5B.step();

    assert.equal(eng5B.world.tick, eng5A.world.tick);
    assert.equal(eng5B.prng.getState(), eng5A.prng.getState());
    assert.equal(eng5B.eventSequence, eng5A.eventSequence);
    assert.equal(eng5B.agents.length, eng5A.agents.length);
    assert.equal(eng5B.agents[5].brain.optimizerStep, eng5A.agents[5].brain.optimizerStep);
    assert.equal(eng5B.agents[5].brain.currentLearningRate, eng5A.agents[5].brain.currentLearningRate);
    assert.deepEqual(eng5B.agents[5].brain.w1, eng5A.agents[5].brain.w1);
    assert.deepEqual(eng5B.agents[5].brain.momentumWPolicy, eng5A.agents[5].brain.momentumWPolicy);
    assert.equal(
      eng5B.collectiveMemory.experiences.length,
      eng5A.collectiveMemory.experiences.length,
    );
    pm5.close();
    report.test5_exactResume = {
      checkpointTick: cp5.tick,
      resumedToTick: eng5B.world.tick,
      prngStateMatched: eng5B.prng.getState() === eng5A.prng.getState(),
      sequenceMatched: eng5B.eventSequence === eng5A.eventSequence,
      weightsAndOptimizerExactMatch: true,
    };

    console.log('=== [Test 6] Live SSE Streaming, Disconnect/Reconnect Replay & Remote Ingest Sync ===');
    const cpDir6 = path.join(tmpRoot, 't6');
    const obs = createObservatoryApp({ dataDir: cpDir6, autoStartEngine: false });
    await obs.initialize();
    const server = obs.app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', () => resolve());
      server.once('error', (err) => reject(err));
    });
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 3099;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // Connect SSE client and step engine
      const sseAbort = new AbortController();
      const sseRes = await fetch(`${baseUrl}/api/stream`, { signal: sseAbort.signal });
      assert.equal(sseRes.status, 200);
      const reader = sseRes.body!.getReader();
      const decoder = new TextDecoder();

      // Advance 6 ticks while connected
      for (let i = 0; i < 6; i++) obs.engine.step();
      obs.broadcastTelemetry();

      let sseBuffer = '';
      const receivedSeqs: number[] = [];
      const readUntil = Date.now() + 1200;
      while (Date.now() < readUntil) {
        const { value, done } = await Promise.race([
          reader.read(),
          new Promise<{ value?: Uint8Array; done: boolean }>((r) =>
            setTimeout(() => r({ done: true }), 250),
          ),
        ]);
        if (value) sseBuffer += decoder.decode(value, { stream: true });
        if (done && sseBuffer.includes('event: sim_event')) break;
      }
      for (const line of sseBuffer.split('\n')) {
        if (line.startsWith('data: {')) {
          const parsed = JSON.parse(line.slice(6)) as { sequence?: number };
          if (typeof parsed.sequence === 'number') receivedSeqs.push(parsed.sequence);
        }
      }
      sseAbort.abort();
      assert(receivedSeqs.length > 0, 'Expected live SSE sim_event frames');

      const seqBeforeDisconnect = Math.max(...receivedSeqs);

      // Step 8 more ticks while client is "disconnected"
      for (let i = 0; i < 8; i++) obs.engine.step();
      // Wait briefly for event flush timer (250ms) or call replay endpoint (which flushes SQLite!)
      const replayRes = await fetch(
        `${baseUrl}/api/telemetry/events?afterSequence=${seqBeforeDisconnect}&simulationId=${encodeURIComponent(obs.engine.simulationId)}&limit=100`,
      );
      const replayJson = (await replayRes.json()) as {
        events: SimulationEvent[];
        lastSequence: number;
      };
      assert(replayJson.events.length > 0, 'Missed events should be recovered from SQLite event store');
      const replayIds = new Set(replayJson.events.map((e) => e.eventId));
      assert.equal(replayIds.size, replayJson.events.length, 'No duplicate event IDs on replay');
      assert(
        replayJson.events.every((e) => (e.sequence ?? 0) > seqBeforeDisconnect),
        'All replayed events must strictly succeed lastSequence',
      );

      // Test remote workflow telemetry ingest
      const ingestRes = await fetch(`${baseUrl}/api/telemetry/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          simulationId: obs.engine.simulationId,
          runId: 'gha_test_run_99',
          workflowStatus: 'Running',
          snapshot: {
            ...obs.engine.buildTelemetrySnapshot(),
            runId: 'gha_test_run_99',
            workflowStatus: 'Running',
          },
          events: [
            {
              id: 'remote_evt_1',
              eventId: 'remote_evt_1',
              simulationId: obs.engine.simulationId,
              runId: 'gha_test_run_99',
              sequence: obs.engine.eventSequence + 50,
              tick: obs.engine.world.tick,
              simulationTick: obs.engine.world.tick,
              timestamp: new Date().toISOString(),
              generation: obs.engine.currentGeneration,
              type: 'CheckpointCompleted',
              severity: 'positive',
              titleAr: 'اختبار المزامنة البعيدة',
              detailAr: 'حدث وارد من GitHub Actions',
            },
          ],
        }),
      });
      assert.equal(ingestRes.status, 200);
      const liveStateRes = await fetch(`${baseUrl}/api/state`);
      const liveState = (await liveStateRes.json()) as TelemetrySnapshot;
      assert.equal(liveState.runId, 'gha_test_run_99');
      assert.equal(liveState.workflowStatus, 'Running');

      report.test6_liveSyncAndReplay = {
        sseEventsCaptured: receivedSeqs.length,
        seqBeforeDisconnect,
        replayedEventsCount: replayJson.events.length,
        latestSequenceAfterReplay: replayJson.lastSequence,
        remoteIngestRunIdVerified: liveState.runId,
      };
    } finally {
      server.close();
      await obs.cleanup();
    }

    console.log('=== [Test 7] 100-Agent Stress Test (60 Ticks + Save & Restore Benchmark) ===');
    const cpDir7 = path.join(tmpRoot, 't7');
    const pm7 = new PersistenceManager(cpDir7);
    const eng7 = new CivilizationSimulationEngine({ simulationId: 'sim-stress-100', seed: 100100 });
    eng7.simStatus = 'Running';

    const tStress0 = performance.now();
    for (let t = 0; t < 60; t++) {
      eng7.step();
    }
    const stressMs = Number((performance.now() - tStress0).toFixed(2));
    const tSave0 = performance.now();
    const cp7 = await pm7.saveCheckpoint(eng7);
    const saveMs = Number((performance.now() - tSave0).toFixed(2));

    const eng7Restore = new CivilizationSimulationEngine({ simulationId: 'sim-stress-100', seed: 1 });
    const tRestore0 = performance.now();
    const res7 = await pm7.restoreLatestValidCheckpoint(eng7Restore, cp7.checkpointId);
    const restoreMs = Number((performance.now() - tRestore0).toFixed(2));
    assert.equal(res7.restored, true);

    const bench7 = eng7.getBenchmarks();
    pm7.close();
    report.test7_stressTest100Agents = {
      ticks: 60,
      simDurationMs: stressMs,
      decisionsPerSecond: bench7.decisionsPerSecond,
      rssMb: bench7.rssMb,
      heapUsedMb: bench7.heapUsedMb,
      aliveAfter60Ticks: eng7.agents.filter((a) => a.alive).length,
      experiencesRecorded: eng7.collectiveMemory.totalExperiencesRecorded,
      knowledgeCount: eng7.collectiveMemory.knowledgeMap.size,
      eventsEmitted: eng7.eventSequence,
      checkpointSaveMs: saveMs,
      checkpointRestoreMs: restoreMs,
      checkpointCompressedBytes: cp7.compressedBytes,
      sqliteDbBytes: eng7.sqliteDbBytes,
    };

    console.log('\nALL 7 REAL TESTS PASSED SUCCESSFULLY!');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

runAllTests().catch((err) => {
  console.error('TEST SUITE FAILED:', err);
  process.exit(1);
});

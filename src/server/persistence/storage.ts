import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';
import {
  ENGINE_VERSION,
  SCHEMA_VERSION,
  type AgentState,
  type BrainPackage,
  type CheckpointManifest,
  type ChunkDescriptor,
  type CivilizationKnowledgeItem,
  type CollectiveExperienceRecord,
  type DomainManifestEntry,
  type EmergentSymbol,
  type ExtinctionRecord,
  type GenerationSummary,
  type RecoveryEvent,
  type SimulationEvent,
  type TelemetryHistoryPoint,
  type TimelineMilestone,
  type TrainingSessionState,
  type WorldSector,
  type WorldState,
} from '../../shared/types.ts';
import {
  CivilizationSimulationEngine,
  type SerializedEngineDomains,
} from '../engine/simulationEngine.ts';
import {
  computeCanonicalSha256,
  readAndVerifyCanonicalNdjsonGzipChunk,
  SERIALIZATION_VERSION,
  writeCanonicalNdjsonGzipChunk,
} from './canonicalSerializer.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CHUNK_AGENTS = 25;
const CHUNK_EXPERIENCES = 100;
const CHUNK_EVENTS = 100;

export interface SaveCheckpointOptions {
  simulateInterruptAfterChunks?: number;
}

export interface LegacyCompressedCheckpointEnvelope {
  manifest: CheckpointManifest;
  domains: SerializedEngineDomains;
}

export class PersistenceManager {
  private db: DatabaseSync | null = null;
  public sqliteReady = false;
  private rootDir = DATA_DIR;
  private cpDir = path.join(DATA_DIR, 'checkpoints');
  private pkgDir = path.join(DATA_DIR, 'packages');
  private dbFile = path.join(DATA_DIR, 'civilization.sqlite');
  private lockFile = path.join(DATA_DIR, 'sim.lock');
  private latestFile = path.join(DATA_DIR, 'checkpoints', 'latest.json');
  private saveLock = false;

  constructor(baseDir?: string) {
    const resolved =
      baseDir ?? (process.env.SIM_DATA_DIR ? path.resolve(process.env.SIM_DATA_DIR) : DATA_DIR);
    this.initDirectories(resolved);
  }

  private initDirectories(root: string): void {
    this.rootDir = root;
    this.cpDir = path.join(root, 'checkpoints');
    this.pkgDir = path.join(root, 'packages');
    this.dbFile = path.join(root, 'civilization.sqlite');
    this.lockFile = path.join(root, 'sim.lock');
    this.latestFile = path.join(this.cpDir, 'latest.json');

    fs.mkdirSync(this.rootDir, { recursive: true });
    fs.mkdirSync(this.cpDir, { recursive: true });
    fs.mkdirSync(this.pkgDir, { recursive: true });

    this.cleanupIncompleteStagingDirs();
    this.initSqlite();
  }

  /**
   * Removes any leftover .tmp_* staging folders from interrupted writes
   * so they are never mistaken for valid checkpoints.
   */
  public cleanupIncompleteStagingDirs(): string[] {
    const removed: string[] = [];
    if (!fs.existsSync(this.cpDir)) return removed;
    for (const entry of fs.readdirSync(this.cpDir)) {
      if (entry.startsWith('.tmp_')) {
        const target = path.join(this.cpDir, entry);
        try {
          fs.rmSync(target, { recursive: true, force: true });
          removed.push(entry);
        } catch {
          // ignore cleanup failure
        }
      }
    }
    return removed;
  }

  private initSqlite(): void {
    this.db = new DatabaseSync(this.dbFile);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS checkpoints (
        checkpoint_id TEXT PRIMARY KEY,
        simulation_id TEXT NOT NULL DEFAULT 'civ-main-timeline',
        workflow_run_id TEXT NOT NULL DEFAULT '',
        run_id TEXT NOT NULL,
        format TEXT NOT NULL DEFAULT 'chunked-v2',
        schema_version TEXT NOT NULL,
        engine_version TEXT NOT NULL,
        serialization_version TEXT NOT NULL DEFAULT 'canonical-json-stream-v2',
        generation_number INTEGER NOT NULL,
        tick INTEGER NOT NULL,
        training_step INTEGER NOT NULL DEFAULT 0,
        alive_count INTEGER NOT NULL,
        saved_at TEXT NOT NULL,
        domain_count INTEGER NOT NULL DEFAULT 10,
        chunk_count INTEGER NOT NULL DEFAULT 0,
        root_checksum TEXT NOT NULL DEFAULT '',
        integrity_hash TEXT NOT NULL,
        compressed_bytes INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        complete INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS collective_experiences (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        generation INTEGER NOT NULL,
        sim_tick INTEGER NOT NULL,
        entity_key TEXT NOT NULL,
        category TEXT NOT NULL,
        action TEXT NOT NULL,
        reward REAL NOT NULL,
        reliability REAL NOT NULL,
        success INTEGER NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_exp_entity ON collective_experiences(entity_key);
      CREATE INDEX IF NOT EXISTS idx_exp_gen ON collective_experiences(generation);

      CREATE TABLE IF NOT EXISTS brain_packages (
        package_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        engine_version TEXT NOT NULL,
        evaluation_passed INTEGER NOT NULL,
        integrity_hash TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS extinction_archive (
        extinction_id TEXT PRIMARY KEY,
        tick INTEGER NOT NULL,
        generation INTEGER NOT NULL,
        saved_at TEXT NOT NULL,
        causes_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS telemetry_events (
        event_id TEXT PRIMARY KEY,
        simulation_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        simulation_tick INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        generation INTEGER NOT NULL,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        title_ar TEXT NOT NULL,
        detail_ar TEXT NOT NULL,
        agent_id TEXT,
        agent_name TEXT,
        sector_key TEXT,
        payload_json TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_telemetry_sim_seq
        ON telemetry_events(simulation_id, sequence);
      CREATE INDEX IF NOT EXISTS idx_telemetry_run
        ON telemetry_events(run_id, sequence);
    `);

    // Migrate older checkpoints table if created previously without new columns
    const cols = this.db.prepare(`PRAGMA table_info(checkpoints)`).all() as Array<{ name: string }>;
    const existing = new Set(cols.map((c) => c.name));
    const additions: Array<[string, string]> = [
      ['simulation_id', "TEXT NOT NULL DEFAULT 'civ-main-timeline'"],
      ['workflow_run_id', "TEXT NOT NULL DEFAULT ''"],
      ['format', "TEXT NOT NULL DEFAULT 'chunked-v2'"],
      ['serialization_version', "TEXT NOT NULL DEFAULT 'canonical-json-stream-v2'"],
      ['training_step', 'INTEGER NOT NULL DEFAULT 0'],
      ['domain_count', 'INTEGER NOT NULL DEFAULT 10'],
      ['chunk_count', 'INTEGER NOT NULL DEFAULT 0'],
      ['root_checksum', "TEXT NOT NULL DEFAULT ''"],
      ['complete', 'INTEGER NOT NULL DEFAULT 1'],
    ];
    for (const [col, def] of additions) {
      if (!existing.has(col)) {
        this.db.exec(`ALTER TABLE checkpoints ADD COLUMN ${col} ${def};`);
      }
    }

    this.sqliteReady = true;
  }

  public acquireLock(ownerLabel: string): boolean {
    if (fs.existsSync(this.lockFile)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.lockFile, 'utf8')) as {
          pid: number;
          startedAt: string;
          owner: string;
        };
        try {
          process.kill(raw.pid, 0);
          return false;
        } catch {
          // stale lock
        }
      } catch {
        // corrupt lock
      }
    }
    fs.writeFileSync(
      this.lockFile,
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), owner: ownerLabel }),
    );
    return true;
  }

  public releaseLock(): void {
    try {
      if (fs.existsSync(this.lockFile)) {
        const raw = JSON.parse(fs.readFileSync(this.lockFile, 'utf8')) as { pid: number };
        if (raw.pid === process.pid) {
          fs.unlinkSync(this.lockFile);
        }
      }
    } catch {
      // ignore
    }
  }

  public appendTelemetryEvents(events: SimulationEvent[]): void {
    if (!this.db || events.length === 0) return;
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO telemetry_events
      (event_id, simulation_id, run_id, sequence, simulation_tick, timestamp, generation, type, severity, title_ar, detail_ar, agent_id, agent_name, sector_key, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const evt of events) {
      const eventId = evt.eventId ?? evt.id;
      const simulationId = evt.simulationId ?? 'civ-main-timeline';
      const runId = evt.runId ?? 'unknown';
      const seq = evt.sequence ?? 0;
      const simTick = evt.simulationTick ?? evt.tick;
      const payloadJson = computePayloadJsonSafe(evt.payload ?? {});
      stmt.run(
        eventId,
        simulationId,
        runId,
        seq,
        simTick,
        evt.timestamp,
        evt.generation ?? 1,
        evt.type,
        evt.severity,
        evt.titleAr,
        evt.detailAr,
        evt.agentId ?? null,
        evt.agentName ?? null,
        evt.sectorKey ?? null,
        payloadJson,
      );
    }
  }

  public getTelemetryEventsAfter(
    simulationId: string,
    afterSequence: number,
    limit = 200,
  ): SimulationEvent[] {
    if (!this.db) return [];
    const rows = this.db
      .prepare(
        `SELECT event_id, simulation_id, run_id, sequence, simulation_tick, timestamp, generation, type, severity, title_ar, detail_ar, agent_id, agent_name, sector_key, payload_json
         FROM telemetry_events
         WHERE simulation_id = ? AND sequence > ?
         ORDER BY sequence ASC
         LIMIT ?`,
      )
      .all(simulationId, afterSequence, limit) as Array<{
      event_id: string;
      simulation_id: string;
      run_id: string;
      sequence: number;
      simulation_tick: number;
      timestamp: string;
      generation: number;
      type: SimulationEvent['type'];
      severity: SimulationEvent['severity'];
      title_ar: string;
      detail_ar: string;
      agent_id: string | null;
      agent_name: string | null;
      sector_key: string | null;
      payload_json: string;
    }>;

    return rows.map((r) => {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(r.payload_json) as Record<string, unknown>;
      } catch {
        payload = {};
      }
      return {
        id: r.event_id,
        eventId: r.event_id,
        simulationId: r.simulation_id,
        runId: r.run_id,
        sequence: r.sequence,
        tick: r.simulation_tick,
        simulationTick: r.simulation_tick,
        timestamp: r.timestamp,
        generation: r.generation,
        type: r.type,
        severity: r.severity,
        titleAr: r.title_ar,
        detailAr: r.detail_ar,
        agentId: r.agent_id ?? undefined,
        agentName: r.agent_name ?? undefined,
        sectorKey: r.sector_key ?? undefined,
        payload,
      };
    });
  }

  /**
   * Chunked + Streaming Atomic Checkpoint Transaction.
   * Never calls JSON.stringify on the full simulation state.
   */
  public async saveCheckpoint(
    engine: CivilizationSimulationEngine,
    options?: SaveCheckpointOptions,
  ): Promise<CheckpointManifest> {
    if (this.saveLock) {
      throw new Error('Checkpoint save already in progress');
    }
    this.saveLock = true;
    const prevPersistenceState = engine.persistenceState;
    engine.persistenceState = 'SavingCheckpoint';
    engine.emitEvent({
      type: 'CheckpointStarted',
      generation: engine.currentGeneration,
      titleAr: `بدء حفظ نقطة الفحص (Tick ${engine.world.tick})`,
      detailAr: 'تفعيل حاجز التزامن وكتابة الأجزاء المضغوطة مع التحقق من البصمة الرقمية.',
      severity: 'info',
    });

    // Reserve 1 sequence slot for the terminal checkpoint event (CheckpointCompleted / CheckpointFailed)
    // so live engine and restored checkpoint share identical eventSequence without SQLite collisions.
    engine.eventSequence += 1;
    const terminalSeq = engine.eventSequence;

    // Synchronous Snapshot Barrier at exact tick & PRNG state
    const domains = engine.exportSeparatedDomains();
    const totalTrainingStep = Object.values(domains.neuralWeights).reduce(
      (s, b) => s + (b.trainingSteps ?? 0),
      0,
    );
    const checkpointId = `cp_${domains.meta.runId}_t${domains.worldState.tick}_${Date.now()}`;
    const stagingDir = path.join(this.cpDir, `.tmp_${checkpointId}`);
    const finalDir = path.join(this.cpDir, checkpointId);

    try {
      fs.mkdirSync(stagingDir, { recursive: true });
      let chunksWritten = 0;

      const domainEntries: Record<string, DomainManifestEntry> = {};
      const writeDomainChunks = async (
        domainName: string,
        batches: unknown[][],
      ): Promise<DomainManifestEntry> => {
        const chunks: ChunkDescriptor[] = [];
        let totalRawBytes = 0;
        let totalCompressedBytes = 0;

        for (let idx = 0; idx < batches.length; idx++) {
          if (
            options?.simulateInterruptAfterChunks !== undefined &&
            chunksWritten >= options.simulateInterruptAfterChunks
          ) {
            throw new Error(
              `Simulated interruption during checkpoint write at chunk #${chunksWritten}`,
            );
          }

          const relFile = `${domainName}.chunk_${String(idx).padStart(3, '0')}.bin.gz`;
          const fullFile = path.join(stagingDir, relFile);
          const stats = await writeCanonicalNdjsonGzipChunk(batches[idx], fullFile);

          chunks.push({
            file: relFile,
            rawBytes: stats.rawBytes,
            compressedBytes: stats.compressedBytes,
            rawSha256: stats.rawSha256,
            compressedSha256: stats.compressedSha256,
            itemCount: batches[idx].length,
          });
          totalRawBytes += stats.rawBytes;
          totalCompressedBytes += stats.compressedBytes;
          chunksWritten += 1;
        }

        const { sha256: domainSha256 } = computeCanonicalSha256({
          domain: domainName,
          chunks: chunks.map((c) => ({
            file: c.file,
            rawBytes: c.rawBytes,
            rawSha256: c.rawSha256,
            itemCount: c.itemCount,
          })),
        });

        const entry: DomainManifestEntry = {
          domain: domainName,
          domainSha256,
          totalRawBytes,
          totalCompressedBytes,
          chunks,
        };
        domainEntries[domainName] = entry;
        return entry;
      };

      // Domain 1: world (summary without heavy sectors array, sectors go to environment)
      const { sectors, ...worldMeta } = domains.worldState;
      await writeDomainChunks('world', [[worldMeta]]);

      // Domain 2: environment (sectors chunked)
      await writeDomainChunks('environment', chunkArray(sectors, 25));

      // Domain 3: agents
      await writeDomainChunks('agents', chunkArray(domains.agentsState, CHUNK_AGENTS));

      // Domain 4: neural weights
      const brainPairs = Object.entries(domains.neuralWeights).map(([agentId, brain]) => ({
        agentId,
        brain,
      }));
      await writeDomainChunks('neural', chunkArray(brainPairs, CHUNK_AGENTS));

      // Domain 5: memories
      const memoryPairs = Object.entries(domains.personalMemories).map(([agentId, memory]) => ({
        agentId,
        memory,
      }));
      await writeDomainChunks('memories', chunkArray(memoryPairs, CHUNK_AGENTS));

      // Domain 6: collective-knowledge (tagged union records for clean NDJSON chunking)
      const ckRecords: Array<Record<string, unknown>> = [
        ...domains.collectiveExperiences.map((x) => ({ kind: 'exp', data: x })),
        ...domains.civilizationKnowledge.map((x) => ({ kind: 'know', data: x })),
        ...domains.symbols.map((x) => ({ kind: 'sym', data: x })),
      ];
      await writeDomainChunks(
        'collective-knowledge',
        ckRecords.length > 0 ? chunkArray(ckRecords, CHUNK_EXPERIENCES) : [[]],
      );

      // Domain 7: generations & timeline & revival archive
      const genRecords: Array<Record<string, unknown>> = [
        ...domains.generations.map((x) => ({ kind: 'gen', data: x })),
        ...domains.timeline.map((x) => ({ kind: 'ms', data: x })),
        ...domains.extinctionRecords.map((x) => ({ kind: 'ext', data: x })),
        ...domains.recoveryEvents.map((x) => ({ kind: 'rec', data: x })),
        ...domains.preservedRevivalPool.map((x) => ({ kind: 'rev', data: x })),
        ...domains.history.map((x) => ({ kind: 'hist', data: x })),
      ];
      await writeDomainChunks(
        'generations',
        genRecords.length > 0 ? chunkArray(genRecords, CHUNK_EXPERIENCES) : [[]],
      );

      // Domain 8: events
      await writeDomainChunks(
        'events',
        domains.eventLogs.length > 0 ? chunkArray(domains.eventLogs, CHUNK_EVENTS) : [[]],
      );

      // Domain 9: training
      await writeDomainChunks('training', [[domains.trainingState ?? engine.trainingState]]);

      // Domain 10: meta
      await writeDomainChunks('meta', [[domains.meta]]);

      const domainChecksums: Record<string, string> = {};
      let totalCompressedBytes = 0;
      let totalChunkCount = 0;
      for (const [dName, dEntry] of Object.entries(domainEntries)) {
        domainChecksums[dName] = dEntry.domainSha256;
        totalCompressedBytes += dEntry.totalCompressedBytes;
        totalChunkCount += dEntry.chunks.length;
      }

      const { sha256: rootChecksum } = computeCanonicalSha256({
        simulationId: domains.meta.simulationId,
        runId: domains.meta.runId,
        tick: domains.worldState.tick,
        serializationVersion: SERIALIZATION_VERSION,
        domainChecksums,
      });

      const savedAt = new Date().toISOString();
      const manifest: CheckpointManifest = {
        format: 'chunked-v2',
        checkpointId,
        simulationId: domains.meta.simulationId,
        workflowRunId: process.env.GITHUB_RUN_ID ?? domains.meta.runId,
        schemaVersion: SCHEMA_VERSION,
        engineVersion: ENGINE_VERSION,
        serializationVersion: SERIALIZATION_VERSION,
        savedAt,
        runId: domains.meta.runId,
        generationNumber: domains.meta.currentGeneration,
        tick: domains.worldState.tick,
        trainingStep: totalTrainingStep,
        aliveCount: domains.agentsState.filter((a) => a.alive).length,
        compatibilityRange: '1.0.x',
        domainCount: Object.keys(domainEntries).length,
        chunkCount: totalChunkCount,
        domains: domainEntries,
        rootChecksum,
        integrityHash: rootChecksum,
        domainChecksums,
        compressedBytes: totalCompressedBytes,
        complete: true,
      };

      const manifestTmp = path.join(stagingDir, 'manifest.json');
      fs.writeFileSync(manifestTmp, JSON.stringify(manifest, null, 2), 'utf8');

      // Atomic directory commit
      fs.renameSync(stagingDir, finalDir);

      // Atomic latest pointer commit
      const latestTmp = `${this.latestFile}.tmp`;
      fs.writeFileSync(
        latestTmp,
        JSON.stringify(
          {
            checkpointId: manifest.checkpointId,
            simulationId: manifest.simulationId,
            tick: manifest.tick,
            rootChecksum: manifest.rootChecksum,
            savedAt: manifest.savedAt,
            path: finalDir,
          },
          null,
          2,
        ),
        'utf8',
      );
      fs.renameSync(latestTmp, this.latestFile);

      if (this.db) {
        this.db
          .prepare(
            `INSERT OR REPLACE INTO checkpoints
            (checkpoint_id, simulation_id, workflow_run_id, run_id, format, schema_version, engine_version, serialization_version, generation_number, tick, training_step, alive_count, saved_at, domain_count, chunk_count, root_checksum, integrity_hash, compressed_bytes, file_path, complete)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            manifest.checkpointId,
            manifest.simulationId,
            manifest.workflowRunId,
            manifest.runId,
            manifest.format ?? 'chunked-v2',
            manifest.schemaVersion,
            manifest.engineVersion,
            manifest.serializationVersion,
            manifest.generationNumber,
            manifest.tick,
            manifest.trainingStep,
            manifest.aliveCount,
            manifest.savedAt,
            manifest.domainCount,
            manifest.chunkCount,
            manifest.rootChecksum,
            manifest.integrityHash,
            manifest.compressedBytes,
            finalDir,
            1,
          );

        const recentExps = domains.collectiveExperiences.slice(-150);
        const insertExp = this.db.prepare(
          `INSERT OR IGNORE INTO collective_experiences
          (id, agent_id, generation, sim_tick, entity_key, category, action, reward, reliability, success, payload_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const e of recentExps) {
          insertExp.run(
            e.id,
            e.agentId,
            e.generation,
            e.simTimeTick,
            e.entityKey,
            e.category,
            e.chosenAction,
            e.reward,
            e.reliabilityScore,
            e.success ? 1 : 0,
            JSON.stringify({
              immediateOutcome: e.immediateOutcome,
              delayedOutcomes: e.delayedOutcomes,
              actionReason: e.actionReason,
              damages: e.damages,
            }),
          );
        }

        for (const ext of domains.extinctionRecords) {
          this.db
            .prepare(
              `INSERT OR IGNORE INTO extinction_archive (extinction_id, tick, generation, saved_at, causes_json)
               VALUES (?, ?, ?, ?, ?)`,
            )
            .run(
              ext.id,
              ext.tick,
              ext.generationAtExtinction,
              ext.timestamp,
              JSON.stringify(ext.rootCausesAr),
            );
        }
      }

      this.pruneOldCheckpoints(24);
      this.syncEngineStorageStats(engine);
      engine.persistenceState = 'Ready';
      engine.lastRootChecksum = manifest.rootChecksum;
      engine.lastPersistenceError = undefined;
      engine.emitEvent(
        {
          type: 'CheckpointCompleted',
          generation: engine.currentGeneration,
          titleAr: `اكتمل حفظ نقطة الفحص (${manifest.checkpointId})`,
          detailAr: `حُفظ ${manifest.chunkCount} جزءاً عبر ${manifest.domainCount} نطاقات (${manifest.compressedBytes} بايت) · بصمة الجذر: ${manifest.rootChecksum.slice(0, 12)}…`,
          severity: 'positive',
          payload: {
            checkpointId: manifest.checkpointId,
            tick: manifest.tick,
            rootChecksum: manifest.rootChecksum,
            compressedBytes: manifest.compressedBytes,
          },
        },
        { reservedSequence: terminalSeq },
      );
      return manifest;
    } catch (err) {
      // Isolate/remove incomplete staging directory without touching previous valid checkpoints
      try {
        if (fs.existsSync(stagingDir)) {
          fs.rmSync(stagingDir, { recursive: true, force: true });
        }
      } catch {
        // ignore cleanup error
      }
      engine.persistenceState = prevPersistenceState === 'SavingCheckpoint' ? 'Error' : 'Error';
      engine.lastPersistenceError = (err as Error).message;
      engine.emitEvent(
        {
          type: 'CheckpointFailed',
          generation: engine.currentGeneration,
          titleAr: 'فشل حفظ نقطة الفحص',
          detailAr: (err as Error).message,
          severity: 'critical',
        },
        { reservedSequence: terminalSeq },
      );
      throw err;
    } finally {
      this.saveLock = false;
    }
  }

  public listCheckpoints(): CheckpointManifest[] {
    if (!this.db) return [];
    const rows = this.db
      .prepare(
        `SELECT checkpoint_id, simulation_id, workflow_run_id, run_id, format, schema_version, engine_version, serialization_version, generation_number, tick, training_step, alive_count, saved_at, domain_count, chunk_count, root_checksum, integrity_hash, compressed_bytes, file_path, complete
         FROM checkpoints ORDER BY saved_at DESC LIMIT 30`,
      )
      .all() as Array<{
      checkpoint_id: string;
      simulation_id: string;
      workflow_run_id: string;
      run_id: string;
      format: 'chunked-v2' | 'legacy-v1';
      schema_version: string;
      engine_version: string;
      serialization_version: string;
      generation_number: number;
      tick: number;
      training_step: number;
      alive_count: number;
      saved_at: string;
      domain_count: number;
      chunk_count: number;
      root_checksum: string;
      integrity_hash: string;
      compressed_bytes: number;
      file_path: string;
      complete: number;
    }>;

    return rows.map((r) => {
      const exists = fs.existsSync(r.file_path);
      return {
        format: r.format || 'chunked-v2',
        checkpointId: r.checkpoint_id,
        simulationId: r.simulation_id || 'civ-main-timeline',
        workflowRunId: r.workflow_run_id || r.run_id,
        schemaVersion: r.schema_version,
        engineVersion: r.engine_version,
        serializationVersion: r.serialization_version || SERIALIZATION_VERSION,
        savedAt: r.saved_at,
        runId: r.run_id,
        generationNumber: r.generation_number,
        tick: r.tick,
        trainingStep: r.training_step || 0,
        aliveCount: r.alive_count,
        compatibilityRange: '1.0.x',
        domainCount: r.domain_count || 10,
        chunkCount: r.chunk_count || 0,
        rootChecksum: r.root_checksum || r.integrity_hash,
        integrityHash: r.integrity_hash,
        domainChecksums: {},
        compressedBytes: r.compressed_bytes,
        complete: r.complete === 1,
        corrupted: !exists || r.complete !== 1,
      };
    });
  }

  /**
   * 11-step pre-restore verification for chunked-v2 directories + backward-compatible legacy-v1 .json.gz files.
   */
  public async verifyCheckpoint(
    targetPath: string,
    loadDomains = false,
  ): Promise<{
    valid: boolean;
    manifest?: CheckpointManifest;
    domains?: SerializedEngineDomains;
    reasonAr?: string;
  }> {
    try {
      if (!fs.existsSync(targetPath)) {
        return { valid: false, reasonAr: 'مسار نقطة الفحص غير موجود على القرص.' };
      }

      const baseName = path.basename(targetPath);
      if (baseName.startsWith('.tmp_')) {
        return { valid: false, reasonAr: 'نقطة الفحص مؤقتة وغير مكتملة (.tmp_).' };
      }

      const stat = fs.statSync(targetPath);

      // Legacy single-file .json.gz compatibility path (streaming gunzip, no full-payload giant stringify)
      if (stat.isFile() && targetPath.endsWith('.json.gz')) {
        return await this.verifyLegacyCheckpointFile(targetPath, loadDomains);
      }

      if (!stat.isDirectory()) {
        return { valid: false, reasonAr: 'تنسيق نقطة الفحص غير مدعوم.' };
      }

      const manifestPath = path.join(targetPath, 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        return { valid: false, reasonAr: 'ملف manifest.json مفقود داخل نقطة الفحص.' };
      }

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as CheckpointManifest;
      if (!manifest || manifest.complete !== true || !manifest.domains) {
        return { valid: false, reasonAr: 'سجل manifest غير مكتمل أو يفتقد النطاقات.' };
      }

      if (manifest.schemaVersion.split('.')[0] !== SCHEMA_VERSION.split('.')[0]) {
        return {
          valid: false,
          reasonAr: `تعارض إصدار المخطط (${manifest.schemaVersion} مقابل ${SCHEMA_VERSION}).`,
        };
      }

      const domainEntries = Object.values(manifest.domains);
      if (domainEntries.length !== manifest.domainCount) {
        return { valid: false, reasonAr: 'عدد النطاقات في السجل غير متطابق.' };
      }

      let verifiedChunksCount = 0;
      const domainData: Record<string, unknown[]> = {};
      const recomputedDomainChecksums: Record<string, string> = {};

      for (const dEntry of domainEntries) {
        const itemsCollected: unknown[] = [];
        for (const chunk of dEntry.chunks) {
          const chunkPath = path.join(targetPath, chunk.file);
          if (!fs.existsSync(chunkPath)) {
            return { valid: false, reasonAr: `الجزء المفقود: ${chunk.file}` };
          }
          const readRes = await readAndVerifyCanonicalNdjsonGzipChunk(
            chunkPath,
            chunk.compressedSha256,
            chunk.rawSha256,
            chunk.compressedBytes,
          );
          if (readRes.rawBytes !== chunk.rawBytes) {
            return { valid: false, reasonAr: `تباين حجم البيانات غير المضغوطة في ${chunk.file}` };
          }
          if (readRes.items.length !== chunk.itemCount) {
            return { valid: false, reasonAr: `تباين عدد السجلات في ${chunk.file}` };
          }
          verifiedChunksCount += 1;
          if (loadDomains) {
            itemsCollected.push(...readRes.items);
          }
        }

        const { sha256: expectedDomSha } = computeCanonicalSha256({
          domain: dEntry.domain,
          chunks: dEntry.chunks.map((c) => ({
            file: c.file,
            rawBytes: c.rawBytes,
            rawSha256: c.rawSha256,
            itemCount: c.itemCount,
          })),
        });
        if (expectedDomSha !== dEntry.domainSha256) {
          return {
            valid: false,
            reasonAr: `تعارض التوقيع الرقمي لنطاق (${dEntry.domain}).`,
          };
        }
        recomputedDomainChecksums[dEntry.domain] = expectedDomSha;
        if (loadDomains) {
          domainData[dEntry.domain] = itemsCollected;
        }
      }

      if (verifiedChunksCount !== manifest.chunkCount) {
        return { valid: false, reasonAr: 'عدد الأجزاء المتحقق منها لا يطابق السجل.' };
      }

      const { sha256: recomputedRoot } = computeCanonicalSha256({
        simulationId: manifest.simulationId,
        runId: manifest.runId,
        tick: manifest.tick,
        serializationVersion: manifest.serializationVersion,
        domainChecksums: recomputedDomainChecksums,
      });

      if (recomputedRoot !== manifest.rootChecksum) {
        return {
          valid: false,
          reasonAr: 'فشل التحقق من rootChecksum العام لنقطة الفحص (ملف تالف أو معدل).',
        };
      }

      if (!loadDomains) {
        return { valid: true, manifest };
      }

      const worldMeta = domainData.world[0] as Omit<WorldState, 'sectors'>;
      const sectors = domainData.environment as WorldSector[];
      const worldState: WorldState = {
        ...worldMeta,
        sectors,
      };

      const agentsState = domainData.agents as SerializedEngineDomains['agentsState'];
      const neuralPairs = domainData.neural as Array<{ agentId: string; brain: AgentState['brain'] }>;
      const neuralWeights: Record<string, AgentState['brain']> = {};
      for (const p of neuralPairs) neuralWeights[p.agentId] = p.brain;

      const memPairs = domainData.memories as Array<{
        agentId: string;
        memory: SerializedEngineDomains['personalMemories'][string];
      }>;
      const personalMemories: SerializedEngineDomains['personalMemories'] = {};
      for (const m of memPairs) personalMemories[m.agentId] = m.memory;

      const collectiveExperiences: CollectiveExperienceRecord[] = [];
      const civilizationKnowledge: CivilizationKnowledgeItem[] = [];
      const symbols: EmergentSymbol[] = [];
      for (const row of (domainData['collective-knowledge'] ?? []) as Array<{
        kind: string;
        data: unknown;
      }>) {
        if (row.kind === 'exp') collectiveExperiences.push(row.data as CollectiveExperienceRecord);
        else if (row.kind === 'know')
          civilizationKnowledge.push(row.data as CivilizationKnowledgeItem);
        else if (row.kind === 'sym') symbols.push(row.data as EmergentSymbol);
      }

      const generations: GenerationSummary[] = [];
      const timeline: TimelineMilestone[] = [];
      const extinctionRecords: ExtinctionRecord[] = [];
      const recoveryEvents: RecoveryEvent[] = [];
      const preservedRevivalPool: AgentState[] = [];
      const history: TelemetryHistoryPoint[] = [];
      for (const row of (domainData.generations ?? []) as Array<{ kind: string; data: unknown }>) {
        if (row.kind === 'gen') generations.push(row.data as GenerationSummary);
        else if (row.kind === 'ms') timeline.push(row.data as TimelineMilestone);
        else if (row.kind === 'ext') extinctionRecords.push(row.data as ExtinctionRecord);
        else if (row.kind === 'rec') recoveryEvents.push(row.data as RecoveryEvent);
        else if (row.kind === 'rev') preservedRevivalPool.push(row.data as AgentState);
        else if (row.kind === 'hist') history.push(row.data as TelemetryHistoryPoint);
      }

      const eventLogs = (domainData.events ?? []) as SimulationEvent[];
      const trainingState = domainData.training?.[0] as TrainingSessionState | undefined;
      const meta = domainData.meta[0] as SerializedEngineDomains['meta'];

      const domains: SerializedEngineDomains = {
        worldState,
        agentsState,
        neuralWeights,
        personalMemories,
        collectiveExperiences,
        civilizationKnowledge,
        symbols,
        generations,
        eventLogs,
        timeline,
        extinctionRecords,
        recoveryEvents,
        preservedRevivalPool,
        history,
        trainingState,
        meta,
      };

      return { valid: true, manifest, domains };
    } catch (err) {
      return {
        valid: false,
        reasonAr: `تعذر التحقق من نقطة الفحص: ${(err as Error).message}`,
      };
    }
  }

  private async verifyLegacyCheckpointFile(
    filePath: string,
    loadDomains: boolean,
  ): Promise<{
    valid: boolean;
    manifest?: CheckpointManifest;
    domains?: SerializedEngineDomains;
    reasonAr?: string;
  }> {
    const chunks: Buffer[] = [];
    const gunzip = zlib.createGunzip();
    gunzip.on('data', (c: Buffer) => chunks.push(c));
    await pipeline(fs.createReadStream(filePath), gunzip);
    const jsonStr = Buffer.concat(chunks).toString('utf8');
    const envelope = JSON.parse(jsonStr) as LegacyCompressedCheckpointEnvelope;
    if (!envelope?.manifest || !envelope?.domains) {
      return { valid: false, reasonAr: 'بنية نقطة الفحص القديمة غير مكتملة.' };
    }
    return {
      valid: true,
      manifest: {
        ...envelope.manifest,
        format: 'legacy-v1',
        complete: true,
        rootChecksum: envelope.manifest.rootChecksum ?? envelope.manifest.integrityHash,
      },
      domains: loadDomains ? envelope.domains : undefined,
    };
  }

  public async restoreLatestValidCheckpoint(
    engine: CivilizationSimulationEngine,
    specificCheckpointId?: string,
    options?: { overrideRunId?: string },
  ): Promise<{
    restored: boolean;
    manifest?: CheckpointManifest;
    rolledBackFromCorrupt?: string;
    reasonAr: string;
  }> {
    if (!this.db) {
      return { restored: false, reasonAr: 'قاعدة البيانات غير متاحة.' };
    }
    engine.persistenceState = 'RestoringCheckpoint';

    const candidates = specificCheckpointId
      ? (this.db
          .prepare(`SELECT checkpoint_id, file_path FROM checkpoints WHERE checkpoint_id = ?`)
          .all(specificCheckpointId) as Array<{ checkpoint_id: string; file_path: string }>)
      : (this.db
          .prepare(
            `SELECT checkpoint_id, file_path FROM checkpoints WHERE complete = 1 ORDER BY saved_at DESC LIMIT 15`,
          )
          .all() as Array<{ checkpoint_id: string; file_path: string }>);

    let corruptSkipped: string | undefined;

    for (const cand of candidates) {
      const check = await this.verifyCheckpoint(cand.file_path, true);
      if (!check.valid || !check.domains || !check.manifest) {
        if (!corruptSkipped) corruptSkipped = cand.checkpoint_id;
        continue;
      }

      engine.loadFromSeparatedDomains(check.domains, options);
      engine.persistenceState = 'Ready';
      engine.lastRootChecksum = check.manifest.rootChecksum;
      engine.lastPersistenceError = undefined;
      this.syncEngineStorageStats(engine);

      return {
        restored: true,
        manifest: check.manifest,
        rolledBackFromCorrupt: corruptSkipped,
        reasonAr: corruptSkipped
          ? `تم اكتشاف تلف في ${corruptSkipped} والتراجع تلقائياً إلى آخر نسخة سليمة (${cand.checkpoint_id}).`
          : `تمت استعادة نقطة الفحص السليمة (${cand.checkpoint_id}) بنجاح.`,
      };
    }

    engine.persistenceState = 'Ready';
    return {
      restored: false,
      rolledBackFromCorrupt: corruptSkipped,
      reasonAr: 'لا توجد نقاط فحص سليمة للاستعادة.',
    };
  }

  public async restoreKnowledgeDomainOnly(
    engine: CivilizationSimulationEngine,
    checkpointId: string,
  ): Promise<{ restored: boolean; reasonAr: string }> {
    return this.restorePartialDomain(engine, checkpointId, 'collective-knowledge');
  }

  public async restorePartialDomain(
    engine: CivilizationSimulationEngine,
    checkpointId: string,
    domainName: 'collective-knowledge' | 'training' | 'generations',
  ): Promise<{ restored: boolean; reasonAr: string }> {
    if (!this.db) return { restored: false, reasonAr: 'قاعدة البيانات غير متاحة.' };
    const row = this.db
      .prepare(`SELECT file_path FROM checkpoints WHERE checkpoint_id = ?`)
      .get(checkpointId) as { file_path: string } | undefined;
    if (!row) return { restored: false, reasonAr: 'نقطة الفحص غير موجودة.' };

    const check = await this.verifyCheckpoint(row.file_path, true);
    if (!check.valid || !check.domains || !check.manifest) {
      return { restored: false, reasonAr: check.reasonAr ?? 'نقطة الفحص تالفة.' };
    }
    if (
      check.manifest.simulationId &&
      check.manifest.simulationId !== engine.simulationId
    ) {
      return {
        restored: false,
        reasonAr: `تعارض هوية المحاكاة (${check.manifest.simulationId} مقابل ${engine.simulationId}).`,
      };
    }

    const d = check.domains;
    if (domainName === 'collective-knowledge') {
      engine.collectiveMemory.experiences = structuredClone(d.collectiveExperiences ?? []);
      engine.collectiveMemory.knowledgeMap.clear();
      for (const k of d.civilizationKnowledge ?? []) {
        engine.collectiveMemory.knowledgeMap.set(k.entityKey, structuredClone(k));
      }
      engine.collectiveMemory.symbolsMap.clear();
      for (const s of d.symbols ?? []) {
        engine.collectiveMemory.symbolsMap.set(s.meaningKey, structuredClone(s));
      }
    } else if (domainName === 'training' && d.trainingState) {
      engine.trainingState = structuredClone(d.trainingState);
    } else if (domainName === 'generations') {
      engine.generationsMap.clear();
      for (const g of d.generations ?? []) {
        engine.generationsMap.set(g.generation, structuredClone(g));
      }
      engine.timeline = structuredClone(d.timeline ?? []);
    }

    return {
      restored: true,
      reasonAr: `تمت الاستعادة الجزئية لنطاق (${domainName}) من نقطة الفحص ${checkpointId} بنجاح.`,
    };
  }

  public saveBrainPackage(pkg: BrainPackage): void {
    const filePath = path.join(this.pkgDir, `${pkg.packageId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(pkg, null, 2));
    if (this.db) {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO brain_packages
          (package_id, created_at, engine_version, evaluation_passed, integrity_hash, payload_json)
          VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          pkg.packageId,
          pkg.createdAt,
          pkg.engineVersion,
          pkg.trainingMetadata.evaluationPassed ? 1 : 0,
          pkg.integrityHash,
          JSON.stringify(pkg),
        );
    }
  }

  public loadSavedPackages(): BrainPackage[] {
    if (!this.db) return [];
    const rows = this.db
      .prepare(`SELECT payload_json FROM brain_packages ORDER BY created_at DESC LIMIT 20`)
      .all() as Array<{ payload_json: string }>;
    return rows
      .map((r) => {
        try {
          return JSON.parse(r.payload_json) as BrainPackage;
        } catch {
          return null;
        }
      })
      .filter((p): p is BrainPackage => p !== null);
  }

  public syncEngineStorageStats(engine: CivilizationSimulationEngine): void {
    engine.sqliteReady = this.sqliteReady;
    const cps = this.listCheckpoints();
    engine.checkpoints = cps;
    engine.latestCheckpointBytes = cps[0]?.compressedBytes ?? 0;
    try {
      engine.sqliteDbBytes = fs.existsSync(this.dbFile) ? fs.statSync(this.dbFile).size : 0;
    } catch {
      engine.sqliteDbBytes = 0;
    }
  }

  private pruneOldCheckpoints(keepCount: number): void {
    if (!this.db) return;
    const oldRows = this.db
      .prepare(
        `SELECT checkpoint_id, file_path FROM checkpoints ORDER BY saved_at DESC LIMIT -1 OFFSET ?`,
      )
      .all(keepCount) as Array<{ checkpoint_id: string; file_path: string }>;
    for (const row of oldRows) {
      try {
        if (fs.existsSync(row.file_path)) {
          fs.rmSync(row.file_path, { recursive: true, force: true });
        }
      } catch {
        // ignore
      }
      this.db.prepare(`DELETE FROM checkpoints WHERE checkpoint_id = ?`).run(row.checkpoint_id);
    }
  }

  public getCheckpointPath(checkpointId: string): string | null {
    if (!this.db) return null;
    const row = this.db
      .prepare(`SELECT file_path FROM checkpoints WHERE checkpoint_id = ?`)
      .get(checkpointId) as { file_path: string } | undefined;
    return row?.file_path ?? null;
  }

  public close(): void {
    this.releaseLock();
    try {
      this.db?.close();
    } catch {
      // ignore
    }
    this.db = null;
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  if (arr.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function computePayloadJsonSafe(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return '{}';
  }
}

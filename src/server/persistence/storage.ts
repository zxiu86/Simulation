import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import zlib from 'node:zlib';
import {
  ENGINE_VERSION,
  SCHEMA_VERSION,
  type BrainPackage,
  type CheckpointManifest,
} from '../../shared/types.ts';
import {
  CivilizationSimulationEngine,
  computePayloadSha256,
  type SerializedEngineDomains,
} from '../engine/simulationEngine.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CHECKPOINTS_DIR = path.join(DATA_DIR, 'checkpoints');
const PACKAGES_DIR = path.join(DATA_DIR, 'packages');
const DB_PATH = path.join(DATA_DIR, 'civilization.sqlite');
const LOCK_PATH = path.join(DATA_DIR, 'sim.lock');

export interface CompressedCheckpointEnvelope {
  manifest: CheckpointManifest;
  domains: SerializedEngineDomains;
}

export class PersistenceManager {
  private db: DatabaseSync | null = null;
  public sqliteReady = false;

  constructor(baseDir?: string) {
    const resolved =
      baseDir ?? (process.env.SIM_DATA_DIR ? path.resolve(process.env.SIM_DATA_DIR) : DATA_DIR);
    this.initDirectories(resolved);
  }

  private rootDir = DATA_DIR;
  private cpDir = CHECKPOINTS_DIR;
  private pkgDir = PACKAGES_DIR;
  private dbFile = DB_PATH;
  private lockFile = LOCK_PATH;

  private initDirectories(root: string): void {
    this.rootDir = root;
    this.cpDir = path.join(root, 'checkpoints');
    this.pkgDir = path.join(root, 'packages');
    this.dbFile = path.join(root, 'civilization.sqlite');
    this.lockFile = path.join(root, 'sim.lock');

    fs.mkdirSync(this.rootDir, { recursive: true });
    fs.mkdirSync(this.cpDir, { recursive: true });
    fs.mkdirSync(this.pkgDir, { recursive: true });

    this.initSqlite();
  }

  private initSqlite(): void {
    this.db = new DatabaseSync(this.dbFile);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS checkpoints (
        checkpoint_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        schema_version TEXT NOT NULL,
        engine_version TEXT NOT NULL,
        generation_number INTEGER NOT NULL,
        tick INTEGER NOT NULL,
        alive_count INTEGER NOT NULL,
        saved_at TEXT NOT NULL,
        integrity_hash TEXT NOT NULL,
        compressed_bytes INTEGER NOT NULL,
        file_path TEXT NOT NULL
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
    `);
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
        // Check if PID is still alive
        try {
          process.kill(raw.pid, 0);
          return false; // active lock held by another running process
        } catch {
          // Stale lock from dead process; safe to reclaim
        }
      } catch {
        // Corrupt lock file; reclaim
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
      // ignore cleanup error
    }
  }

  public saveCheckpoint(engine: CivilizationSimulationEngine): CheckpointManifest {
    const domains = engine.exportSeparatedDomains();
    const domainChecksums: Record<string, string> = {
      worldState: computePayloadSha256(domains.worldState),
      agentsState: computePayloadSha256(domains.agentsState),
      neuralWeights: computePayloadSha256(domains.neuralWeights),
      personalMemories: computePayloadSha256(domains.personalMemories),
      collectiveExperiences: computePayloadSha256(domains.collectiveExperiences),
      civilizationKnowledge: computePayloadSha256(domains.civilizationKnowledge),
      generations: computePayloadSha256(domains.generations),
      eventLogs: computePayloadSha256(domains.eventLogs),
      trainingState: computePayloadSha256(engine.trainingState),
      uiTelemetryMeta: computePayloadSha256(domains.meta),
    };

    const integrityHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(domains))
      .digest('hex');

    const checkpointId = `cp_${domains.meta.runId}_t${domains.worldState.tick}_${Date.now()}`;
    const savedAt = new Date().toISOString();

    const manifest: CheckpointManifest = {
      checkpointId,
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      savedAt,
      runId: domains.meta.runId,
      generationNumber: domains.meta.currentGeneration,
      tick: domains.worldState.tick,
      aliveCount: domains.agentsState.filter((a) => a.alive).length,
      compatibilityRange: '1.0.x',
      integrityHash,
      domainChecksums,
      compressedBytes: 0,
    };

    const envelope: CompressedCheckpointEnvelope = { manifest, domains };
    const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(envelope), 'utf8'), {
      level: 6,
    });
    manifest.compressedBytes = compressed.length;

    const fileName = `${checkpointId}.json.gz`;
    const fullPath = path.join(this.cpDir, fileName);
    const tmpPath = `${fullPath}.tmp`;
    fs.writeFileSync(tmpPath, compressed);
    fs.renameSync(tmpPath, fullPath);

    if (this.db) {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO checkpoints
          (checkpoint_id, run_id, schema_version, engine_version, generation_number, tick, alive_count, saved_at, integrity_hash, compressed_bytes, file_path)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          manifest.checkpointId,
          manifest.runId,
          manifest.schemaVersion,
          manifest.engineVersion,
          manifest.generationNumber,
          manifest.tick,
          manifest.aliveCount,
          manifest.savedAt,
          manifest.integrityHash,
          manifest.compressedBytes,
          fullPath,
        );

      // Sync recent collective experiences into SQLite index
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
          .run(ext.id, ext.tick, ext.generationAtExtinction, ext.timestamp, JSON.stringify(ext.rootCausesAr));
      }
    }

    // Keep disk footprint bounded: retain up to 24 newest checkpoints
    this.pruneOldCheckpoints(24);
    this.syncEngineStorageStats(engine);
    return manifest;
  }

  public listCheckpoints(): CheckpointManifest[] {
    if (!this.db) return [];
    const rows = this.db
      .prepare(
        `SELECT checkpoint_id, run_id, schema_version, engine_version, generation_number, tick, alive_count, saved_at, integrity_hash, compressed_bytes, file_path
         FROM checkpoints ORDER BY saved_at DESC LIMIT 30`,
      )
      .all() as Array<{
      checkpoint_id: string;
      run_id: string;
      schema_version: string;
      engine_version: string;
      generation_number: number;
      tick: number;
      alive_count: number;
      saved_at: string;
      integrity_hash: string;
      compressed_bytes: number;
      file_path: string;
    }>;

    return rows.map((r) => ({
      checkpointId: r.checkpoint_id,
      runId: r.run_id,
      schemaVersion: r.schema_version,
      engineVersion: r.engine_version,
      generationNumber: r.generation_number,
      tick: r.tick,
      aliveCount: r.alive_count,
      savedAt: r.saved_at,
      compatibilityRange: '1.0.x',
      integrityHash: r.integrity_hash,
      domainChecksums: {},
      compressedBytes: r.compressed_bytes,
      corrupted: !fs.existsSync(r.file_path),
    }));
  }

  public verifyCheckpointFile(filePath: string): {
    valid: boolean;
    envelope?: CompressedCheckpointEnvelope;
    reasonAr?: string;
  } {
    try {
      if (!fs.existsSync(filePath)) {
        return { valid: false, reasonAr: 'ملف نقطة الفحص غير موجود على القرص.' };
      }
      const gz = fs.readFileSync(filePath);
      const jsonStr = zlib.gunzipSync(gz).toString('utf8');
      const envelope = JSON.parse(jsonStr) as CompressedCheckpointEnvelope;

      if (!envelope?.manifest || !envelope?.domains) {
        return { valid: false, reasonAr: 'بنية نقطة الفحص غير مكتملة.' };
      }
      if (envelope.manifest.schemaVersion.split('.')[0] !== SCHEMA_VERSION.split('.')[0]) {
        return {
          valid: false,
          reasonAr: `تعارض إصدار المخطط (${envelope.manifest.schemaVersion} مقابل ${SCHEMA_VERSION}).`,
        };
      }
      const actualHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(envelope.domains))
        .digest('hex');
      if (actualHash !== envelope.manifest.integrityHash) {
        return { valid: false, reasonAr: 'فشل التحقق من التوقيع الرقمي (ملف تالف).' };
      }
      return { valid: true, envelope };
    } catch (err) {
      return {
        valid: false,
        reasonAr: `تعذر فك ضغط أو قراءة نقطة الفحص: ${(err as Error).message}`,
      };
    }
  }

  public restoreLatestValidCheckpoint(
    engine: CivilizationSimulationEngine,
    specificCheckpointId?: string,
  ): {
    restored: boolean;
    manifest?: CheckpointManifest;
    rolledBackFromCorrupt?: string;
    reasonAr: string;
  } {
    if (!this.db) {
      return { restored: false, reasonAr: 'قاعدة البيانات غير متاحة.' };
    }
    const candidates = specificCheckpointId
      ? (this.db
          .prepare(`SELECT checkpoint_id, file_path FROM checkpoints WHERE checkpoint_id = ?`)
          .all(specificCheckpointId) as Array<{ checkpoint_id: string; file_path: string }>)
      : (this.db
          .prepare(`SELECT checkpoint_id, file_path FROM checkpoints ORDER BY saved_at DESC LIMIT 15`)
          .all() as Array<{ checkpoint_id: string; file_path: string }>);

    let corruptSkipped: string | undefined;

    for (const cand of candidates) {
      const check = this.verifyCheckpointFile(cand.file_path);
      if (!check.valid || !check.envelope) {
        if (!corruptSkipped) corruptSkipped = cand.checkpoint_id;
        continue;
      }
      engine.loadFromSeparatedDomains(check.envelope.domains);
      this.syncEngineStorageStats(engine);
      return {
        restored: true,
        manifest: check.envelope.manifest,
        rolledBackFromCorrupt: corruptSkipped,
        reasonAr: corruptSkipped
          ? `تم اكتشاف تلف في ${corruptSkipped} والتراجع تلقائياً إلى آخر نسخة سليمة (${cand.checkpoint_id}).`
          : `تمت استعادة نقطة الفحص السليمة (${cand.checkpoint_id}) بنجاح.`,
      };
    }

    return {
      restored: false,
      rolledBackFromCorrupt: corruptSkipped,
      reasonAr: 'لا توجد نقاط فحص سليمة للاستعادة.',
    };
  }

  public restoreKnowledgeDomainOnly(
    engine: CivilizationSimulationEngine,
    checkpointId: string,
  ): { restored: boolean; reasonAr: string } {
    if (!this.db) return { restored: false, reasonAr: 'قاعدة البيانات غير متاحة.' };
    const row = this.db
      .prepare(`SELECT file_path FROM checkpoints WHERE checkpoint_id = ?`)
      .get(checkpointId) as { file_path: string } | undefined;
    if (!row) return { restored: false, reasonAr: 'نقطة الفحص غير موجودة.' };
    const check = this.verifyCheckpointFile(row.file_path);
    if (!check.valid || !check.envelope) {
      return { restored: false, reasonAr: check.reasonAr ?? 'نقطة الفحص تالفة.' };
    }
    const d = check.envelope.domains;
    engine.collectiveMemory.experiences = d.collectiveExperiences ?? [];
    engine.collectiveMemory.knowledgeMap.clear();
    for (const k of d.civilizationKnowledge ?? []) {
      engine.collectiveMemory.knowledgeMap.set(k.entityKey, k);
    }
    engine.collectiveMemory.symbolsMap.clear();
    for (const s of d.symbols ?? []) {
      engine.collectiveMemory.symbolsMap.set(s.meaningKey, s);
    }
    return {
      restored: true,
      reasonAr: `تمت الاستعادة الجزئية لقطاع المعرفة والتجارب الجماعية من ${checkpointId}.`,
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
        if (fs.existsSync(row.file_path)) fs.unlinkSync(row.file_path);
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

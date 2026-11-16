import crypto from 'node:crypto';
import fs from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';

export const SERIALIZATION_VERSION = 'canonical-json-stream-v2';

const DEFAULT_BUFFER_LIMIT_BYTES = 64 * 1024; // 64 KB bounded chunk buffer

export class CanonicalSerializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalSerializationError';
  }
}

/**
 * Bounded-memory Canonical JSON Streaming Serializer.
 * - Sorts object keys lexicographically for deterministic hashing regardless of property insertion order.
 * - Preserves exact array ordering.
 * - Handles null, booleans, finite numbers, and Unicode strings via scalar JSON encoding only.
 * - Detects Circular References via active ancestor WeakSet.
 * - Rejects unsupported types (functions, symbols, bigints, NaN, Infinity, undefined in arrays) explicitly.
 * - Flushes incrementally in <= 64KB UTF-8 Buffer slices; never constructs a full-payload string.
 */
export function streamCanonicalJson(
  rootValue: unknown,
  onChunk: (chunk: Buffer) => void,
  bufferLimitBytes = DEFAULT_BUFFER_LIMIT_BYTES,
): void {
  const ancestors = new WeakSet<object>();
  let parts: string[] = [];
  let approxBytes = 0;

  const flush = () => {
    if (parts.length === 0) return;
    const str = parts.join('');
    parts = [];
    approxBytes = 0;
    if (str.length > 0) {
      onChunk(Buffer.from(str, 'utf8'));
    }
  };

  const pushToken = (token: string) => {
    parts.push(token);
    approxBytes += token.length;
    if (approxBytes >= bufferLimitBytes) {
      flush();
    }
  };

  const visit = (val: unknown, pathLabel: string): void => {
    if (val === null) {
      pushToken('null');
      return;
    }

    const t = typeof val;
    if (t === 'boolean') {
      pushToken(val ? 'true' : 'false');
      return;
    }

    if (t === 'number') {
      const num = val as number;
      if (!Number.isFinite(num)) {
        throw new CanonicalSerializationError(
          `Unsupported non-finite number (${String(num)}) at ${pathLabel}`,
        );
      }
      pushToken(Object.is(num, -0) ? '0' : String(num));
      return;
    }

    if (t === 'string') {
      const strVal = val as string;
      if (strVal.length > bufferLimitBytes) {
        flush();
        onChunk(Buffer.from(JSON.stringify(strVal), 'utf8'));
      } else {
        pushToken(JSON.stringify(strVal));
      }
      return;
    }

    if (t === 'undefined') {
      throw new CanonicalSerializationError(
        `Unsupported undefined value at ${pathLabel} (must be null or omitted object property)`,
      );
    }

    if (t === 'function' || t === 'symbol' || t === 'bigint') {
      throw new CanonicalSerializationError(`Unsupported type '${t}' at ${pathLabel}`);
    }

    const obj = val as object;

    if (typeof (obj as { toJSON?: unknown }).toJSON === 'function') {
      const converted = (obj as { toJSON: () => unknown }).toJSON();
      visit(converted, pathLabel);
      return;
    }

    if (ancestors.has(obj)) {
      throw new CanonicalSerializationError(`Circular reference detected at ${pathLabel}`);
    }

    ancestors.add(obj);
    try {
      if (Array.isArray(obj)) {
        pushToken('[');
        for (let i = 0; i < obj.length; i++) {
          if (i > 0) pushToken(',');
          const item = obj[i];
          if (item === undefined) {
            throw new CanonicalSerializationError(
              `Unsupported undefined element in array at ${pathLabel}[${i}]`,
            );
          }
          visit(item, `${pathLabel}[${i}]`);
        }
        pushToken(']');
        return;
      }

      if (obj instanceof Map || obj instanceof Set || obj instanceof RegExp) {
        throw new CanonicalSerializationError(
          `Unsupported built-in container '${obj.constructor.name}' at ${pathLabel}; convert to plain object or array first`,
        );
      }

      const record = obj as Record<string, unknown>;
      const keys = Object.keys(record)
        .filter((k) => record[k] !== undefined)
        .sort();

      pushToken('{');
      for (let i = 0; i < keys.length; i++) {
        if (i > 0) pushToken(',');
        const k = keys[i];
        pushToken(JSON.stringify(k));
        pushToken(':');
        visit(record[k], `${pathLabel}.${k}`);
      }
      pushToken('}');
    } finally {
      ancestors.delete(obj);
    }
  };

  visit(rootValue, '$');
  flush();
}

/**
 * Incremental SHA-256 over canonical streaming serialization.
 * Never creates a single full-payload string or full-payload Buffer.
 */
export function computeCanonicalSha256(data: unknown): {
  sha256: string;
  byteLength: number;
} {
  const hash = crypto.createHash('sha256');
  let byteLength = 0;

  streamCanonicalJson(data, (chunk) => {
    byteLength += chunk.length;
    hash.update(chunk);
  });

  return {
    sha256: hash.digest('hex'),
    byteLength,
  };
}

/**
 * Streams items as canonical NDJSON into a gzipped chunk file, tracking both raw (uncompressed)
 * SHA-256 and compressed SHA-256 in bounded memory without building a giant string.
 */
export async function writeCanonicalNdjsonGzipChunk(
  items: unknown[],
  outFilePath: string,
): Promise<{
  rawBytes: number;
  rawSha256: string;
  compressedBytes: number;
  compressedSha256: string;
}> {
  const rawHash = crypto.createHash('sha256');
  const compHash = crypto.createHash('sha256');
  let rawBytes = 0;
  let compressedBytes = 0;

  async function* generateChunks(): AsyncGenerator<Buffer> {
    const nl = Buffer.from('\n', 'utf8');
    for (let i = 0; i < items.length; i++) {
      const pending: Buffer[] = [];
      streamCanonicalJson(items[i], (buf) => {
        rawBytes += buf.length;
        rawHash.update(buf);
        pending.push(buf);
      });
      for (const buf of pending) {
        yield buf;
      }
      rawBytes += nl.length;
      rawHash.update(nl);
      yield nl;
    }
  }

  const gzipStream = zlib.createGzip({ level: 6 });
  const hashTap = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      compressedBytes += chunk.length;
      compHash.update(chunk);
      callback(null, chunk);
    },
  });

  const writeStream = fs.createWriteStream(outFilePath);
  await pipeline(generateChunks(), gzipStream, hashTap, writeStream);

  return {
    rawBytes,
    rawSha256: rawHash.digest('hex'),
    compressedBytes,
    compressedSha256: compHash.digest('hex'),
  };
}

/**
 * Streams, verifies both compressed & decompressed SHA-256 hashes, and parses NDJSON records
 * from a gzipped chunk file with bounded memory.
 */
export async function readAndVerifyCanonicalNdjsonGzipChunk<T = unknown>(
  filePath: string,
  expectedCompressedSha256?: string,
  expectedRawSha256?: string,
  expectedCompressedBytes?: number,
): Promise<{
  items: T[];
  rawBytes: number;
  rawSha256: string;
  compressedBytes: number;
  compressedSha256: string;
}> {
  const stat = fs.statSync(filePath);
  if (expectedCompressedBytes !== undefined && stat.size !== expectedCompressedBytes) {
    throw new Error(
      `Compressed size mismatch for ${filePath}: expected ${expectedCompressedBytes}, got ${stat.size}`,
    );
  }

  const compHash = crypto.createHash('sha256');
  const rawHash = crypto.createHash('sha256');
  let compressedBytes = 0;
  let rawBytes = 0;
  const items: T[] = [];
  let lineBuffer = '';

  const compTap = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      compressedBytes += chunk.length;
      compHash.update(chunk);
      cb(null, chunk);
    },
  });

  const rawTap = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      rawBytes += chunk.length;
      rawHash.update(chunk);
      lineBuffer += chunk.toString('utf8');
      let nlIdx = lineBuffer.indexOf('\n');
      while (nlIdx !== -1) {
        const line = lineBuffer.slice(0, nlIdx);
        lineBuffer = lineBuffer.slice(nlIdx + 1);
        if (line.length > 0) {
          items.push(JSON.parse(line) as T);
        }
        nlIdx = lineBuffer.indexOf('\n');
      }
      cb(null);
    },
    flush(cb) {
      if (lineBuffer.trim().length > 0) {
        items.push(JSON.parse(lineBuffer) as T);
        lineBuffer = '';
      }
      cb(null);
    },
  });

  await pipeline(fs.createReadStream(filePath), compTap, zlib.createGunzip(), rawTap);

  const actualCompSha = compHash.digest('hex');
  const actualRawSha = rawHash.digest('hex');

  if (expectedCompressedSha256 && actualCompSha !== expectedCompressedSha256) {
    throw new Error(`Compressed SHA-256 mismatch for ${filePath}`);
  }
  if (expectedRawSha256 && actualRawSha !== expectedRawSha256) {
    throw new Error(`Uncompressed raw SHA-256 mismatch for ${filePath}`);
  }

  return {
    items,
    rawBytes,
    rawSha256: actualRawSha,
    compressedBytes,
    compressedSha256: actualCompSha,
  };
}

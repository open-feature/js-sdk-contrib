import type { FlagMetadata } from '@openfeature/core';
import { getLoggerFromContext } from './common';
import type { EvaluationContextWithLogger } from './common';

export const resolveRule = 'resolve';

// flag-set metadata keys a rule can't override
const reservedMetadataKeys = new Set(['flagSetId', 'version']);

// reasons a rule can't claim; they fall back to TARGETING_MATCH
const reservedReasons = new Set(['ERROR', 'DISABLED', 'DEFAULT', 'FALLBACK', 'STATIC', 'CACHED', 'STALE', 'UNKNOWN']);

// only the operator creates instances, so evaluation context data (plain JSON) can't forge one
export class ResolveResult {
  constructor(
    readonly variant: string,
    readonly reason?: string,
    readonly metadata?: FlagMetadata,
  ) {}
}

/**
 * [variant, reason?, metadata?]; arguments arrive already evaluated.
 * Malformed arguments return null, like the other custom operators, so the flag falls back to its default variant.
 */
export function resolve(data: unknown, context: EvaluationContextWithLogger): ResolveResult | null {
  try {
    return parseResolve(data, context);
  } catch (err) {
    getLoggerFromContext(context).debug(`Invalid ${resolveRule} configuration: ${(err as Error).message}`);
    return null;
  }
}

function parseResolve(data: unknown, context: EvaluationContextWithLogger): ResolveResult {
  if (!Array.isArray(data) || data.length < 1 || data.length > 3) {
    throw new Error('arguments must be an array of 1 to 3 items');
  }
  const [variant, reason, metadata] = data;

  // coerced like plain targeting results (true -> "true", 1 -> "1"); literal numbers are rejected by the schema
  if (typeof variant !== 'string' && typeof variant !== 'boolean' && !Number.isFinite(variant)) {
    throw new Error('variant must be a string, boolean, or finite number');
  }
  if (reason !== undefined && reason !== null && typeof reason !== 'string') {
    throw new Error('reason must be a string or null');
  }

  const effectiveReason = reason != null && !reservedReasons.has(reason) ? reason : undefined;
  return new ResolveResult(String(variant), effectiveReason, parseMetadata(metadata, context));
}

function parseMetadata(pairs: unknown, context: EvaluationContextWithLogger): FlagMetadata | undefined {
  if (pairs === undefined || pairs === null) {
    return undefined;
  }
  if (!Array.isArray(pairs)) {
    throw new Error('metadata must be an array of [key, value] pairs');
  }

  const metadata: Record<string, string | number | boolean> = Object.create(null);
  for (const pair of pairs) {
    if (!Array.isArray(pair) || pair.length !== 2) {
      throw new Error('metadata pair must be a [key, value] array');
    }
    const [key, value] = pair;
    if (typeof key !== 'string') {
      throw new Error('metadata key must be a string');
    }
    // non-finite numbers (e.g. a computed 1/0) can't be serialized to JSON
    if (typeof value !== 'string' && typeof value !== 'boolean' && !Number.isFinite(value)) {
      throw new Error('metadata value must be a string, finite number, or boolean');
    }
    // literal reserved keys are rejected by the schema; computed ones are dropped here
    if (reservedMetadataKeys.has(key)) {
      getLoggerFromContext(context).debug(`Ignoring reserved metadata key '${key}' in ${resolveRule}`);
      continue;
    }
    metadata[key] = value;
  }
  return metadata;
}

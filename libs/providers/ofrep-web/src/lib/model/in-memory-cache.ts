import type { FlagMetadata } from '@openfeature/web-sdk';
import type { EvaluationResponse } from '@openfeature/ofrep-core';

/**
 * Cache of flag values from bulk evaluation.
 */
export type FlagCache = { [key: string]: EvaluationResponse };

/**
 * Cache of metadata from bulk evaluation.
 */
export type MetadataCache = FlagMetadata;

import type { FlagMetadata, FlagValue, ResolutionDetails } from '@openfeature/web-sdk';
import type { ResolutionError } from './resolution-error';

/**
 * Cache of flag values from bulk evaluation.
 */
export type FlagCache = { [key: string]: ResolutionDetails<FlagValue> | ResolutionError };

/**
 * Cache of metadata from bulk evaluation.
 */
export type MetadataCache = FlagMetadata;

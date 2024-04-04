import { FlagValue, ResolutionDetails } from '@openfeature/web-sdk';
import { ResolutionError } from './resolution-error';

/**
 * inMemoryCache is a type representing the internal cache of the flags.
 */
export type inMemoryCache = { [key: string]: ResolutionDetails<FlagValue> | ResolutionError };

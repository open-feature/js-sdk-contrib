import { FlagValue, ResolutionDetails } from '@openfeature/web-sdk';
import { ResolutionError } from './resolution-error';

/**
 * FlagCache is a type representing the internal cache of the flags.
 */
export type FlagCache = { [key: string]: ResolutionDetails<FlagValue> | ResolutionError };

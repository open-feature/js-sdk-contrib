import type { JsonValue } from '@openfeature/server-sdk';
import type { Flag } from './flag';
import type { FlagContext } from './flag-context';

/**
 * Represents the input to the WASM module, containing the flag key, flag, evaluation context, and flag context.
 */
export interface WasmInput {
  /**
   * Flag key to be evaluated.
   */
  flagKey: string;

  /**
   * Flag to be evaluated.
   */
  flag: Flag;

  /**
   * Evaluation context for a flag evaluation.
   */
  evalContext: Record<string, JsonValue>;

  /**
   * Flag context containing default SDK value and evaluation context enrichment.
   */
  flagContext: FlagContext;
}

/**
 * WebWorker-mode wrapper for FlagdCore. Used by the restricted Jest project
 * (via moduleNameMapper) so that existing tests exercise
 * { disableDynamicCodeGeneration: true } without modification.
 */
import { FlagdCore as _FlagdCore } from '../../src/lib/flagd-core';
import type { Storage } from '../../src/lib/storage';
import type { Logger } from '@openfeature/core';

export class FlagdCore extends _FlagdCore {
  constructor(storage?: Storage, logger?: Logger) {
    super(storage, logger, { disableDynamicCodeGeneration: true });
  }
}

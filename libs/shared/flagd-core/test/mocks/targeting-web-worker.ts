/**
 * Edge runtime wrapper for Targeting. Used by the restricted Jest project
 * (via moduleNameMapper) so that existing tests exercise
 * { disableDynamicCodeGeneration: true } without modification.
 */
import { Targeting as _Targeting } from '../../src/lib/targeting/targeting';
import type { Logger } from '@openfeature/core';

export class Targeting extends _Targeting {
  constructor(logic: unknown, logger: Logger) {
    super(logic, logger, { disableDynamicCodeGeneration: true });
  }
}

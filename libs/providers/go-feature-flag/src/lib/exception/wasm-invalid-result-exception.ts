import { GoFeatureFlagException } from './go-feature-flag-exception';

/**
 * Exception thrown when the WASM module returns an invalid result.
 */
export class WasmInvalidResultException extends GoFeatureFlagException {
  constructor(message: string) {
    super(message);
    this.name = 'WasmInvalidResultException';
  }
}

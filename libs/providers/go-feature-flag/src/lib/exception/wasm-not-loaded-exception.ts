import { GoFeatureFlagException } from './go-feature-flag-exception';

/**
 * Exception thrown when the WASM module cannot be loaded.
 */
export class WasmNotLoadedException extends GoFeatureFlagException {
  constructor(message: string) {
    super(message);
    this.name = 'WasmNotLoadedException';
  }
}

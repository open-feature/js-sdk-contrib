import { GoFeatureFlagException } from './go-feature-flag-exception';

/**
 * Exception thrown when a required WASM function is not found.
 */
export class WasmFunctionNotFoundException extends GoFeatureFlagException {
  constructor(functionName: string) {
    super(`WASM function '${functionName}' not found`);
    this.name = 'WasmFunctionNotFoundException';
  }
}

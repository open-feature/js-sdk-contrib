import type { EvaluationResponse } from '../model/evaluation-response';
import type { WasmInput } from '../model/wasm-input';
import { WasmNotLoadedException, WasmFunctionNotFoundException, WasmInvalidResultException } from '../exception';
import './wasm_exec.js';
import type { Logger } from '@openfeature/server-sdk';
import * as fs from 'fs';
import * as path from 'path';

/**
 * EvaluationWasm is a class that represents the evaluation of a feature flag
 * it calls an external WASM module to evaluate the feature flag.
 */
export class EvaluateWasm {
  private readonly WASM_MODULE_PATH = path.join('wasm-module', 'gofeatureflag-evaluation.wasm');
  private wasmMemory: WebAssembly.Memory | null = null;
  private wasmExports: WebAssembly.Exports | null = null;
  private readonly go: Go;
  private readonly logger?: Logger;
  private readonly wasmBinaryPath?: string;

  /**
   * Constructor of the EvaluationWasm. It initializes the WASM module and the host functions.
   * @param logger - Logger instance
   * @param wasmBinaryPath - Optional path to the WASM binary file
   */
  constructor(logger?: Logger, wasmBinaryPath?: string) {
    this.logger = logger;
    this.wasmBinaryPath = wasmBinaryPath;
    this.go = new Go();
  }

  /**
   * Initializes the WASM module.
   * In a real implementation, this would load the WASM binary and instantiate it.
   */
  public async initialize(): Promise<void> {
    try {
      // Load the WASM binary
      const wasmBuffer = await this.loadWasmBinary();

      // Instantiate the WebAssembly module
      const wasm = await WebAssembly.instantiate(wasmBuffer, this.go.importObject);

      // Run the Go runtime
      this.go.run(wasm.instance);

      // Store the instance and exports
      this.wasmExports = wasm.instance.exports;

      // Get the required exports
      this.wasmMemory = this.wasmExports['memory'] as WebAssembly.Memory;

      // Verify required functions exist
      if (!this.wasmExports['malloc'] || !this.wasmExports['free'] || !this.wasmExports['evaluate']) {
        throw new WasmFunctionNotFoundException('Required WASM functions not found');
      }
    } catch (error) {
      if (error instanceof WasmNotLoadedException || error instanceof WasmFunctionNotFoundException) {
        throw error;
      }
      throw new WasmNotLoadedException(
        `Failed to load WASM module: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  public async dispose(): Promise<void> {
    try {
      // Clean up WASM memory and resources
      if (this.wasmExports && this.wasmExports['free']) {
        // If there are any remaining allocated pointers, free them
        // This is a safety measure in case some memory wasn't freed during evaluation
        this.wasmExports['free'] as (ptr: number) => void;
        // Note: We can't track all allocated pointers easily, so this is mainly for cleanup
      }
      this.wasmMemory = null;
      this.wasmExports = null;
      if (this.go && typeof this.go.exit === 'function') {
        try {
          this.go.exit(0);
        } catch (error) {
          // Ignore errors during Go runtime cleanup
        }
      }
    } catch (error) {
      this.logger?.warn('Error during WASM disposal:', error);
    }
  }

  /**
   * Loads the WASM binary file.
   * @returns Promise<ArrayBuffer> - The WASM binary data
   */
  private async loadWasmBinary(): Promise<ArrayBuffer> {
    try {
      const attemptedPaths: string[] = [];
      const wasmPath = this.resolveWasmPath(attemptedPaths);

      if (!wasmPath) {
        throw new Error(`WASM file not found. Tried: ${attemptedPaths.join(', ')}`);
      }

      const buffer = fs.readFileSync(wasmPath);
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      return arrayBuffer as ArrayBuffer;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger?.error(`Failed to load WASM binary: ${errorMessage}`, error);
      throw new WasmNotLoadedException(`Failed to load WASM binary: ${errorMessage}`);
    }
  }

  /**
   * Resolves the WASM file path using multiple strategies.
   * @param attemptedPaths - Array to collect attempted paths for error reporting
   * @returns The resolved path or null if not found
   */
  private resolveWasmPath(attemptedPaths: string[]): string | null {
    // Strategy 0: Use the custom path if provided
    const customPath = this.tryCustomPath(attemptedPaths);
    if (customPath) return customPath;

    // Strategy 1: Try relative to current file
    const relativePath = this.tryRelativePath(attemptedPaths);
    if (relativePath) return relativePath;

    // Strategy 2: Try node_modules resolution
    const nodeModulesPath = this.tryNodeModulesPath(attemptedPaths);
    if (nodeModulesPath) return nodeModulesPath;

    // Strategy 3: Try require.resolve fallback
    return this.tryRequireResolvePath(attemptedPaths);
  }

  /**
   * Tries to resolve WASM path from custom configured path.
   */
  private tryCustomPath(attemptedPaths: string[]): string | null {
    if (!this.wasmBinaryPath) return null;
    attemptedPaths.push(this.wasmBinaryPath);
    return fs.existsSync(this.wasmBinaryPath) ? this.wasmBinaryPath : null;
  }

  /**
   * Tries to resolve WASM path relative to current file.
   */
  private tryRelativePath(attemptedPaths: string[]): string | null {
    const currentDir = fs.realpathSync(__dirname);
    const relativePath = path.join(currentDir, this.WASM_MODULE_PATH);
    attemptedPaths.push(relativePath);
    return fs.existsSync(relativePath) ? relativePath : null;
  }

  /**
   * Tries to resolve WASM path from node_modules.
   */
  private tryNodeModulesPath(attemptedPaths: string[]): string | null {
    try {
      const currentDir = fs.realpathSync(__dirname);
      const nodeModulesPathStr = path.sep + 'node_modules' + path.sep;
      const nodeModulesIndex = currentDir.indexOf(nodeModulesPathStr);

      if (nodeModulesIndex === -1) return null;

      const packageName = this.extractPackageName(currentDir, nodeModulesIndex, nodeModulesPathStr);
      const nodeModulesDir = currentDir.substring(0, nodeModulesIndex + nodeModulesPathStr.length);
      const packageRoot = path.join(nodeModulesDir, packageName);

      const nodeModulesPath = path.join(packageRoot, this.WASM_MODULE_PATH);
      attemptedPaths.push(nodeModulesPath);
      return fs.existsSync(nodeModulesPath) ? nodeModulesPath : null;
    } catch {
      return null;
    }
  }

  /**
   * Extracts the package name from a node_modules path.
   */
  private extractPackageName(currentDir: string, nodeModulesIndex: number, nodeModulesPathStr: string): string {
    const fromNodeModules = currentDir.substring(nodeModulesIndex + nodeModulesPathStr.length);
    const parts = fromNodeModules.split(path.sep);
    if (parts[0].startsWith('@') && parts.length > 1) {
      return `${parts[0]}/${parts[1]}`;
    }
    return parts[0];
  }

  /**
   * Tries to resolve WASM path using require.resolve.
   */
  private tryRequireResolvePath(attemptedPaths: string[]): string | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const packageName = require('../../../package.json').name;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const packageJsonPath = require.resolve(`${packageName}/package.json`);
      const packageRoot = fs.realpathSync(path.dirname(packageJsonPath));
      const resolvedPath = path.join(packageRoot, this.WASM_MODULE_PATH);
      attemptedPaths.push(resolvedPath);
      return fs.existsSync(resolvedPath) ? resolvedPath : null;
    } catch {
      return null;
    }
  }

  /**
   * Evaluates a feature flag using the WASM module.
   * @param wasmInput - The input data for the evaluation
   * @returns A Promise<EvaluationResponse> - A ResolutionDetails of the feature flag
   * @throws WasmInvalidResultException - If for any reasons we have an issue calling the wasm module.
   */
  public async evaluate(wasmInput: WasmInput): Promise<EvaluationResponse> {
    try {
      // Ensure WASM is initialized
      if (!this.wasmExports || !this.wasmMemory) {
        await this.initialize();
      }

      // Serialize the input to JSON
      const wasmInputAsStr = JSON.stringify(wasmInput);

      // Copy input to WASM memory
      const inputPtr = this.copyToMemory(wasmInputAsStr);

      try {
        // Call the WASM evaluate function
        const evaluateRes = this.callWasmEvaluate(inputPtr, wasmInputAsStr.length);

        // Read the result from WASM memory
        const resAsString = this.readFromMemory(evaluateRes);

        // Deserialize the response
        const goffResp = JSON.parse(resAsString) as EvaluationResponse;

        if (!goffResp) {
          throw new WasmInvalidResultException('Deserialization of EvaluationResponse failed.');
        }
        return goffResp;
      } finally {
        // Free the allocated memory
        if (inputPtr !== 0) {
          this.callWasmFree(inputPtr);
        }
      }
    } catch (error) {
      // Return error response if WASM evaluation fails
      return {
        errorCode: 'GENERAL',
        reason: 'ERROR',
        errorDetails: error instanceof Error ? error.message : 'Unknown error',
      } as EvaluationResponse;
    }
  }

  /**
   * Calls the WASM evaluate function.
   * @param inputPtr - Pointer to the input string in WASM memory
   * @param inputLength - Length of the input string
   * @returns The result from the WASM evaluate function
   */
  private callWasmEvaluate(inputPtr: number, inputLength: number): bigint {
    if (!this.wasmExports) {
      throw new WasmFunctionNotFoundException('evaluate');
    }

    const evaluateFunction = this.wasmExports['evaluate'] as (ptr: number, length: number) => bigint;
    if (!evaluateFunction) {
      throw new WasmFunctionNotFoundException('evaluate');
    }

    const result = evaluateFunction(inputPtr, inputLength);
    if (typeof result !== 'bigint') {
      throw new WasmInvalidResultException('Evaluate should return a bigint value.');
    }

    return result;
  }

  /**
   * Calls the WASM free function.
   * @param ptr - Pointer to free in WASM memory
   */
  private callWasmFree(ptr: number): void {
    if (!this.wasmExports) {
      throw new WasmFunctionNotFoundException('free');
    }

    const freeFunction = this.wasmExports['free'] as (ptr: number) => void;
    if (!freeFunction) {
      throw new WasmFunctionNotFoundException('free');
    }

    freeFunction(ptr);
  }

  /**
   * Copies the input string to the WASM memory and returns the pointer to the memory location.
   * @param inputString - string to put in memory
   * @returns the address location of this string
   * @throws WasmInvalidResultException - If for any reasons we have an issue calling the wasm module.
   */
  private copyToMemory(inputString: string): number {
    if (!this.wasmExports) {
      throw new WasmFunctionNotFoundException('malloc');
    }

    // Allocate memory in the Wasm module for the input string.
    const mallocFunction = this.wasmExports['malloc'] as (size: number) => number;
    if (!mallocFunction) {
      throw new WasmFunctionNotFoundException('malloc');
    }

    const ptr = mallocFunction(inputString.length + 1);
    if (typeof ptr !== 'number') {
      throw new WasmInvalidResultException('Malloc should return a number value.');
    }

    // Write the string to WASM memory
    this.writeStringToMemory(ptr, inputString);
    return ptr;
  }

  /**
   * Writes a string to WASM memory.
   * @param ptr - Pointer to write to
   * @param str - String to write
   */
  private writeStringToMemory(ptr: number, str: string): void {
    if (!this.wasmMemory) {
      throw new WasmInvalidResultException('WASM memory not available.');
    }

    const buffer = new Uint8Array(this.wasmMemory.buffer);
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);

    for (let i = 0; i < bytes.length; i++) {
      buffer[ptr + i] = bytes[i];
    }
    buffer[ptr + bytes.length] = 0; // Null terminator
  }

  /**
   * Reads the output string from the WASM memory based on the result of the evaluation.
   * @param evaluateRes - result of the evaluate function
   * @returns A string containing the output of the evaluate function
   * @throws WasmInvalidResultException - If for any reasons we have an issue calling the wasm module.
   */
  private readFromMemory(evaluateRes: bigint): string {
    // In the .NET implementation, the result is packed as:
    // Higher 32 bits for pointer, lower 32 bits for length
    const MASK = BigInt(2 ** 32) - BigInt(1);
    const ptr = Number(evaluateRes >> BigInt(32)) & 0xffffffff; // Higher 32 bits for a pointer
    const outputStringLength = Number(evaluateRes & MASK); // Lower 32 bits for length

    if (ptr === 0 || outputStringLength === 0) {
      throw new WasmInvalidResultException('Output string pointer or length is invalid.');
    }

    if (!this.wasmMemory) {
      throw new WasmInvalidResultException('WASM memory not available.');
    }

    const buffer = new Uint8Array(this.wasmMemory.buffer);
    const bytes = new Uint8Array(outputStringLength);

    for (let i = 0; i < outputStringLength; i++) {
      bytes[i] = buffer[ptr + i];
    }

    const decoder = new TextDecoder();
    return decoder.decode(bytes);
  }
}

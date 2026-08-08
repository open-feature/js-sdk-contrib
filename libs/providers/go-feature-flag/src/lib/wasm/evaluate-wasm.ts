import type { EvaluationResponse } from '../model/evaluation-response';
import type { WasmInput } from '../model/wasm-input';
import { WasmNotLoadedException, WasmFunctionNotFoundException, WasmInvalidResultException } from '../exception';
import './wasm_exec.js';
import type { Logger } from '@openfeature/server-sdk';
import * as fs from 'fs';
import * as path from 'path';

/**
 * The exports the host requires from the module. `memory` belongs here as much as the three
 * functions: every read and write goes through it, so an instance without it cannot evaluate.
 */
const REQUIRED_WASM_EXPORTS = ['memory', 'malloc', 'free', 'evaluate'] as const;

/** Selects the low 32 bits of a 64-bit value. Kept as a BigInt so masking never leaves that domain. */
const LOW_32_BITS = (BigInt(1) << BigInt(32)) - BigInt(1);

/**
 * Unpacks the `i64` returned by `evaluate` into the output pointer and its length.
 *
 * Both halves are masked *before* the conversion to `Number`. Converting first and masking with `&`
 * coerces the operand to a **signed** 32-bit integer, so a pointer at or above `0x80000000` (2 GiB)
 * comes back negative and indexes outside the linear memory.
 * @param packed - the packed result: pointer in the high 32 bits, length in the low 32 bits
 * @returns the pointer and length, both non-negative across the whole 32-bit range
 */
export function unpackEvaluateResult(packed: bigint): { ptr: number; length: number } {
  return {
    ptr: Number((packed >> BigInt(32)) & LOW_32_BITS),
    length: Number(packed & LOW_32_BITS),
  };
}

/**
 * EvaluationWasm is a class that represents the evaluation of a feature flag
 * it calls an external WASM module to evaluate the feature flag.
 */
export class EvaluateWasm {
  private readonly WASM_MODULE_PATH = path.join('wasm-module', 'gofeatureflag-evaluation.wasm');
  private wasmMemory: WebAssembly.Memory | null = null;
  private wasmExports: WebAssembly.Exports | null = null;
  /** Replaced on each instantiation: a Go runtime is bound to the instance it was started with. */
  private go: Go;
  /** The instantiation currently in flight, shared by every concurrent caller of initialize(). */
  private initialization: Promise<void> | null = null;
  private readonly logger?: Logger;
  private readonly wasmBinaryPath?: string;
  private readonly encoder: TextEncoder;

  /**
   * Constructor of the EvaluationWasm. It initializes the WASM module and the host functions.
   * @param logger - Logger instance
   * @param wasmBinaryPath - Optional path to the WASM binary file
   */
  constructor(logger?: Logger, wasmBinaryPath?: string) {
    this.logger = logger;
    this.wasmBinaryPath = wasmBinaryPath;
    this.go = new Go();
    this.encoder = new TextEncoder();
  }

  /**
   * Initializes the WASM module.
   *
   * Concurrent callers share one instantiation. `evaluate` initializes lazily, so any number of
   * evaluations can arrive here together - most readily right after a fault, because
   * discardInstance() clears the instance and every in-flight evaluation then rebuilds it. Left
   * unserialized, each of them instantiates its own module and only the last one survives, which
   * leaks the rest.
   */
  public async initialize(): Promise<void> {
    // Already holding a live instance. Instantiating a second one would abandon the first without
    // disposing it, leaking its linear memory and its Go runtime for the lifetime of the process.
    // dispose() clears these fields, so a deliberate rebuild still goes through.
    if (this.wasmExports && this.wasmMemory) {
      return;
    }

    // Latecomers await the instantiation already running rather than starting another. Cleared in
    // the finally below whether it succeeded or failed, so a failed load can be retried.
    if (this.initialization) {
      return this.initialization;
    }

    this.initialization = this.instantiate();
    try {
      await this.initialization;
    } finally {
      this.initialization = null;
    }
  }

  /**
   * Builds one WASM instance and stores it. Never call this directly - go through initialize(),
   * which is what guarantees only one of these runs at a time.
   */
  private async instantiate(): Promise<void> {
    try {
      // Load the WASM binary
      const wasmBuffer = await this.loadWasmBinary();

      // Instantiate the WebAssembly module
      // A fresh runtime per instantiation. The Go runtime holds references into the instance it was
      // started with, so reusing one across a rebuild would point the new module at the old memory.
      // Kept local until the instance it belongs to is ready: assigning `this.go` before the await
      // would publish a runtime that is not yet bound to anything.
      const go = new Go();

      const wasm = await WebAssembly.instantiate(wasmBuffer, go.importObject);
      const exports = wasm.instance.exports;

      // Checked before the runtime is started and before anything is stored. Storing first and
      // checking after leaves `wasmExports` set with `wasmMemory` undefined, which `evaluate` reads
      // as "not initialized" - so it would re-instantiate the module on every call instead of
      // failing, and surface the absence much later as "WASM memory not available".
      const missing = REQUIRED_WASM_EXPORTS.filter((name) => !exports[name]);
      if (missing.length > 0) {
        throw new WasmFunctionNotFoundException(missing.join(', '));
      }

      // Run the Go runtime
      go.run(wasm.instance);

      // Store the instance, its runtime and its exports together: they only make sense as a set.
      this.go = go;
      this.wasmExports = exports;
      this.wasmMemory = exports['memory'] as WebAssembly.Memory;
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

      const buffer = await fs.promises.readFile(wasmPath);
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
    if (!this.wasmBinaryPath) {
      this.logger?.debug('No custom path provided, continuing to next strategy.');
      return null;
    }
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

      if (nodeModulesIndex === -1) {
        this.logger?.debug('Node modules path not found, continuing to next strategy.');
        return null;
      }

      const packageName = this.extractPackageName(currentDir, nodeModulesIndex, nodeModulesPathStr);
      const nodeModulesDir = currentDir.substring(0, nodeModulesIndex + nodeModulesPathStr.length);
      const packageRoot = path.join(nodeModulesDir, packageName);

      const nodeModulesPath = path.join(packageRoot, this.WASM_MODULE_PATH);
      attemptedPaths.push(nodeModulesPath);
      return fs.existsSync(nodeModulesPath) ? nodeModulesPath : null;
    } catch (error) {
      this.logger?.debug('Error during node_modules path resolution, continuing to next strategy.', error);
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
    } catch (error) {
      this.logger?.debug('Error during require.resolve path resolution, continuing to next strategy.', error);
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
      const wasmInputSerialized = this.encoder.encode(JSON.stringify(wasmInput));

      // malloc and evaluate both run guest code, so a fault in either leaves the instance poisoned.
      const inputPtr = this.callGuest(() => this.copyToMemory(wasmInputSerialized));
      const evaluateRes = this.callGuest(() => this.callWasmEvaluate(inputPtr, wasmInputSerialized.length));

      // Read the output before any further call into the instance. The output buffer belongs to the
      // module's garbage collector and is pinned only until the next call - and free is such a call,
      // so freeing first would be a use-after-free that returns reclaimed memory intermittently.
      let resAsString: string;
      try {
        resAsString = this.readFromMemory(evaluateRes);
      } finally {
        // Reached only when evaluate returned rather than trapped, so the instance is healthy and
        // the input allocation must be released whether or not the output could be read.
        this.callGuest(() => this.callWasmFree(inputPtr));
      }

      const goffResp = JSON.parse(resAsString) as EvaluationResponse;
      if (!goffResp) {
        throw new WasmInvalidResultException('Deserialization of EvaluationResponse failed.');
      }
      return goffResp;
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
   * Runs a call into the WASM instance, discarding the instance if it faults.
   *
   * A trap does not unwind the module's shadow-stack pointer, so a trapped instance is permanently
   * poisoned: reusing it yields non-deterministic results and faults inside malloc at wrapped
   * addresses. Discarding here is what makes the next evaluation rebuild instead.
   * @param call - the call into the instance
   * @returns whatever the call returns
   * @throws the original fault, after the instance has been discarded
   */
  private callGuest<T>(call: () => T): T {
    try {
      return call();
    } catch (error) {
      // Deliberately nothing else is run on the instance on the way out - not even free. Running
      // further guest code faults again and replaces the original error with that second fault.
      this.discardInstance();
      throw error;
    }
  }

  /**
   * Drops the current instance so that the next evaluation builds a fresh one.
   */
  private discardInstance(): void {
    this.logger?.warn('Discarding the WASM instance after a fault; the next evaluation will rebuild it');
    this.wasmMemory = null;
    this.wasmExports = null;
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
  private copyToMemory(inputBytes: Uint8Array): number {
    if (!this.wasmExports) {
      throw new WasmFunctionNotFoundException('malloc');
    }

    // Allocate memory in the Wasm module for the input string.
    const mallocFunction = this.wasmExports['malloc'] as (size: number) => number;
    if (!mallocFunction) {
      throw new WasmFunctionNotFoundException('malloc');
    }

    const ptr = mallocFunction(inputBytes.length + 1);
    if (typeof ptr !== 'number') {
      throw new WasmInvalidResultException('Malloc should return a number value.');
    } else if (ptr === 0) {
      throw new WasmInvalidResultException('Failed to allocate memory in WASM module.');
    }

    // Write the string to WASM memory
    this.writeStringToMemory(ptr, inputBytes);
    return ptr;
  }

  /**
   * Writes a string to WASM memory.
   * @param ptr - Pointer to write to
   * @param str - String to write
   */
  private writeStringToMemory(ptr: number, bytes: Uint8Array): void {
    if (!this.wasmMemory) {
      throw new WasmInvalidResultException('WASM memory not available.');
    }

    const buffer = new Uint8Array(this.wasmMemory.buffer);

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
    const { ptr, length: outputStringLength } = unpackEvaluateResult(evaluateRes);

    if (ptr === 0 || outputStringLength === 0) {
      throw new WasmInvalidResultException('Output string pointer or length is invalid.');
    }

    if (!this.wasmMemory) {
      throw new WasmInvalidResultException('WASM memory not available.');
    }

    const buffer = new Uint8Array(this.wasmMemory.buffer);

    // Out-of-range indices on a typed array read as `undefined`, which stores as 0 - so without
    // this the caller gets a run of NUL bytes and an opaque JSON parse error instead of the real
    // fault. The bound is re-read here because a call into the guest can have grown the memory.
    if (ptr + outputStringLength > buffer.length) {
      throw new WasmInvalidResultException(
        `Output string [${ptr}, ${ptr + outputStringLength}) falls outside the WASM memory of ${buffer.length} bytes.`,
      );
    }

    const bytes = new Uint8Array(outputStringLength);

    for (let i = 0; i < outputStringLength; i++) {
      bytes[i] = buffer[ptr + i];
    }

    const decoder = new TextDecoder();
    return decoder.decode(bytes);
  }
}

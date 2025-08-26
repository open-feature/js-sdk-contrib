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
  private wasmInstance: WebAssembly.Instance | null = null;
  private wasmMemory: WebAssembly.Memory | null = null;
  private wasmExports: WebAssembly.Exports | null = null;
  private go: Go;
  private logger?: Logger;

  /**
   * Constructor of the EvaluationWasm. It initializes the WASM module and the host functions.
   */
  constructor(logger?: Logger) {
    this.logger = logger;
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
      this.wasmInstance = wasm.instance;
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
      this.wasmInstance = null;
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
      // Construct the path to the WASM file relative to the current module
      const wasmPath = path.join(__dirname, 'wasm-module', 'gofeatureflag-evaluation.wasm');

      // Read the file as a buffer and convert to ArrayBuffer
      const buffer = fs.readFileSync(wasmPath);
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      return arrayBuffer as ArrayBuffer;
    } catch (error) {
      throw new WasmNotLoadedException(
        `Failed to load WASM binary: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
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

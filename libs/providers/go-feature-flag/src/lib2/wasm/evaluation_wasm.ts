import * as fs from 'node:fs';

export class EvaluationWasm {
  private encoder: TextEncoder;
  private decoder: TextDecoder;

  private free: ((pointer: number) => void) | undefined;
  private evaluate: ((evaluationInput: number, length: number) => bigint) | undefined;
  private malloc: ((size: number) => number) | undefined;
  private memory: WebAssembly.Memory | undefined;

  constructor() {
    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder();
  }

  async init(): Promise<void> {
    const wasmBuffer = fs.readFileSync('gofeatureflag-evaluation.wasm');
    const go = new Go(); // Defined in wasm_exec.js

    const wasm = await WebAssembly.instantiate(wasmBuffer, go.importObject);
    await go.run(wasm.instance);

    const { free, evaluate, malloc, memory } = wasm.instance.exports as {
      memory: WebAssembly.Memory;
      malloc: (size: number) => number;
      free: (pointer: number) => void;
      evaluate: (evaluationInput: number, length: number) => bigint;
      add: (a: number, b: number) => number;
    };

    this.free = free;
    this.evaluate = evaluate;
    this.memory = memory;
    this.malloc = malloc;
  }
}

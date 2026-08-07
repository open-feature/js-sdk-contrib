import { EvaluateWasm, unpackEvaluateResult } from './evaluate-wasm';
import { WasmFunctionNotFoundException } from '../exception';

/**
 * These tests instantiate the real WASM module copied in by the `copy-wasm` target, because the
 * behaviour under test is the module's lifecycle rather than the evaluator's use of it.
 */
describe('EvaluateWasm', () => {
  /** A flag that resolves to true for the given context, used to prove the module still works. */
  const sampleInput = {
    flagKey: 'TEST',
    flag: {
      variations: { enable: true, disable: false },
      defaultRule: { variation: 'enable' },
    },
    evalContext: { targetingKey: 'random-key' },
    flagContext: { defaultSdkValue: false, evaluationContextEnrichment: {} },
  };

  let engine: EvaluateWasm;
  let instantiateSpy: jest.SpyInstance;

  beforeEach(() => {
    engine = new EvaluateWasm();
    instantiateSpy = jest.spyOn(WebAssembly, 'instantiate');
  });

  afterEach(async () => {
    instantiateSpy.mockRestore();
    await engine.dispose();
  });

  describe('initialize', () => {
    it('should instantiate the module once', async () => {
      await engine.initialize();

      expect(instantiateSpy).toHaveBeenCalledTimes(1);
    });

    it('should not re-instantiate the module when already initialized', async () => {
      await engine.initialize();
      await engine.initialize();
      await engine.initialize();

      // Every extra instantiation abandons the previous instance without disposing it, leaking its
      // linear memory and its Go runtime for the lifetime of the process.
      expect(instantiateSpy).toHaveBeenCalledTimes(1);
    });

    it('should still evaluate after a redundant initialize', async () => {
      await engine.initialize();
      await engine.initialize();

      const result = await engine.evaluate(sampleInput);

      expect(result.value).toBe(true);
      expect(result.errorCode).toBeFalsy();
    });

    it('should rebuild the module after dispose', async () => {
      await engine.initialize();
      await engine.dispose();

      await engine.initialize();

      // dispose() clears the instance, so a deliberate rebuild must still go through.
      expect(instantiateSpy).toHaveBeenCalledTimes(2);
    });

    it('should evaluate correctly after a dispose and rebuild', async () => {
      await engine.initialize();
      await engine.dispose();
      await engine.initialize();

      const result = await engine.evaluate(sampleInput);

      expect(result.value).toBe(true);
      expect(result.errorCode).toBeFalsy();
    });
  });

  describe('export validation', () => {
    /** Instantiates to a stub module whose exports are complete except for `missing`. */
    const instantiateWithout = (missing: string) => {
      const exports: Record<string, unknown> = {
        memory: new WebAssembly.Memory({ initial: 1 }),
        malloc: () => 1,
        free: () => undefined,
        evaluate: () => BigInt(0),
      };
      delete exports[missing];
      instantiateSpy.mockResolvedValue({
        instance: { exports } as unknown as WebAssembly.Instance,
        module: {} as WebAssembly.Module,
      });
    };

    // `memory` is as required as the three functions - every read and write goes through it - and it
    // was the one export the check omitted.
    it.each(['memory', 'malloc', 'free', 'evaluate'])(
      'should fail initialization when the module does not export %s',
      async (missing) => {
        instantiateWithout(missing);

        await expect(engine.initialize()).rejects.toThrow(WasmFunctionNotFoundException);
      },
    );

    it('should name the export that is missing', async () => {
      instantiateWithout('memory');

      await expect(engine.initialize()).rejects.toThrow(/memory/);
    });

    it('should leave no instance behind when an export is missing', async () => {
      instantiateWithout('memory');

      await expect(engine.initialize()).rejects.toThrow();

      // Half-assigned state is what made this silent: `evaluate` reads a populated `wasmExports`
      // with an undefined `wasmMemory` as "not initialized", so it re-instantiated the module on
      // every call and failed much later with "WASM memory not available".
      expect((engine as unknown as { wasmExports: unknown }).wasmExports).toBeNull();
      expect((engine as unknown as { wasmMemory: unknown }).wasmMemory).toBeNull();
    });
  });

  describe('reading the output', () => {
    /** Replaces `evaluate` with one returning `packed`, keeping the real memory and allocator. */
    const makeEvaluateReturn = (packed: bigint) => {
      const real = (engine as unknown as { wasmExports: Record<string, unknown> }).wasmExports;
      (engine as unknown as { wasmExports: Record<string, unknown> }).wasmExports = {
        memory: real['memory'],
        malloc: real['malloc'],
        free: real['free'],
        evaluate: () => packed,
      };
    };

    it('should reject an output that falls outside the linear memory', async () => {
      await engine.initialize();
      makeEvaluateReturn((BigInt(0xffffffff) << BigInt(32)) | BigInt(16));

      const result = await engine.evaluate(sampleInput);

      // Out-of-range typed-array reads are `undefined`, which stores as 0, so without the bound the
      // caller gets a run of NUL bytes and an opaque JSON parse error instead of the real fault.
      expect(result.errorCode).toBe('GENERAL');
      expect(result.errorDetails).toContain('outside the WASM memory');
    });
  });

  describe('when evaluation traps', () => {
    /** Replaces `evaluate` with one that traps, keeping the real memory and allocator. */
    const makeEvaluateTrap = () => {
      const real = (engine as unknown as { wasmExports: Record<string, unknown> }).wasmExports;
      const free = jest.fn(real['free'] as (ptr: number) => void);
      (engine as unknown as { wasmExports: Record<string, unknown> }).wasmExports = {
        memory: real['memory'],
        malloc: real['malloc'],
        free,
        evaluate: () => {
          throw new WebAssembly.RuntimeError('unreachable');
        },
      };
      return free;
    };

    const instanceOf = () => (engine as unknown as { wasmExports: unknown }).wasmExports;

    it('should degrade to a GENERAL error rather than propagating the trap', async () => {
      await engine.initialize();
      makeEvaluateTrap();

      const result = await engine.evaluate(sampleInput);

      expect(result.errorCode).toBe('GENERAL');
      expect(result.reason).toBe('ERROR');
    });

    it('should not call free on the trapped instance', async () => {
      await engine.initialize();
      const free = makeEvaluateTrap();

      await engine.evaluate(sampleInput);

      // Running further guest code on a trapped instance faults again inside malloc at a wrapped
      // address, and that second fault replaces the original error in what the caller sees.
      expect(free).not.toHaveBeenCalled();
    });

    it('should discard the trapped instance', async () => {
      await engine.initialize();
      makeEvaluateTrap();

      await engine.evaluate(sampleInput);

      // A trap does not unwind the shadow-stack pointer, so the instance is permanently poisoned.
      expect(instanceOf()).toBeNull();
    });

    it('should rebuild and evaluate correctly on the next call', async () => {
      await engine.initialize();
      makeEvaluateTrap();
      await engine.evaluate(sampleInput);
      const instantiationsBefore = instantiateSpy.mock.calls.length;

      const result = await engine.evaluate(sampleInput);

      expect(instantiateSpy.mock.calls.length).toBe(instantiationsBefore + 1);
      expect(result.value).toBe(true);
      expect(result.errorCode).toBeFalsy();
    });

    it('should keep working across repeated traps', async () => {
      await engine.initialize();

      for (let i = 0; i < 3; i++) {
        makeEvaluateTrap();

        // Each response is captured before being asserted on. Calling evaluate again to check a
        // second field would be inspecting the rebuilt instance rather than the trapped one.
        const trapped = await engine.evaluate(sampleInput);
        expect(trapped.errorCode).toBe('GENERAL');
        expect(trapped.reason).toBe('ERROR');

        const recovered = await engine.evaluate(sampleInput);
        expect(recovered.value).toBe(true);
        expect(recovered.errorCode).toBeFalsy();
      }
    });
  });
});

/**
 * Unpacking is tested directly rather than through an evaluation: proving the pointer survives the
 * top of the 32-bit range would otherwise need a module holding more than 2 GiB of linear memory.
 */
describe('unpackEvaluateResult', () => {
  /** Packs a pointer and a length the way the module's `evaluate` does. */
  const pack = (ptr: number, length: number) => (BigInt(ptr) << BigInt(32)) | BigInt(length);

  it('should unpack a pointer and a length below 2 GiB', () => {
    expect(unpackEvaluateResult(pack(1024, 42))).toEqual({ ptr: 1024, length: 42 });
  });

  // `Number(x) & 0xffffffff` coerces to a *signed* 32-bit integer, so each of these came back
  // negative and indexed outside the linear memory.
  it.each([
    { label: 'at 2 GiB', ptr: 0x80000000 },
    { label: 'above 2 GiB', ptr: 0xdeadbeef },
    { label: 'at the top of the 32-bit range', ptr: 0xffffffff },
  ])('should keep a pointer $label non-negative', ({ ptr }) => {
    expect(unpackEvaluateResult(pack(ptr, 8)).ptr).toBe(ptr);
  });

  it('should not let a high pointer bleed into the length', () => {
    expect(unpackEvaluateResult(pack(0xffffffff, 16)).length).toBe(16);
  });
});

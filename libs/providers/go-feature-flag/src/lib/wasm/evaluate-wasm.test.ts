import { EvaluateWasm } from './evaluate-wasm';

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

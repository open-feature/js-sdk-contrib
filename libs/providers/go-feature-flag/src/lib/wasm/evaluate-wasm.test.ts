import { EvaluateWasm } from './evaluate-wasm';

/**
 * These tests instantiate the real WASM module copied in by the `copy-wasm` target, because the
 * behaviour under test is the module's lifecycle rather than the evaluator's use of it.
 */
describe('EvaluateWasm', () => {
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

      const result = await engine.evaluate({
        flagKey: 'TEST',
        flag: {
          variations: { enable: true, disable: false },
          defaultRule: { variation: 'enable' },
        },
        evalContext: { targetingKey: 'random-key' },
        flagContext: { defaultSdkValue: false, evaluationContextEnrichment: {} },
      });

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

      const result = await engine.evaluate({
        flagKey: 'TEST',
        flag: {
          variations: { enable: true, disable: false },
          defaultRule: { variation: 'enable' },
        },
        evalContext: { targetingKey: 'random-key' },
        flagContext: { defaultSdkValue: false, evaluationContextEnrichment: {} },
      });

      expect(result.value).toBe(true);
      expect(result.errorCode).toBeFalsy();
    });
  });
});

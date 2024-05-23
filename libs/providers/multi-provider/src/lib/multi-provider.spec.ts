import { MultiProvider } from './multi-provider';
import {
  DefaultLogger,
  ErrorCode,
  EvaluationContext,
  FlagValue,
  FlagValueType,
  Hook,
  InMemoryProvider,
  Logger,
  OpenFeatureEventEmitter,
  Provider,
  ServerProviderEvents,
} from '@openfeature/server-sdk';
import { ProviderMetadata } from '@openfeature/core';
import { FirstMatchStrategy } from './strategies/FirstMatchStrategy';
import { FirstSuccessfulStrategy } from './strategies/FirstSuccessfulStrategy';
import { ComparisonStrategy } from './strategies/ComparisonStrategy';

class TestProvider implements Provider {
  public metadata: ProviderMetadata = {
    name: 'TestProvider',
  };
  public events = new OpenFeatureEventEmitter();
  public hooks: Hook[] = [];
  constructor(
    public resolveBooleanEvaluation = jest.fn().mockResolvedValue({ value: false }),
    public resolveStringEvaluation = jest.fn().mockResolvedValue({ value: 'default' }),
    public resolveObjectEvaluation = jest.fn().mockResolvedValue({ value: {} }),
    public resolveNumberEvaluation = jest.fn().mockResolvedValue({ value: 0 }),
    public initialize = jest.fn(),
  ) {}

  emitEvent(type: ServerProviderEvents) {
    this.events.emit(type, { providerName: this.metadata.name });
  }
}

const callEvaluation = async (multi: MultiProvider, context: EvaluationContext, logger: Logger) => {
  await callBeforeHook(multi, context, 'flag', 'boolean', false);
  return multi.resolveBooleanEvaluation('flag', false, context);
};

const callBeforeHook = async (
  multi: MultiProvider,
  context: EvaluationContext,
  flagKey: string,
  flagType: FlagValueType,
  defaultValue: FlagValue,
  logger: Logger = new DefaultLogger(),
) => {
  const hookContext = {
    context: context,
    flagKey,
    flagValueType: flagType,
    defaultValue,
    clientMetadata: {} as any,
    providerMetadata: {} as any,
    logger: logger,
  };
  await multi.hooks[0].before?.(hookContext);
};

describe('MultiProvider', () => {
  const logger = new DefaultLogger();

  describe('unique names', () => {
    it('uses provider names for unique types', () => {
      const multiProvider = new MultiProvider([
        {
          provider: new InMemoryProvider(),
        },
        {
          provider: new TestProvider(),
        },
      ]);
      expect(multiProvider.providerEntries[0].name).toEqual('in-memory');
      expect(multiProvider.providerEntries[1].name).toEqual('TestProvider');
      expect(multiProvider.providerEntries.length).toBe(2);
    });
    it('generates unique names for identical provider types', () => {
      const multiProvider = new MultiProvider([
        {
          provider: new TestProvider(),
        },
        {
          provider: new TestProvider(),
        },
        {
          provider: new TestProvider(),
        },
        {
          provider: new InMemoryProvider(),
        },
      ]);
      expect(multiProvider.providerEntries[0].name).toEqual('TestProvider-1');
      expect(multiProvider.providerEntries[1].name).toEqual('TestProvider-2');
      expect(multiProvider.providerEntries[2].name).toEqual('TestProvider-3');
      expect(multiProvider.providerEntries[3].name).toEqual('in-memory');
      expect(multiProvider.providerEntries.length).toBe(4);
    });
    it('uses specified names for identical provider types', () => {
      const multiProvider = new MultiProvider([
        {
          provider: new TestProvider(),
          name: 'provider1',
        },
        {
          provider: new TestProvider(),
          name: 'provider2',
        },
      ]);
      expect(multiProvider.providerEntries[0].name).toEqual('provider1');
      expect(multiProvider.providerEntries[1].name).toEqual('provider2');
      expect(multiProvider.providerEntries.length).toBe(2);
    });
    it('throws an error if specified names are not unique', () => {
      expect(
        () =>
          new MultiProvider([
            {
              provider: new TestProvider(),
              name: 'provider',
            },
            {
              provider: new InMemoryProvider(),
              name: 'provider',
            },
          ]),
      ).toThrow();
    });
  });

  describe('event tracking and statuses', () => {
    it('initializes by waiting for all initializations', async () => {
      const provider1 = new TestProvider();
      const provider2 = new TestProvider();
      let initializations = 0;
      const multiProvider = new MultiProvider([
        {
          provider: provider1,
        },
        {
          provider: provider2,
        },
      ]);
      provider1.initialize.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        initializations++;
      });
      provider2.initialize.mockImplementation(() => initializations++);
      await multiProvider.initialize();
      expect(initializations).toBe(2);
    });

    it('throws error if a provider errors on initialization', async () => {
      const provider1 = new TestProvider();
      const provider2 = new TestProvider();
      let initializations = 0;
      const multiProvider = new MultiProvider([
        {
          provider: provider1,
        },
        {
          provider: provider2,
        },
      ]);
      provider1.initialize.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        throw new Error('Failure!');
      });
      provider2.initialize.mockImplementation(() => initializations++);
      await expect(() => multiProvider.initialize()).rejects.toThrow('Failure!');
    });

    it('emits events when aggregate status changes', async () => {
      const provider1 = new TestProvider();
      const provider2 = new TestProvider();
      const multiProvider = new MultiProvider([
        {
          provider: provider1,
        },
        {
          provider: provider2,
        },
      ]);

      let readyEmitted = 0;
      let errorEmitted = 0;
      let staleEmitted = 0;
      multiProvider.events.addHandler(ServerProviderEvents.Ready, () => {
        readyEmitted++;
      });

      multiProvider.events.addHandler(ServerProviderEvents.Error, () => {
        errorEmitted++;
      });

      multiProvider.events.addHandler(ServerProviderEvents.Stale, () => {
        staleEmitted++;
      });

      await multiProvider.initialize();

      provider1.initialize.mockResolvedValue(true);
      provider2.initialize.mockResolvedValue(true);
      provider1.emitEvent(ServerProviderEvents.Error);
      expect(errorEmitted).toBe(1);
      provider2.emitEvent(ServerProviderEvents.Error);
      // don't emit error again unless aggregate status is changing
      expect(errorEmitted).toBe(1);
      provider1.emitEvent(ServerProviderEvents.Error);
      // don't emit error again unless aggregate status is changing
      expect(errorEmitted).toBe(1);
      provider2.emitEvent(ServerProviderEvents.Stale);
      provider1.emitEvent(ServerProviderEvents.Ready);
      // error status provider is ready now but other provider is stale
      expect(readyEmitted).toBe(0);
      expect(staleEmitted).toBe(1);
      provider2.emitEvent(ServerProviderEvents.Ready);
      // now both providers are ready
      expect(readyEmitted).toBe(1);
    });
  });

  describe('metadata', () => {
    it('contains metadata for all providers', () => {
      const provider1 = new TestProvider();
      const provider2 = new TestProvider();

      const multiProvider = new MultiProvider([
        {
          provider: provider1,
        },
        {
          provider: provider2,
        },
      ]);
      expect(multiProvider.metadata).toEqual({
        name: 'MultiProvider',
        'TestProvider-1': provider1.metadata,
        'TestProvider-2': provider2.metadata,
      });
    });
  });

  describe('evaluation', () => {
    describe('hooks', () => {
      it('runs before hooks to modify context for a specific provider and evaluates using that modified context', async () => {
        const provider1 = new TestProvider();
        const provider2 = new TestProvider();
        let hook1Called = false;
        let hook2Called = false;
        let after1Called = false;
        let after2Called = false;
        const context = {
          test: true,
        };
        const hookContext = {
          context: context,
          flagKey: 'flag',
          flagValueType: 'boolean' as any,
          defaultValue: false,
          clientMetadata: {} as any,
          providerMetadata: {} as any,
          logger: logger,
        };

        provider1.hooks = [
          {
            before: async (context) => {
              hook1Called = true;
              expect(context).toBe(hookContext);
              return { ...context.context, hook1: true };
            },
            after: async (context) => {
              expect(context.context).toEqual({
                test: true,
                hook1: true,
                hook2: true,
              });
              after1Called = true;
            },
          },
          {
            before: async (context) => {
              hook2Called = true;
              expect(context).toBe(hookContext);
              return { ...context.context, hook2: true };
            },
          },
        ];

        provider2.hooks = [
          {
            after: async (context) => {
              expect(context.context).toEqual({
                test: true,
              });
              after2Called = true;
            },
          },
        ];

        const multiProvider = new MultiProvider(
          [
            {
              provider: provider1,
            },
            {
              provider: provider2,
            },
          ],
          new ComparisonStrategy(provider1),
        );

        await multiProvider.hooks[0].before!(hookContext);
        await multiProvider.resolveBooleanEvaluation('flag', false, context);
        expect(hook1Called).toBe(true);
        expect(hook2Called).toBe(true);
        expect(provider1.resolveBooleanEvaluation).toHaveBeenCalledWith(
          'flag',
          false,
          {
            test: true,
            hook1: true,
            hook2: true,
          },
          expect.any(Object),
        );
        expect(provider2.resolveBooleanEvaluation).toHaveBeenCalledWith(
          'flag',
          false,
          { test: true },
          expect.any(Object),
        );
        expect(after1Called).toBe(true);
        expect(after2Called).toBe(true);
      });

      it('runs error hook and finally hook with modified context', async () => {
        const provider1 = new TestProvider();
        let hook1Called = false;
        let error1Called = false;
        let finally1Called = false;

        const context = {
          test: true,
        };

        const hookContext = {
          context: context,
          flagKey: 'flag',
          flagValueType: 'boolean' as any,
          defaultValue: false,
          clientMetadata: {} as any,
          providerMetadata: {} as any,
          logger: logger,
        };

        provider1.hooks = [
          {
            before: async (context) => {
              hook1Called = true;
              expect(context).toBe(hookContext);
              return { ...context.context, hook1: true };
            },
            error: async (context) => {
              expect(context.context).toEqual({
                test: true,
                hook1: true,
              });
              error1Called = true;
              throw new Error('error hook error');
            },
            finally: async (context) => {
              expect(context.context).toEqual({
                test: true,
                hook1: true,
              });
              finally1Called = true;
            },
          },
        ];

        const multiProvider = new MultiProvider([
          {
            provider: provider1,
          },
        ]);

        provider1.resolveBooleanEvaluation.mockRejectedValue(new Error('test error'));

        await multiProvider.hooks[0].before!(hookContext);
        await expect(() => multiProvider.resolveBooleanEvaluation('flag', false, context)).rejects.toThrow();
        expect(hook1Called).toBe(true);
        expect(provider1.resolveBooleanEvaluation).toHaveBeenCalledWith(
          'flag',
          false,
          {
            test: true,
            hook1: true,
          },
          expect.any(Object),
        );
        expect(error1Called).toBe(true);
        expect(finally1Called).toBe(true);
      });
    });

    describe('resolution logic and strategies', () => {
      describe('evaluation data types', () => {
        it('evaluates a string variable', async () => {
          const provider1 = new TestProvider();
          provider1.resolveStringEvaluation.mockResolvedValue({ value: 'value' });

          const multiProvider = new MultiProvider([
            {
              provider: provider1,
            },
          ]);
          const context = {};
          await callBeforeHook(multiProvider, context, 'flag', 'string', 'default');
          expect(await multiProvider.resolveStringEvaluation('flag', 'default', context)).toEqual({ value: 'value' });
        });

        it('evaluates a number variable', async () => {
          const provider1 = new TestProvider();
          provider1.resolveNumberEvaluation.mockResolvedValue({ value: 1 });

          const multiProvider = new MultiProvider([
            {
              provider: provider1,
            },
          ]);
          const context = {};

          await callBeforeHook(multiProvider, context, 'flag', 'number', 0);

          expect(await multiProvider.resolveNumberEvaluation('flag', 0, context)).toEqual({ value: 1 });
        });

        it('evaluates a boolean variable', async () => {
          const provider1 = new TestProvider();
          provider1.resolveBooleanEvaluation.mockResolvedValue({ value: true });

          const multiProvider = new MultiProvider([
            {
              provider: provider1,
            },
          ]);
          const context = {};
          await callBeforeHook(multiProvider, context, 'flag', 'boolean', false);
          expect(await multiProvider.resolveBooleanEvaluation('flag', false, context)).toEqual({ value: true });
        });

        it('evaluates an object variable', async () => {
          const provider1 = new TestProvider();
          provider1.resolveObjectEvaluation.mockResolvedValue({ value: { test: true } });

          const multiProvider = new MultiProvider([
            {
              provider: provider1,
            },
          ]);
          const context = {};
          await callBeforeHook(multiProvider, context, 'flag', 'object', {});
          expect(await multiProvider.resolveObjectEvaluation('flag', {}, context)).toEqual({ value: { test: true } });
        });
      });
      describe('first match strategy', () => {
        it('throws an error if any provider throws an error during evaluation', async () => {
          const provider1 = new TestProvider();
          const provider2 = new TestProvider();
          provider1.resolveBooleanEvaluation.mockRejectedValue(new Error('test error'));
          const multiProvider = new MultiProvider(
            [
              {
                provider: provider1,
              },
              {
                provider: provider2,
              },
            ],
            new FirstMatchStrategy(),
          );

          await expect(() => callEvaluation(multiProvider, {}, logger)).rejects.toThrow('test error');
          expect(provider2.resolveBooleanEvaluation).not.toHaveBeenCalled();
        });

        it('throws an error if any provider returns an error result during evaluation', async () => {
          const provider1 = new TestProvider();
          const provider2 = new TestProvider();
          provider1.resolveBooleanEvaluation.mockResolvedValue({
            errorCode: 'test-error',
            errorMessage: 'test error',
          });
          const multiProvider = new MultiProvider(
            [
              {
                provider: provider1,
              },
              {
                provider: provider2,
              },
            ],
            new FirstMatchStrategy(),
          );

          await expect(() => callEvaluation(multiProvider, {}, logger)).rejects.toThrow('test error');
          expect(provider2.resolveBooleanEvaluation).not.toHaveBeenCalled();
        });

        it('skips providers that return flag not found until it gets a result, skipping any provider after', async () => {
          const provider1 = new TestProvider();
          const provider2 = new TestProvider();
          const provider3 = new TestProvider();
          provider1.resolveBooleanEvaluation.mockResolvedValue({
            errorCode: ErrorCode.FLAG_NOT_FOUND,
            errorMessage: 'flag not found',
          });
          provider2.resolveBooleanEvaluation.mockResolvedValue({
            value: true,
          });
          const multiProvider = new MultiProvider(
            [
              {
                provider: provider1,
              },
              {
                provider: provider2,
              },
              {
                provider: provider3,
              },
            ],
            new FirstMatchStrategy(),
          );
          const result = await callEvaluation(multiProvider, {}, logger);
          expect(result).toEqual({ value: true });
          expect(provider2.resolveBooleanEvaluation).toHaveBeenCalled();
          expect(provider3.resolveBooleanEvaluation).not.toHaveBeenCalled();
        });
      });

      describe('first successful strategy', () => {
        it('ignores errors from earlier providers and returns successful result from later provider', async () => {
          const provider1 = new TestProvider();
          const provider2 = new TestProvider();
          const provider3 = new TestProvider();
          provider1.resolveBooleanEvaluation.mockResolvedValue({
            errorCode: 'some error',
            errorMessage: 'flag not found',
          });
          provider2.resolveBooleanEvaluation.mockResolvedValue({
            value: true,
          });
          const multiProvider = new MultiProvider(
            [
              {
                provider: provider1,
              },
              {
                provider: provider2,
              },
              {
                provider: provider3,
              },
            ],
            new FirstSuccessfulStrategy(),
          );
          const result = await callEvaluation(multiProvider, {}, logger);
          expect(result).toEqual({ value: true });
          expect(provider2.resolveBooleanEvaluation).toHaveBeenCalled();
          expect(provider3.resolveBooleanEvaluation).not.toHaveBeenCalled();
        });
      });

      describe('comparison strategy', () => {
        it('calls every provider in parallel and returns a result if they all agree', async () => {
          const provider1 = new TestProvider();
          const provider2 = new TestProvider();
          const provider3 = new TestProvider();
          provider1.resolveBooleanEvaluation.mockReturnValue(
            new Promise((resolve) => {
              setTimeout(() => resolve({ value: true }), 2);
            }),
          );

          provider2.resolveBooleanEvaluation.mockResolvedValue({
            value: true,
          });
          provider3.resolveBooleanEvaluation.mockResolvedValue({
            value: true,
          });

          const multiProvider = new MultiProvider(
            [
              {
                provider: provider1,
              },
              {
                provider: provider2,
              },
              {
                provider: provider3,
              },
            ],
            new ComparisonStrategy(provider1),
          );
          const resultPromise = callEvaluation(multiProvider, {}, logger);
          await new Promise((resolve) => process.nextTick(resolve));
          expect(provider1.resolveBooleanEvaluation).toHaveBeenCalled();
          expect(provider2.resolveBooleanEvaluation).toHaveBeenCalled();
          expect(provider3.resolveBooleanEvaluation).toHaveBeenCalled();

          expect(await resultPromise).toEqual({ value: true });
        });

        it('calls every provider and returns the fallback value if any disagree, and calls onMismatch', async () => {
          const provider1 = new TestProvider();
          const provider2 = new TestProvider();
          const provider3 = new TestProvider();
          provider1.resolveBooleanEvaluation.mockResolvedValue({
            value: true,
          });
          provider2.resolveBooleanEvaluation.mockResolvedValue({
            value: false,
          });
          provider3.resolveBooleanEvaluation.mockResolvedValue({
            value: false,
          });

          const onMismatch = jest.fn();

          const multiProvider = new MultiProvider(
            [
              {
                provider: provider1,
              },
              {
                provider: provider2,
              },
              {
                provider: provider3,
              },
            ],
            new ComparisonStrategy(provider1, onMismatch),
          );
          const result = await callEvaluation(multiProvider, {}, logger);
          expect(provider1.resolveBooleanEvaluation).toHaveBeenCalled();
          expect(provider2.resolveBooleanEvaluation).toHaveBeenCalled();
          expect(provider3.resolveBooleanEvaluation).toHaveBeenCalled();
          expect(onMismatch).toHaveBeenCalledWith([
            {
              provider: provider1,
              providerName: 'TestProvider-1',
              details: { value: true },
            },
            {
              provider: provider2,
              providerName: 'TestProvider-2',
              details: { value: false },
            },
            {
              provider: provider3,
              providerName: 'TestProvider-3',
              details: { value: false },
            },
          ]);

          expect(result).toEqual({ value: true });
        });

        it('returns an error if any provider returns an error', async () => {
          const provider1 = new TestProvider();
          const provider2 = new TestProvider();
          const provider3 = new TestProvider();
          provider1.resolveBooleanEvaluation.mockRejectedValue(new Error('test error'));
          provider2.resolveBooleanEvaluation.mockResolvedValue({
            value: false,
          });
          provider3.resolveBooleanEvaluation.mockResolvedValue({
            value: false,
          });

          const multiProvider = new MultiProvider(
            [
              {
                provider: provider1,
              },
              {
                provider: provider2,
              },
              {
                provider: provider3,
              },
            ],
            new ComparisonStrategy(provider1),
          );
          await expect(callEvaluation(multiProvider, {}, logger)).rejects.toThrow('test error');
          expect(provider1.resolveBooleanEvaluation).toHaveBeenCalled();
          expect(provider2.resolveBooleanEvaluation).toHaveBeenCalled();
          expect(provider3.resolveBooleanEvaluation).toHaveBeenCalled();
        });
      });
    });
  });
});

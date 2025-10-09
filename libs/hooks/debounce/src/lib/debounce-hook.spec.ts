import type { EvaluationDetails, BaseHook, HookContext } from '@openfeature/core';
import { DebounceHook } from './debounce-hook';
import type { Hook as WebSdkHook } from '@openfeature/web-sdk';
import type { Hook as ServerSdkHook } from '@openfeature/server-sdk';

describe('DebounceHook', () => {
  describe('caching', () => {
    afterAll(() => {
      jest.resetAllMocks();
    });

    const innerHook: BaseHook<string, void, void> = {
      before: jest.fn(),
      after: jest.fn(),
      error: jest.fn(),
      finally: jest.fn(),
    };

    const hook = new DebounceHook<string>(innerHook, {
      debounceTime: 60_000,
      maxCacheItems: 100,
    });

    const evaluationDetails: EvaluationDetails<string> = {
      value: 'testValue',
    } as EvaluationDetails<string>;
    const err: Error = new Error('fake error!');
    const context = {};
    const hints = {};

    it.each([
      {
        flagKey: 'flag1',
        calledTimesTotal: 1,
      },
      {
        flagKey: 'flag2',
        calledTimesTotal: 2,
      },
      {
        flagKey: 'flag1',
        calledTimesTotal: 2, // should not have been incremented, same cache key
      },
    ])('should cache each stage based on supplier', ({ flagKey, calledTimesTotal }) => {
      hook.before({ flagKey, context } as HookContext<string>, hints);
      hook.after({ flagKey, context } as HookContext<string>, evaluationDetails, hints);
      hook.error({ flagKey, context } as HookContext<string>, err, hints);
      hook.finally({ flagKey, context } as HookContext<string>, evaluationDetails, hints);

      expect(innerHook.before).toHaveBeenNthCalledWith(calledTimesTotal, expect.objectContaining({ context }), hints);
      expect(innerHook.after).toHaveBeenNthCalledWith(
        calledTimesTotal,
        expect.objectContaining({ context }),
        evaluationDetails,
        hints,
      );
      expect(innerHook.error).toHaveBeenNthCalledWith(
        calledTimesTotal,
        expect.objectContaining({ context }),
        err,
        hints,
      );
      expect(innerHook.finally).toHaveBeenNthCalledWith(
        calledTimesTotal,
        expect.objectContaining({ context }),
        evaluationDetails,
        hints,
      );
    });

    it('stages should be cached independently', () => {
      const innerHook: BaseHook<boolean, void, void> = {
        before: jest.fn(),
        after: jest.fn(),
      };

      const hook = new DebounceHook<boolean>(innerHook, {
        debounceTime: 60_000,
        maxCacheItems: 100,
      });

      const flagKey = 'my-flag';

      hook.before({ flagKey } as HookContext<boolean>, {});
      hook.after({ flagKey } as HookContext<boolean>, {
        flagKey,
        flagMetadata: {},
        value: true,
      });

      // both should run
      expect(innerHook.before).toHaveBeenCalledTimes(1);
      expect(innerHook.after).toHaveBeenCalledTimes(1);
    });
  });

  describe('options', () => {
    afterAll(() => {
      jest.resetAllMocks();
    });

    it('maxCacheItems should limit size', () => {
      const innerHook: BaseHook<string, void, void> = {
        before: jest.fn(),
      };

      const hook = new DebounceHook<string>(innerHook, {
        debounceTime: 60_000,
        maxCacheItems: 1,
      });

      hook.before({ flagKey: 'flag1' } as HookContext<string>, {});
      hook.before({ flagKey: 'flag2' } as HookContext<string>, {});
      hook.before({ flagKey: 'flag1' } as HookContext<string>, {});

      // every invocation should have run since we have only maxCacheItems: 1
      expect(innerHook.before).toHaveBeenCalledTimes(3);
    });

    it('should rerun inner hook only after debounce time', async () => {
      const innerHook: BaseHook<string, void, void> = {
        before: jest.fn(),
      };

      const flagKey = 'some-flag';

      const hook = new DebounceHook(innerHook, {
        debounceTime: 500,
        maxCacheItems: 1,
      });

      hook.before({ flagKey } as HookContext<string>, {});
      hook.before({ flagKey } as HookContext<string>, {});
      hook.before({ flagKey } as HookContext<string>, {});

      await new Promise((r) => setTimeout(r, 1000));

      hook.before({ flagKey } as HookContext<string>, {});

      // only the first and last should have invoked the inner hook
      expect(innerHook.before).toHaveBeenCalledTimes(2);
    });

    it('use custom supplier', () => {
      const innerHook: BaseHook<number, void, void> = {
        before: jest.fn(),
        after: jest.fn(),
        error: jest.fn(),
        finally: jest.fn(),
      };

      const context = {
        targetingKey: 'user123',
      };
      const hints = {};

      const hook = new DebounceHook<number>(innerHook, {
        cacheKeySupplier: (_, context) => context.targetingKey, // we are caching purely based on the targetingKey in the context, so we will only ever cache one entry
        debounceTime: 60_000,
        maxCacheItems: 100,
      });

      hook.before({ flagKey: 'flag1', context } as HookContext<number>, hints);
      hook.before({ flagKey: 'flag2', context } as HookContext<number>, hints);

      // since we used a constant key, the second invocation should have been cached even though the flagKey was different
      expect(innerHook.before).toHaveBeenCalledTimes(1);
    });

    it.each([
      {
        cacheErrors: false,
        timesCalled: 2, // should be called each time since the hook always errors
      },
      {
        cacheErrors: true,
        timesCalled: 1, // should be called once since we cached the error
      },
    ])('should cache errors if cacheErrors set', ({ cacheErrors, timesCalled }) => {
      const innerErrorHook: BaseHook<string[], void, void> = {
        before: jest.fn(() => {
          // throw an error
          throw new Error('fake!');
        }),
      };

      const flagKey = 'some-flag';
      const context = {};

      // this hook caches error invocations
      const hook = new DebounceHook<string[]>(innerErrorHook, {
        maxCacheItems: 100,
        debounceTime: 60_000,
        cacheErrors,
      });

      expect(() => hook.before({ flagKey, context } as HookContext<string[]>)).toThrow();
      expect(() => hook.before({ flagKey, context } as HookContext<string[]>)).toThrow();

      expect(innerErrorHook.before).toHaveBeenCalledTimes(timesCalled);
    });
  });

  describe('SDK compatibility', () => {
    describe('web-sdk hooks', () => {
      it('should debounce synchronous hooks', () => {
        const innerWebSdkHook: WebSdkHook = {
          before: jest.fn(),
          after: jest.fn(),
          error: jest.fn(),
          finally: jest.fn(),
        };

        const hook = new DebounceHook<string>(innerWebSdkHook, {
          debounceTime: 60_000,
          maxCacheItems: 100,
        });

        const evaluationDetails: EvaluationDetails<string> = {
          value: 'testValue',
        } as EvaluationDetails<string>;
        const err: Error = new Error('fake error!');
        const context = {};
        const hints = {};
        const flagKey = 'flag1';

        for (let i = 0; i < 2; i++) {
          hook.before({ flagKey, context } as HookContext<string>, hints);
          hook.after({ flagKey, context } as HookContext<string>, evaluationDetails, hints);
          hook.error({ flagKey, context } as HookContext<string>, err, hints);
          hook.finally({ flagKey, context } as HookContext<string>, evaluationDetails, hints);
        }

        expect(innerWebSdkHook.before).toHaveBeenCalledTimes(1);
      });
    });

    describe('server-sdk hooks', () => {
      const contextKey = 'key';
      const contextValue = 'value';
      const evaluationContext = { [contextKey]: contextValue };
      it('should debounce synchronous hooks', () => {
        const innerServerSdkHook: ServerSdkHook = {
          before: jest.fn(() => {
            return evaluationContext;
          }),
          after: jest.fn(),
          error: jest.fn(),
          finally: jest.fn(),
        };

        const hook = new DebounceHook<number>(innerServerSdkHook, {
          debounceTime: 60_000,
          maxCacheItems: 100,
        });

        const evaluationDetails: EvaluationDetails<number> = {
          value: 1337,
        } as EvaluationDetails<number>;
        const err: Error = new Error('fake error!');
        const context = {};
        const hints = {};
        const flagKey = 'flag1';

        for (let i = 0; i < 2; i++) {
          const returnedContext = hook.before({ flagKey, context } as HookContext<number>, hints);
          // make sure we return the expected context each time
          expect(returnedContext).toEqual(expect.objectContaining(evaluationContext));
          hook.after({ flagKey, context } as HookContext<number>, evaluationDetails, hints);
          hook.error({ flagKey, context } as HookContext<number>, err, hints);
          hook.finally({ flagKey, context } as HookContext<number>, evaluationDetails, hints);
        }

        // all stages should have been called only once
        expect(innerServerSdkHook.before).toHaveBeenCalledTimes(1);
        expect(innerServerSdkHook.after).toHaveBeenCalledTimes(1);
        expect(innerServerSdkHook.error).toHaveBeenCalledTimes(1);
        expect(innerServerSdkHook.finally).toHaveBeenCalledTimes(1);
      });

      it('should debounce asynchronous hooks', async () => {
        const delayMs = 100;
        const innerServerSdkHook: ServerSdkHook = {
          before: jest.fn(() => {
            return new Promise((resolve) => setTimeout(() => resolve(evaluationContext), delayMs));
          }),
          after: jest.fn(() => {
            return new Promise((resolve) => setTimeout(() => resolve(), delayMs));
          }),
          error: jest.fn(() => {
            return new Promise((resolve) => setTimeout(() => resolve(), delayMs));
          }),
          finally: jest.fn(() => {
            return new Promise((resolve) => setTimeout(() => resolve(), delayMs));
          }),
        };

        const hook = new DebounceHook<number>(innerServerSdkHook, {
          debounceTime: 60_000,
          maxCacheItems: 100,
        });

        const evaluationDetails: EvaluationDetails<number> = {
          value: 1337,
        } as EvaluationDetails<number>;
        const err: Error = new Error('fake error!');
        const context = {};
        const hints = {};
        const flagKey = 'flag1';

        for (let i = 0; i < 2; i++) {
          const returnedContext = await hook.before({ flagKey, context } as HookContext<number>, hints);
          // make sure we return the expected context each time
          expect(returnedContext).toEqual(expect.objectContaining(evaluationContext));
          await hook.after({ flagKey, context } as HookContext<number>, evaluationDetails, hints);
          await hook.error({ flagKey, context } as HookContext<number>, err, hints);
          await hook.finally({ flagKey, context } as HookContext<number>, evaluationDetails, hints);
        }

        // each stage should have been called only once
        expect(innerServerSdkHook.before).toHaveBeenCalledTimes(1);
        expect(innerServerSdkHook.after).toHaveBeenCalledTimes(1);
        expect(innerServerSdkHook.error).toHaveBeenCalledTimes(1);
        expect(innerServerSdkHook.finally).toHaveBeenCalledTimes(1);
      });
    });
  });
});

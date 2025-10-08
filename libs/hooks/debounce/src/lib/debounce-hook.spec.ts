import type { EvaluationDetails, Hook, HookContext } from '@openfeature/web-sdk';
import { DebounceHook } from './debounce-hook';

describe('DebounceHook', () => {
  describe('caching', () => {
    afterAll(() => {
      jest.resetAllMocks();
    });

    const innerHook: Hook = {
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
      hook.before({ flagKey, context } as HookContext, hints);
      hook.after({ flagKey, context } as HookContext, evaluationDetails, hints);
      hook.error({ flagKey, context } as HookContext, err, hints);
      hook.finally({ flagKey, context } as HookContext, evaluationDetails, hints);

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
      const innerHook: Hook = {
        before: jest.fn(),
        after: jest.fn(),
      };

      const hook = new DebounceHook<boolean>(innerHook, {
        debounceTime: 60_000,
        maxCacheItems: 100,
      });

      const flagKey = 'my-flag';

      hook.before({ flagKey } as HookContext, {});
      hook.after({ flagKey } as HookContext, {
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
      const innerHook: Hook = {
        before: jest.fn(),
      };

      const hook = new DebounceHook<string>(innerHook, {
        debounceTime: 60_000,
        maxCacheItems: 1,
      });

      hook.before({ flagKey: 'flag1' } as HookContext, {});
      hook.before({ flagKey: 'flag2' } as HookContext, {});
      hook.before({ flagKey: 'flag1' } as HookContext, {});

      // every invocation should have run since we have only maxCacheItems: 1
      expect(innerHook.before).toHaveBeenCalledTimes(3);
    });

    it('should rerun inner hook only after debounce time', async () => {
      const innerHook: Hook = {
        before: jest.fn(),
      };

      const flagKey = 'some-flag';

      const hook = new DebounceHook<string>(innerHook, {
        debounceTime: 500,
        maxCacheItems: 1,
      });

      hook.before({ flagKey } as HookContext, {});
      hook.before({ flagKey } as HookContext, {});
      hook.before({ flagKey } as HookContext, {});

      await new Promise((r) => setTimeout(r, 1000));

      hook.before({ flagKey } as HookContext, {});

      // only the first and last should have invoked the inner hook
      expect(innerHook.before).toHaveBeenCalledTimes(2);
    });

    it('use custom supplier', () => {
      const innerHook: Hook = {
        before: jest.fn(),
        after: jest.fn(),
        error: jest.fn(),
        finally: jest.fn(),
      };

      const context = {};
      const hints = {};

      const hook = new DebounceHook<string>(innerHook, {
        cacheKeySupplier: () => 'a-silly-const-key', // a constant key means all invocations are cached; just to test that the custom supplier is used
        debounceTime: 60_000,
        maxCacheItems: 100,
      });

      hook.before({ flagKey: 'flag1', context } as HookContext, hints);
      hook.before({ flagKey: 'flag2', context } as HookContext, hints);

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
      const innerErrorHook: Hook = {
        before: jest.fn(() => {
          // throw an error
          throw new Error('fake!');
        }),
      };

      const flagKey = 'some-flag';
      const context = {};

      // this hook caches error invocations
      const hook = new DebounceHook<string>(innerErrorHook, {
        maxCacheItems: 100,
        debounceTime: 60_000,
        cacheErrors,
      });

      expect(() => hook.before({ flagKey, context } as HookContext)).toThrow();
      expect(() => hook.before({ flagKey, context } as HookContext)).toThrow();

      expect(innerErrorHook.before).toHaveBeenCalledTimes(timesCalled);
    });
  });
});

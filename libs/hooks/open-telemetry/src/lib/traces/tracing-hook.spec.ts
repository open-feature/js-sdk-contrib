import type { EvaluationDetails, HookContext } from '@openfeature/server-sdk';

const addEvent = jest.fn();
const recordException = jest.fn();

const getActiveSpan = jest.fn<unknown, unknown[]>(() => ({ addEvent, recordException }));

jest.mock('@opentelemetry/api', () => ({
  trace: {
    getActiveSpan,
  },
}));

// Import must be after the mocks
import { TracingHook } from './tracing-hook';

describe('OpenTelemetry Hooks', () => {
  const hookContext: HookContext = {
    flagKey: 'testFlagKey',
    clientMetadata: {
      providerMetadata: {
        name: 'fake',
      },
      name: 'testClient',
    },
    providerMetadata: {
      name: 'testProvider',
    },
    context: {},
    defaultValue: true,
    flagValueType: 'boolean',
    logger: console,
  };

  let tracingHook: TracingHook;

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('after stage', () => {
    describe('no attribute mapper', () => {
      beforeEach(() => {
        tracingHook = new TracingHook();
      });

      it('should use the variant value on the span event', () => {
        const evaluationDetails: EvaluationDetails<boolean> = {
          flagKey: hookContext.flagKey,
          value: true,
          variant: 'enabled',
          flagMetadata: {},
        };

        tracingHook.after(hookContext, evaluationDetails);

        expect(addEvent).toBeCalledWith('feature_flag', {
          'feature_flag.key': 'testFlagKey',
          'feature_flag.provider_name': 'testProvider',
          'feature_flag.variant': 'enabled',
        });
      });

      it('should use a stringified value as the variant value on the span event', () => {
        const evaluationDetails: EvaluationDetails<boolean> = {
          flagKey: hookContext.flagKey,
          value: true,
          flagMetadata: {},
        };

        tracingHook.after(hookContext, evaluationDetails);

        expect(addEvent).toBeCalledWith('feature_flag', {
          'feature_flag.key': 'testFlagKey',
          'feature_flag.provider_name': 'testProvider',
          'feature_flag.variant': 'true',
        });
      });

      it('should set the value without extra quotes if value is already a string', () => {
        const evaluationDetails: EvaluationDetails<string> = {
          flagKey: hookContext.flagKey,
          value: 'already-string',
          flagMetadata: {},
        };
        tracingHook.after(hookContext, evaluationDetails);

        expect(addEvent).toBeCalledWith('feature_flag', {
          'feature_flag.key': 'testFlagKey',
          'feature_flag.provider_name': 'testProvider',
          'feature_flag.variant': 'already-string',
        });
      });

      it('should not call addEvent because there is no active span', () => {
        getActiveSpan.mockReturnValueOnce(undefined);
        const evaluationDetails: EvaluationDetails<boolean> = {
          flagKey: hookContext.flagKey,
          value: true,
          variant: 'enabled',
          flagMetadata: {},
        };

        tracingHook.after(hookContext, evaluationDetails);
        expect(addEvent).not.toBeCalled();
      });
    });

    describe('attribute mapper configured', () => {
      describe('no error in mapper', () => {
        beforeEach(() => {
          tracingHook = new TracingHook({
            attributeMapper: (flagMetadata) => {
              return {
                customAttr1: flagMetadata.metadata1,
                customAttr2: flagMetadata.metadata2,
                customAttr3: flagMetadata.metadata3,
              };
            },
          });
        });

        it('should run the attribute mapper to add custom attributes, if set', () => {
          const evaluationDetails: EvaluationDetails<boolean> = {
            flagKey: hookContext.flagKey,
            value: true,
            variant: 'enabled',
            flagMetadata: {
              metadata1: 'one',
              metadata2: 2,
              metadata3: true,
            },
          };

          tracingHook.after(hookContext, evaluationDetails);

          expect(addEvent).toBeCalledWith('feature_flag', {
            'feature_flag.key': 'testFlagKey',
            'feature_flag.provider_name': 'testProvider',
            'feature_flag.variant': 'enabled',
            customAttr1: 'one',
            customAttr2: 2,
            customAttr3: true,
          });
        });
      });

      describe('error in mapper', () => {
        beforeEach(() => {
          tracingHook = new TracingHook({
            attributeMapper: () => {
              throw new Error('fake error');
            },
          });
        });

        it('should no-op', () => {
          const evaluationDetails: EvaluationDetails<boolean> = {
            flagKey: hookContext.flagKey,
            value: true,
            variant: 'enabled',
            flagMetadata: {
              metadata1: 'one',
              metadata2: 2,
              metadata3: true,
            },
          };

          tracingHook.after(hookContext, evaluationDetails);

          expect(addEvent).toBeCalledWith('feature_flag', {
            'feature_flag.key': 'testFlagKey',
            'feature_flag.provider_name': 'testProvider',
            'feature_flag.variant': 'enabled',
          });
        });
      });
    });
  });

  describe('error stage', () => {
    const testError = new Error();

    it('should call recordException with a test error', () => {
      tracingHook.error(hookContext, testError);
      expect(recordException).toBeCalledWith(testError);
    });

    it('should not call recordException because there is no active span', () => {
      getActiveSpan.mockReturnValueOnce(undefined);
      tracingHook.error(hookContext, testError);
      expect(recordException).not.toBeCalled();
    });
  });
});

import { EvaluationDetails, HookContext } from '@openfeature/js-sdk';

const addEvent = jest.fn();
const recordException = jest.fn();

const getActiveSpan = jest.fn<any, any>(() => ({ addEvent, recordException }));

jest.mock('@opentelemetry/api', () => ({
  trace: {
    getActiveSpan,
  },
}));

// Import must be after the mocks
import { OpenTelemetryHook } from './open-telemetry-hook';

describe('OpenTelemetry Hooks', () => {
  const hookContext: HookContext = {
    flagKey: 'testFlagKey',
    clientMetadata: {
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

  let otelHook: OpenTelemetryHook;

  beforeEach(() => {
    otelHook = new OpenTelemetryHook();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('after hook', () => {
    it('should use the variant value on the span event', () => {
      const evaluationDetails: EvaluationDetails<boolean> = {
        flagKey: hookContext.flagKey,
        value: true,
        variant: 'enabled',
      };

      otelHook.after(hookContext, evaluationDetails);

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
      };

      otelHook.after(hookContext, evaluationDetails);

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
      };
      otelHook.after(hookContext, evaluationDetails);

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
      };

      otelHook.after(hookContext, evaluationDetails);
      expect(addEvent).not.toBeCalled();
    });
  });

  describe('error hook', () => {
    const testError = new Error();

    it('should call recordException with a test error', () => {
      otelHook.error(hookContext, testError);
      expect(recordException).toBeCalledWith(testError);
    });

    it('should not call recordException because there is no active span', () => {
      getActiveSpan.mockReturnValueOnce(undefined);
      otelHook.error(hookContext, testError);
      expect(recordException).not.toBeCalled();
    });
  });
});

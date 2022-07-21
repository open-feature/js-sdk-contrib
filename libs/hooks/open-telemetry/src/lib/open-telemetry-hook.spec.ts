import { EvaluationDetails, HookContext } from '@openfeature/nodejs-sdk';

const setAttributes = jest.fn();
const setAttribute = jest.fn();
const recordException = jest.fn();
const end = jest.fn();
const startSpan = jest.fn(() => ({
  setAttributes,
  setAttribute,
  recordException,
  end,
}));
const getTracer = jest.fn(() => ({ startSpan }));

jest.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer,
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
  };

  let otelHook: OpenTelemetryHook;

  beforeEach(() => {
    otelHook = new OpenTelemetryHook();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should use the same span with all the hooks', () => {
    const evaluationDetails: EvaluationDetails<boolean> = {
      flagKey: hookContext.flagKey,

      value: true,
    };

    const setSpanMapSpy = jest.spyOn(otelHook['spanMap'], 'set');
    const testError = new Error();

    otelHook.before(hookContext);
    expect(setSpanMapSpy).toBeCalled();

    otelHook.after(hookContext, evaluationDetails);
    expect(setAttribute).toBeCalledWith('feature_flag.evaluated_value', 'true');

    otelHook.error(hookContext, testError);
    expect(recordException).toBeCalledWith(testError);

    otelHook.finally(hookContext);
    expect(end).toBeCalled();
  });

  describe('before hook', () => {
    it('should start a new span', () => {
      expect(otelHook.before(hookContext)).toBeUndefined();
      expect(getTracer).toBeCalled();
      expect(startSpan).toBeCalledWith('testProvider testFlagKey', {
        attributes: {
          'feature_flag.flag_key': 'testFlagKey',
          'feature_flag.provider_name': 'testProvider',
        },
      });
      expect(otelHook['spanMap'].has(hookContext)).toBeTruthy;
    });
  });

  describe('after hook', () => {
    it('should set the variant as a span attribute', () => {
      const evaluationDetails: EvaluationDetails<boolean> = {
        flagKey: hookContext.flagKey,
        value: true,
        variant: 'enabled',
      }; // The before hook should

      otelHook.before(hookContext);
      otelHook.after(hookContext, evaluationDetails);

      expect(setAttribute).toBeCalledWith(
        'feature_flag.evaluated_variant',
        'enabled'
      );
    });

    it('should set the value as a span attribute', () => {
      const evaluationDetails: EvaluationDetails<boolean> = {
        flagKey: hookContext.flagKey,
        value: true,
      }; // The before hook should

      otelHook.before(hookContext);
      otelHook.after(hookContext, evaluationDetails);

      expect(setAttribute).toBeCalledWith(
        'feature_flag.evaluated_value',
        'true'
      );
    });

    it('should set the value without extra quotes if value is already string', () => {
      const evaluationDetails: EvaluationDetails<string> = {
        flagKey: hookContext.flagKey,
        value: 'already-string',
      };

      otelHook.before(hookContext);
      otelHook.after(hookContext, evaluationDetails);

      expect(setAttribute).toBeCalledWith(
        'feature_flag.evaluated_value',
        'already-string'
      );
    });
  });

  describe('error hook', () => {
    const testError = new Error();

    it('should not call recordException because the span is undefined', () => {
      otelHook.error(hookContext, testError);
      expect(otelHook['spanMap'].has(hookContext)).toBeFalsy;
      expect(recordException).not.toBeCalledWith(testError);
    });

    it('should call recordException with a test error', () => {
      otelHook.before(hookContext);
      otelHook.error(hookContext, testError);
      expect(otelHook['spanMap'].has(hookContext)).toBeTruthy;
      expect(recordException).toBeCalledWith(testError);
    });
  });

  describe('finally hook', () => {
    it('should not call end because the span is undefined', () => {
      otelHook.finally(hookContext);
      expect(otelHook['spanMap'].has(hookContext)).toBeFalsy;
      expect(end).not.toBeCalled();
    });

    it('should call end to finish the span', () => {
      otelHook.before(hookContext);
      otelHook.finally(hookContext);
      expect(otelHook['spanMap'].has(hookContext)).toBeTruthy;
      expect(end).toBeCalled();
    });
  });
});

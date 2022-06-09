import {
  Client,
  EvaluationDetails,
  HookContext,
  Provider,
} from '@openfeature/nodejs-sdk';

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
import { OpenTelemetryHook } from './hooks-opentelemetry';

describe('OpenTelemetry Hooks', () => {
  const hookContext: HookContext = {
    flagKey: 'testFlagKey',
    client: {
      name: 'testClient',
    } as Client,
    provider: {
      name: 'testProvider',
    } as Provider,
    context: {},
    defaultValue: true,
    flagValueType: 'boolean',
  };
  let otelHook: OpenTelemetryHook;

  beforeEach(() => {
    otelHook = new OpenTelemetryHook('test');
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
    expect(setAttribute).toBeCalledWith('feature_flag.evaluated.value', 'true');
    otelHook.error(hookContext, testError);
    expect(recordException).toBeCalledWith(testError);
    otelHook.finally(hookContext);
    expect(end).toBeCalled();
  });

  describe('before hook', () => {
    it('should start a new span', () => {
      expect(otelHook.before(hookContext)).toBeUndefined();

      expect(getTracer).toBeCalled();
      expect(startSpan).toBeCalledWith('feature flag - boolean');
      expect(setAttributes).toBeCalledWith({
        'feature_flag.client.name': 'testClient',
        'feature_flag.client.version': undefined,
        'feature_flag.flag_key': 'testFlagKey',
        'feature_flag.provider.name': 'testProvider',
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
      };

      // The before hook should
      otelHook.before(hookContext);
      otelHook.after(hookContext, evaluationDetails);
      expect(setAttribute).toBeCalledWith(
        'feature_flag.evaluated.variant',
        'enabled'
      );
    });

    it('should set the value as a span attribute', () => {
      const evaluationDetails: EvaluationDetails<boolean> = {
        flagKey: hookContext.flagKey,
        value: true,
      };

      // The before hook should
      otelHook.before(hookContext);
      otelHook.after(hookContext, evaluationDetails);
      expect(setAttribute).toBeCalledWith(
        'feature_flag.evaluated.value',
        'true'
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

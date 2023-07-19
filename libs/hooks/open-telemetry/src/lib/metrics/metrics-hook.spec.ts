import { BeforeHookContext, EvaluationDetails, HookContext, StandardResolutionReasons } from '@openfeature/js-sdk';
import opentelemetry from '@opentelemetry/api';
import {
  DataPoint,
  MeterProvider,
  MetricReader,
  ScopeMetrics,
} from '@opentelemetry/sdk-metrics';
import { ACTIVE_COUNT_NAME, ERROR_TOTAL_NAME, REQUESTS_TOTAL_NAME, SUCCESS_TOTAL_NAME } from '../constants';
import { MetricsHook } from './metrics-hook';

// no-op "in-memory" reader
class InMemoryMetricReader extends MetricReader {
  protected onShutdown(): Promise<void> {
    return Promise.resolve();
  }
  protected onForceFlush(): Promise<void> {
    return Promise.resolve();
  }
}

describe(MetricsHook.name, () => {
  let reader: MetricReader;

  beforeAll(() => {
    reader = new InMemoryMetricReader();
    const provider = new MeterProvider();

    provider.addMetricReader(reader);

    // Set this MeterProvider to be global to the app being instrumented.
    const successful = opentelemetry.metrics.setGlobalMeterProvider(provider);
    expect(successful).toBeTruthy();
  });

  describe(MetricsHook.prototype.before, () => {
    it('should increment evaluation_active_count and evaluation_requests_total and set attrs', async () => {
      const FLAG_KEY = 'before-test-key';
      const PROVIDER_NAME = 'before-provider-name';
      const hook = new MetricsHook();
      const mockHookContext: BeforeHookContext = {
        flagKey: FLAG_KEY,
        providerMetadata: {
          name: PROVIDER_NAME,
        },
      } as BeforeHookContext;

      hook.before(mockHookContext);
      const result = await reader.collect();
      expect(
        hasDataPointMatching(
          result.resourceMetrics.scopeMetrics,
          ACTIVE_COUNT_NAME,
          0,
          (point) =>
            point.value === 1 && point.attributes.key === FLAG_KEY && point.attributes.provider === PROVIDER_NAME
        )
      ).toBeTruthy();
      expect(
        hasDataPointMatching(
          result.resourceMetrics.scopeMetrics,
          REQUESTS_TOTAL_NAME,
          0,
          (point) =>
            point.value === 1 && point.attributes.key === FLAG_KEY && point.attributes.provider === PROVIDER_NAME
        )
      ).toBeTruthy();
    });
  });

  describe(MetricsHook.prototype.after, () => {
    describe('variant set', () => {
      it('should increment evaluation_success_total and set attrs with variant = variant', async () => {
        const FLAG_KEY = 'after-test-key';
        const PROVIDER_NAME = 'after-provider-name';
        const VARIANT = 'one';
        const VALUE = 1;
        const hook = new MetricsHook();
        const mockHookContext: HookContext = {
          flagKey: FLAG_KEY,
          providerMetadata: {
            name: PROVIDER_NAME,
          },
        } as HookContext;
        const evaluationDetails: EvaluationDetails<number> = {
          variant: VARIANT,
          value: VALUE,
          reason: StandardResolutionReasons.STATIC,
        } as EvaluationDetails<number>;

        hook.after(mockHookContext, evaluationDetails);
        const result = await reader.collect();
        expect(
          hasDataPointMatching(
            result.resourceMetrics.scopeMetrics,
            SUCCESS_TOTAL_NAME,
            0,
            (point) =>
              point.value === 1 &&
              point.attributes.key === FLAG_KEY &&
              point.attributes.provider === PROVIDER_NAME &&
              point.attributes.variant === VARIANT &&
              point.attributes.reason === StandardResolutionReasons.STATIC
          )
        ).toBeTruthy();
      });

      it('should increment evaluation_success_total and set attrs with variant = value', async () => {
        const FLAG_KEY = 'after-test-key';
        const PROVIDER_NAME = 'after-provider-name';
        const VALUE = 1;
        const hook = new MetricsHook();
        const mockHookContext: HookContext = {
          flagKey: FLAG_KEY,
          providerMetadata: {
            name: PROVIDER_NAME,
          },
        } as HookContext;
        const evaluationDetails: EvaluationDetails<number> = {
          value: VALUE,
          reason: StandardResolutionReasons.STATIC,
        } as EvaluationDetails<number>;

        hook.after(mockHookContext, evaluationDetails);
        const result = await reader.collect();
        expect(
          hasDataPointMatching(
            result.resourceMetrics.scopeMetrics,
            SUCCESS_TOTAL_NAME,
            1,
            (point) =>
              point.value === 1 &&
              point.attributes.key === FLAG_KEY &&
              point.attributes.provider === PROVIDER_NAME &&
              point.attributes.variant === VALUE.toString() &&
              point.attributes.reason === StandardResolutionReasons.STATIC
          )
        ).toBeTruthy();
      });
    });
  });

  describe(MetricsHook.prototype.finally, () => {
    it('should decrement evaluation_success_total and set attrs', async () => {
      const FLAG_KEY = 'finally-test-key';
      const PROVIDER_NAME = 'finally-provider-name';
      const hook = new MetricsHook();
      const mockHookContext: HookContext = {
        flagKey: FLAG_KEY,
        providerMetadata: {
          name: PROVIDER_NAME,
        },
      } as HookContext;

      hook.finally(mockHookContext);
      const result = await reader.collect();
      expect(
        hasDataPointMatching(
          result.resourceMetrics.scopeMetrics,
          ACTIVE_COUNT_NAME,
          1,
          (point) =>
            point.value === -1 && point.attributes.key === FLAG_KEY && point.attributes.provider === PROVIDER_NAME
        )
      ).toBeTruthy();
    });
  });

  describe(MetricsHook.prototype.error, () => {
    it('should decrement evaluation_success_total and set attrs', async () => {
      const FLAG_KEY = 'error-test-key';
      const PROVIDER_NAME = 'error-provider-name';
      const ERROR_MESSAGE = 'error message';
      const error = new Error(ERROR_MESSAGE);
      const hook = new MetricsHook();
      const mockHookContext: HookContext = {
        flagKey: FLAG_KEY,
        providerMetadata: {
          name: PROVIDER_NAME,
        },
      } as HookContext;

      hook.error(mockHookContext, error);
      const result = await reader.collect();
      expect(
        hasDataPointMatching(
          result.resourceMetrics.scopeMetrics,
          ERROR_TOTAL_NAME,
          0,
          (point) =>
            point.value === 1 && point.attributes.key === FLAG_KEY && point.attributes.provider === PROVIDER_NAME
        )
      ).toBeTruthy();
    });
  });
});

const hasDataPointMatching = (
  scopeMetrics: ScopeMetrics[],
  metricName: string,
  dataPointIndex: number,
  dataPointMatcher: (dataPoint: DataPoint<number>) => boolean
) => {
  const found = scopeMetrics.find((sm) =>
    sm.metrics.find((m) => {
      const point = m.dataPoints[dataPointIndex] as DataPoint<number>;
      if (point) {
        return m.descriptor.name === metricName && dataPointMatcher(point);
      }
    })
  );
  if (!found) {
    throw Error('Unable to find matching datapoint');
  }
  return found;
};

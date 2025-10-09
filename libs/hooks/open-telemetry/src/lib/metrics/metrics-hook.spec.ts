import type { BeforeHookContext, EvaluationDetails, HookContext } from '@openfeature/core';
import { TelemetryAttribute } from '@openfeature/core';
import { StandardResolutionReasons } from '@openfeature/core';
import opentelemetry from '@opentelemetry/api';
import type { DataPoint, ScopeMetrics } from '@opentelemetry/sdk-metrics';
import { MeterProvider, MetricReader } from '@opentelemetry/sdk-metrics';
import { ACTIVE_COUNT_NAME, ERROR_TOTAL_NAME, REQUESTS_TOTAL_NAME, SUCCESS_TOTAL_NAME } from '../conventions';
import { MetricsHook } from './metrics-hook';
import type { AttributeMapper } from '../otel-hook';

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

  describe('before stage', () => {
    it('should increment evaluation_active_count and evaluation_requests_total and set attrs', async () => {
      const FLAG_KEY = 'before-test-key';
      const PROVIDER_NAME = 'before-provider-name';
      const mockHookContext: BeforeHookContext = {
        flagKey: FLAG_KEY,
        providerMetadata: {
          name: PROVIDER_NAME,
        },
      } as BeforeHookContext;

      const hook = new MetricsHook();
      hook.before(mockHookContext);
      const result = await reader.collect();
      expect(
        hasDataPointMatching(
          result.resourceMetrics.scopeMetrics,
          ACTIVE_COUNT_NAME,
          0,
          (point) =>
            point.value === 1 &&
            point.attributes[TelemetryAttribute.KEY] === FLAG_KEY &&
            point.attributes[TelemetryAttribute.PROVIDER] === PROVIDER_NAME,
        ),
      ).toBeTruthy();
      expect(
        hasDataPointMatching(
          result.resourceMetrics.scopeMetrics,
          REQUESTS_TOTAL_NAME,
          0,
          (point) =>
            point.value === 1 &&
            point.attributes[TelemetryAttribute.KEY] === FLAG_KEY &&
            point.attributes[TelemetryAttribute.PROVIDER] === PROVIDER_NAME,
        ),
      ).toBeTruthy();
    });
  });

  describe('after stage', () => {
    describe('variant set', () => {
      it('should increment evaluation_success_total and set attrs with variant = variant', async () => {
        const FLAG_KEY = 'after-test-key';
        const PROVIDER_NAME = 'after-provider-name';
        const VARIANT = 'one';
        const VALUE = 1;
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

        const hook = new MetricsHook();
        hook.after(mockHookContext, evaluationDetails);
        const result = await reader.collect();
        expect(
          hasDataPointMatching(
            result.resourceMetrics.scopeMetrics,
            SUCCESS_TOTAL_NAME,
            0,
            (point) =>
              point.value === 1 &&
              point.attributes[TelemetryAttribute.KEY] === FLAG_KEY &&
              point.attributes[TelemetryAttribute.PROVIDER] === PROVIDER_NAME &&
              point.attributes[TelemetryAttribute.VARIANT] === VARIANT &&
              point.attributes[TelemetryAttribute.REASON] === StandardResolutionReasons.STATIC,
          ),
        ).toBeTruthy();
      });

      it('should increment evaluation_success_total and set attrs with variant = value', async () => {
        const FLAG_KEY = 'after-test-key';
        const PROVIDER_NAME = 'after-provider-name';
        const VALUE = 1;
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

        const hook = new MetricsHook();
        hook.after(mockHookContext, evaluationDetails);
        const result = await reader.collect();
        expect(
          hasDataPointMatching(
            result.resourceMetrics.scopeMetrics,
            SUCCESS_TOTAL_NAME,
            1,
            (point) =>
              point.value === 1 &&
              point.attributes[TelemetryAttribute.KEY] === FLAG_KEY &&
              point.attributes[TelemetryAttribute.PROVIDER] === PROVIDER_NAME &&
              point.attributes[TelemetryAttribute.VARIANT] === VALUE.toString() &&
              point.attributes[TelemetryAttribute.REASON] === StandardResolutionReasons.STATIC,
          ),
        ).toBeTruthy();
      });
    });

    describe('attributeMapper defined', () => {
      it('should run attribute mapper', async () => {
        const FLAG_KEY = 'after-test-key';
        const PROVIDER_NAME = 'after-provider-name';
        const VARIANT = 'two';
        const VALUE = 2;
        const CUSTOM_ATTR_KEY_1 = 'custom1';
        const CUSTOM_ATTR_KEY_2 = 'custom2';
        const CUSTOM_ATTR_VALUE_1 = 'value1';
        const CUSTOM_ATTR_VALUE_2 = 500;
        const mockHookContext: HookContext = {
          flagKey: FLAG_KEY,
          providerMetadata: {
            name: PROVIDER_NAME,
          },
        } as HookContext;
        const evaluationDetails: EvaluationDetails<number> = {
          flagKey: FLAG_KEY,
          variant: VARIANT,
          value: VALUE,
          reason: StandardResolutionReasons.STATIC,
          flagMetadata: {
            [CUSTOM_ATTR_KEY_1]: CUSTOM_ATTR_VALUE_1,
            [CUSTOM_ATTR_KEY_2]: CUSTOM_ATTR_VALUE_2,
          },
        } as EvaluationDetails<number>;

        // configure a mapper for our custom properties
        const attributeMapper: AttributeMapper = (_, { flagMetadata }) => {
          return {
            [CUSTOM_ATTR_KEY_1]: flagMetadata[CUSTOM_ATTR_KEY_1],
            [CUSTOM_ATTR_KEY_2]: flagMetadata[CUSTOM_ATTR_KEY_2],
          };
        };
        const hook = new MetricsHook({ attributeMapper });

        hook.after(mockHookContext, evaluationDetails);
        const result = await reader.collect();
        expect(
          hasDataPointMatching(
            result.resourceMetrics.scopeMetrics,
            SUCCESS_TOTAL_NAME,
            2,
            (point) =>
              point.value === 1 &&
              point.attributes[TelemetryAttribute.KEY] === FLAG_KEY &&
              point.attributes[TelemetryAttribute.PROVIDER] === PROVIDER_NAME &&
              point.attributes[TelemetryAttribute.VARIANT] === VARIANT &&
              point.attributes[TelemetryAttribute.REASON] === StandardResolutionReasons.STATIC &&
              // custom attributes should be present
              point.attributes[CUSTOM_ATTR_KEY_1] === CUSTOM_ATTR_VALUE_1 &&
              point.attributes[CUSTOM_ATTR_KEY_2] === CUSTOM_ATTR_VALUE_2,
          ),
        ).toBeTruthy();
      });
    });

    describe('attributeMapper throws', () => {
      it('should no-op', async () => {
        const FLAG_KEY = 'after-test-key';
        const PROVIDER_NAME = 'after-provider-name';
        const VARIANT = 'three';
        const VALUE = 3;
        const mockHookContext: HookContext = {
          flagKey: FLAG_KEY,
          providerMetadata: {
            name: PROVIDER_NAME,
          },
        } as HookContext;
        const evaluationDetails: EvaluationDetails<number> = {
          flagKey: FLAG_KEY,
          variant: VARIANT,
          value: VALUE,
          reason: StandardResolutionReasons.STATIC,
        } as EvaluationDetails<number>;

        // configure a mapper that throws
        const attributeMapper: AttributeMapper = () => {
          throw new Error('fake error');
        };
        const hook = new MetricsHook({ attributeMapper });

        hook.after(mockHookContext, evaluationDetails);
        const result = await reader.collect();
        expect(
          hasDataPointMatching(
            result.resourceMetrics.scopeMetrics,
            SUCCESS_TOTAL_NAME,
            3,
            (point) =>
              point.value === 1 &&
              point.attributes[TelemetryAttribute.KEY] === FLAG_KEY &&
              point.attributes[TelemetryAttribute.PROVIDER] === PROVIDER_NAME &&
              point.attributes[TelemetryAttribute.VARIANT] === VARIANT &&
              point.attributes[TelemetryAttribute.REASON] === StandardResolutionReasons.STATIC,
          ),
        ).toBeTruthy();
      });
    });
  });

  describe('finally stage', () => {
    it('should decrement evaluation_success_total and set attrs', async () => {
      const FLAG_KEY = 'finally-test-key';
      const PROVIDER_NAME = 'finally-provider-name';
      const mockHookContext: HookContext = {
        flagKey: FLAG_KEY,
        providerMetadata: {
          name: PROVIDER_NAME,
        },
      } as HookContext;

      const hook = new MetricsHook();
      hook.finally(mockHookContext);
      const result = await reader.collect();
      expect(
        hasDataPointMatching(
          result.resourceMetrics.scopeMetrics,
          ACTIVE_COUNT_NAME,
          1,
          (point) =>
            point.value === -1 &&
            point.attributes[TelemetryAttribute.KEY] === FLAG_KEY &&
            point.attributes[TelemetryAttribute.PROVIDER] === PROVIDER_NAME,
        ),
      ).toBeTruthy();
    });
  });

  describe('error stage', () => {
    it('should decrement evaluation_success_total and set attrs', async () => {
      const FLAG_KEY = 'error-test-key';
      const PROVIDER_NAME = 'error-provider-name';
      const ERROR_MESSAGE = 'error message';
      const error = new Error(ERROR_MESSAGE);
      const mockHookContext: HookContext = {
        flagKey: FLAG_KEY,
        providerMetadata: {
          name: PROVIDER_NAME,
        },
      } as HookContext;

      const hook = new MetricsHook();
      hook.error(mockHookContext, error);
      const result = await reader.collect();
      expect(
        hasDataPointMatching(
          result.resourceMetrics.scopeMetrics,
          ERROR_TOTAL_NAME,
          0,
          (point) =>
            point.value === 1 &&
            point.attributes[TelemetryAttribute.KEY] === FLAG_KEY &&
            point.attributes[TelemetryAttribute.PROVIDER] === PROVIDER_NAME,
        ),
      ).toBeTruthy();
    });
  });
});

const hasDataPointMatching = (
  scopeMetrics: ScopeMetrics[],
  metricName: string,
  dataPointIndex: number,
  dataPointMatcher: (dataPoint: DataPoint<number>) => boolean,
) => {
  const found = scopeMetrics.find((sm) =>
    sm.metrics.find((m) => {
      const point = m.dataPoints[dataPointIndex] as DataPoint<number>;
      if (point) {
        return m.descriptor.name === metricName && dataPointMatcher(point);
      }
    }),
  );
  if (!found) {
    throw Error('Unable to find matching datapoint');
  }
  return found;
};

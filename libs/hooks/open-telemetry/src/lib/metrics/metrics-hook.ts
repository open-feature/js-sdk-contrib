import {
  BeforeHookContext,
  StandardResolutionReasons,
  type EvaluationDetails,
  type FlagValue,
  type Hook,
  type HookContext,
} from '@openfeature/js-sdk';
import { Counter, UpDownCounter, ValueType, metrics } from '@opentelemetry/api';
import {
  ACTIVE_COUNT_NAME,
  ERROR_ATTR,
  ERROR_TOTAL_NAME,
  EvaluationAttributes,
  ExceptionAttribute,
  KEY_ATTR,
  PROVIDER_NAME_ATTR,
  REASON_ATTR,
  REQUESTS_TOTAL_NAME,
  SUCCESS_TOTAL_NAME,
  VARIANT_ATTR
} from '../attributes';

type ErrorEvaluationAttributes = EvaluationAttributes & ExceptionAttribute;

const METER_NAME = 'js.openfeature.dev';

const ACTIVE_DESCRIPTION = 'active flag evaluations counter';
const REQUESTS_DESCRIPTION = 'feature flag evaluation request counter';
const SUCCESS_DESCRIPTION = 'feature flag evaluation success counter';
const ERROR_DESCRIPTION = 'feature flag evaluation error counter';

export class MetricsHook implements Hook {
  private readonly evaluationActiveUpDownCounter: UpDownCounter<EvaluationAttributes>;
  private readonly evaluationRequestCounter: Counter<EvaluationAttributes>;
  private readonly evaluationSuccessCounter: Counter<EvaluationAttributes>;
  private readonly evaluationErrorCounter: Counter<ErrorEvaluationAttributes>;

  constructor() {
    const meter = metrics.getMeter(METER_NAME);
    this.evaluationActiveUpDownCounter = meter.createUpDownCounter(ACTIVE_COUNT_NAME, {
      description: ACTIVE_DESCRIPTION,
      valueType: ValueType.INT,
    });
    this.evaluationRequestCounter = meter.createCounter(REQUESTS_TOTAL_NAME, {
      description: REQUESTS_DESCRIPTION,
      valueType: ValueType.INT,
    });
    this.evaluationSuccessCounter = meter.createCounter(SUCCESS_TOTAL_NAME, {
      description: SUCCESS_DESCRIPTION,
      valueType: ValueType.INT,
    });
    this.evaluationErrorCounter = meter.createCounter(ERROR_TOTAL_NAME, {
      description: ERROR_DESCRIPTION,
      valueType: ValueType.INT,
    });
  }

  before(hookContext: BeforeHookContext) {
    const attributes: EvaluationAttributes = {
      [KEY_ATTR]: hookContext.flagKey,
      [PROVIDER_NAME_ATTR]: hookContext.providerMetadata.name,
    };
    this.evaluationActiveUpDownCounter.add(1, attributes);
    this.evaluationRequestCounter.add(1, attributes);
  }

  after(hookContext: Readonly<HookContext<FlagValue>>, evaluationDetails: EvaluationDetails<FlagValue>) {
    this.evaluationSuccessCounter.add(1, {
      [KEY_ATTR]: hookContext.flagKey,
      [PROVIDER_NAME_ATTR]: hookContext.providerMetadata.name,
      [VARIANT_ATTR]: evaluationDetails.variant ?? evaluationDetails.value?.toString(),
      [REASON_ATTR]: evaluationDetails.reason ?? StandardResolutionReasons.UNKNOWN,
    });
  }

  error(hookContext: Readonly<HookContext<FlagValue>>, error: unknown) {
    this.evaluationErrorCounter.add(1, {
      [KEY_ATTR]: hookContext.flagKey,
      [PROVIDER_NAME_ATTR]: hookContext.providerMetadata.name,
      [ERROR_ATTR]: (error as Error)?.message || 'Unknown error',
    });
  }

  finally(hookContext: Readonly<HookContext<FlagValue>>) {
    this.evaluationActiveUpDownCounter.add(-1, {
      [KEY_ATTR]: hookContext.flagKey,
      [PROVIDER_NAME_ATTR]: hookContext.providerMetadata.name,
    });
  }
}

import {
  NOTIFICATION_TYPES,
  OptimizelyDecideOption,
  type Client,
  type EventTags,
  type OptimizelyDecision,
  type UserAttributes,
} from '@optimizely/optimizely-sdk';
import {
  FlagNotFoundError,
  GeneralError,
  OpenFeatureEventEmitter,
  ProviderEvents,
  ProviderNotReadyError,
  StandardResolutionReasons,
  TargetingKeyMissingError,
  TypeMismatchError,
  type EvaluationContext,
  type JsonValue,
  type Logger,
  type Provider,
  type ResolutionDetails,
  type TrackingEventDetails,
} from '@openfeature/web-sdk';

export interface OptimizelyWebProviderOptions {
  /** Close the supplied Optimizely client when the provider is closed. Defaults to false. */
  closeClientOnShutdown?: boolean;
  /** Options applied to every Optimizely flag decision. */
  decideOptions?: OptimizelyDecideOption[];
}

type EvaluationValueType = 'boolean' | 'string' | 'number' | 'object';

const NOOP_LOGGER: Logger = {
  error: () => undefined,
  warn: () => undefined,
  info: () => undefined,
  debug: () => undefined,
};

/**
 * An OpenFeature web provider backed by a browser-configured Optimizely client.
 *
 * The client is supplied by the application, so its datafile lifecycle and SDK
 * key never need to be represented in OpenFeature configuration.
 */
export class OptimizelyWebProvider implements Provider {
  readonly metadata = {
    name: OptimizelyWebProvider.name,
  };

  readonly runsOn = 'client';
  readonly hooks = [];
  readonly events = new OpenFeatureEventEmitter();

  private readonly closeClientOnShutdown: boolean;
  private readonly decideOptions: OptimizelyDecideOption[];
  private configUpdateListenerId?: number;
  private initialized = false;
  private initializationPromise?: Promise<void>;
  private closePromise?: Promise<void>;

  constructor(
    private readonly client: Client,
    options: OptimizelyWebProviderOptions = {},
  ) {
    if (options.decideOptions?.includes(OptimizelyDecideOption.EXCLUDE_VARIABLES)) {
      throw new TypeError('EXCLUDE_VARIABLES is incompatible with OpenFeature value resolution.');
    }

    this.closeClientOnShutdown = options.closeClientOnShutdown ?? false;
    this.decideOptions = [...(options.decideOptions ?? [])];
  }

  initialize(): Promise<void> {
    if (this.closePromise) {
      return Promise.reject(new ProviderNotReadyError('The Optimizely provider is closing or has been closed.'));
    }
    if (this.initialized) {
      return Promise.resolve();
    }

    this.initializationPromise ??= this.initializeClient().catch((error) => {
      this.initializationPromise = undefined;
      throw error;
    });
    return this.initializationPromise;
  }

  private async initializeClient(): Promise<void> {
    try {
      await this.client.onReady();
    } catch (error) {
      throw new GeneralError(`Optimizely client initialization failed: ${errorMessage(error)}`);
    }

    const listenerId = this.client.notificationCenter.addNotificationListener(
      NOTIFICATION_TYPES.OPTIMIZELY_CONFIG_UPDATE,
      () => this.events.emit(ProviderEvents.ConfigurationChanged),
    );
    if (listenerId < 1) {
      throw new GeneralError('Unable to register the Optimizely configuration update listener.');
    }

    this.configUpdateListenerId = listenerId;
    this.initialized = true;
  }

  onClose(): Promise<void> {
    this.closePromise ??= this.close();
    return this.closePromise;
  }

  resolveBooleanEvaluation(
    flagKey: string,
    _defaultValue: boolean,
    context: EvaluationContext,
    logger: Logger,
  ): ResolutionDetails<boolean> {
    return this.evaluate(flagKey, context, logger, 'boolean');
  }

  resolveStringEvaluation(
    flagKey: string,
    _defaultValue: string,
    context: EvaluationContext,
    logger: Logger,
  ): ResolutionDetails<string> {
    return this.evaluate(flagKey, context, logger, 'string');
  }

  resolveNumberEvaluation(
    flagKey: string,
    _defaultValue: number,
    context: EvaluationContext,
    logger: Logger,
  ): ResolutionDetails<number> {
    return this.evaluate(flagKey, context, logger, 'number');
  }

  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    _defaultValue: T,
    context: EvaluationContext,
    logger: Logger,
  ): ResolutionDetails<T> {
    return this.evaluate<T>(flagKey, context, logger, 'object');
  }

  track(trackingEventName: string, context: EvaluationContext, details: TrackingEventDetails): void {
    this.assertReady();
    const { userId, attributes } = transformContext(context, NOOP_LOGGER);
    const revenue = details['revenue'];
    const hasOptimizelyRevenue = typeof revenue === 'number' && Number.isInteger(revenue);
    const eventProperties = Object.fromEntries(
      Object.entries(details).filter(([key]) => key !== 'value' && !(key === 'revenue' && hasOptimizelyRevenue)),
    );
    const eventTags: EventTags = {
      ...(typeof details.value === 'number' ? { value: details.value } : {}),
      ...(hasOptimizelyRevenue ? { revenue } : {}),
      ...(Object.keys(eventProperties).length > 0 ? { $opt_event_properties: eventProperties } : {}),
    };

    this.client
      .createUserContext(userId, attributes)
      .trackEvent(trackingEventName, Object.keys(eventTags).length > 0 ? eventTags : undefined);
  }

  private evaluate<T extends JsonValue>(
    flagKey: string,
    context: EvaluationContext,
    logger: Logger,
    valueType: EvaluationValueType,
  ): ResolutionDetails<T> {
    this.assertReady();
    const config = this.client.getOptimizelyConfig();
    if (config === null) {
      throw new ProviderNotReadyError('The Optimizely configuration is not available.');
    }
    if (!Object.hasOwn(config.featuresMap, flagKey)) {
      throw new FlagNotFoundError(`Optimizely flag '${flagKey}' was not found.`);
    }

    const { userId, attributes } = transformContext(context, logger);
    const decision = this.client.createUserContext(userId, attributes).decide(flagKey, [...this.decideOptions]);
    return translateDecision<T>(decision, valueType);
  }

  private assertReady(): void {
    if (!this.initialized || this.closePromise) {
      throw new ProviderNotReadyError('The Optimizely provider has not been initialized.');
    }
  }

  private async close(): Promise<void> {
    try {
      await this.initializationPromise;
    } catch {
      // Initialization errors are surfaced to the caller that initiated setup.
    }

    if (this.configUpdateListenerId !== undefined) {
      this.client.notificationCenter.removeNotificationListener(this.configUpdateListenerId);
      this.configUpdateListenerId = undefined;
    }
    this.initialized = false;

    if (this.closeClientOnShutdown) {
      await this.client.close();
    }
  }
}

function transformContext(context: EvaluationContext, logger: Logger): { userId: string; attributes: UserAttributes } {
  const targetingKey = context['targetingKey'];
  if (typeof targetingKey !== 'string' || targetingKey.trim().length === 0) {
    throw new TargetingKeyMissingError('Optimizely evaluations require a non-empty string targetingKey.');
  }

  const attributes: UserAttributes = {};
  for (const [key, value] of Object.entries(context as Record<string, unknown>)) {
    if (key === 'targetingKey') {
      continue;
    }

    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      attributes[key] = value;
      continue;
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      attributes[key] = value.toISOString();
      continue;
    }

    logger.warn(`Ignoring unsupported Optimizely attribute '${key}'.`);
  }

  return { userId: targetingKey, attributes };
}

function translateDecision<T extends JsonValue>(
  decision: OptimizelyDecision,
  valueType: EvaluationValueType,
): ResolutionDetails<T> {
  if (decision.variationKey === null) {
    throw new GeneralError(decision.reasons.join('; ') || 'Optimizely could not make a decision.');
  }

  const variables = Object.values(decision.variables);
  const value = getDecisionValue(variables, decision.variables, decision.enabled, valueType);

  return {
    value: value as T,
    variant: decision.variationKey,
    ...(decision.ruleKey === null ? {} : { flagMetadata: { ruleKey: decision.ruleKey } }),
    reason: decision.enabled ? StandardResolutionReasons.UNKNOWN : StandardResolutionReasons.DISABLED,
  };
}

function getDecisionValue(
  variables: unknown[],
  variablesMap: Record<string, unknown>,
  enabled: boolean,
  valueType: EvaluationValueType,
): JsonValue {
  if (variables.length === 0) {
    if (valueType === 'boolean') {
      return enabled;
    }
    throwTypeMismatch(valueType, 'a flag with no variables');
  }

  if (variables.length > 1) {
    if (valueType === 'object' && isJsonValue(variablesMap)) {
      return variablesMap;
    }
    throwTypeMismatch(valueType, 'a flag with multiple variables');
  }

  const [variable] = variables;
  if (isExpectedType(variable, valueType)) {
    return variable;
  }
  throwTypeMismatch(valueType, `a ${describeValue(variable)} variable`);
}

function isExpectedType(value: unknown, valueType: EvaluationValueType): value is JsonValue {
  switch (valueType) {
    case 'boolean':
    case 'string':
    case 'number':
      return typeof value === valueType;
    case 'object':
      return (value === null || typeof value === 'object') && isJsonValue(value);
  }
}

function isJsonValue(value: unknown, visited = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'object' || visited.has(value)) {
    return false;
  }
  if (Array.isArray(value)) {
    visited.add(value);
    const isValid = value.every((item) => isJsonValue(item, visited));
    visited.delete(value);
    return isValid;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    return false;
  }
  visited.add(value);
  const isValid = Object.values(value).every((item) => isJsonValue(item, visited));
  visited.delete(value);
  return isValid;
}

function throwTypeMismatch(valueType: EvaluationValueType, actual: string): never {
  throw new TypeMismatchError(`Cannot resolve ${actual} as an OpenFeature ${valueType} value.`);
}

function describeValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

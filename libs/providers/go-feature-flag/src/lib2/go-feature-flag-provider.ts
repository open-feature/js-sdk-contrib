import {
  EvaluationContext,
  Hook,
  JsonValue,
  Logger,
  OpenFeatureEventEmitter,
  Provider,
  ResolutionDetails,
} from '@openfeature/server-sdk';
import { GoFeatureFlagProviderOptions } from '../lib/model';

// implement the provider interface
class GoFeatureFlagProvider implements Provider {
  public readonly runsOn = 'server';
  metadata = {
    name: GoFeatureFlagProvider.name,
  } as const;
  events = new OpenFeatureEventEmitter();

  // TODO: Define the hooks to use
  hooks?: Hook[];

  /**
   * Constructor for the GoFeatureFlagProvider, it initializes the provider with the given options and logger.
   * @param options - The options for the GoFeatureFlagProvider.
   * @param logger - An optional logger for logging messages.
   */
  constructor(options: GoFeatureFlagProviderOptions, logger?: Logger) {}

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<boolean>> {
    // code to evaluate a boolean
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<string>> {
    // code to evaluate a string
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<number>> {
    // code to evaluate a number
  }

  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<T>> {
    // code to evaluate an object
  }

  initialize?(context?: EvaluationContext | undefined): Promise<void> {
    // code to initialize your provider
  }

  onClose?(): Promise<void> {
    // code to shut down your provider
  }
}

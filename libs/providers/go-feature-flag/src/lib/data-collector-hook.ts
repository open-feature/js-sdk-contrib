import {
  EvaluationDetails,
  FlagValue,
  Hook,
  HookContext,
  Logger,
  StandardResolutionReasons,
} from '@openfeature/server-sdk';
import { DataCollectorHookOptions, FeatureEvent } from './model';
import { copy } from 'copy-anything';
import { CollectorError } from './errors/collector-error';
import { GoffApiController } from './controller/goff-api';

const defaultTargetingKey = 'undefined-targetingKey';

export class GoFeatureFlagDataCollectorHook implements Hook {
  // collectUnCachedEvent (optional) set to true if you want to send all events not only the cached evaluations.
  collectUnCachedEvaluation?: boolean;
  // bgSchedulerId contains the id of the setInterval that is running.
  private bgScheduler?: NodeJS.Timeout | number;
  // dataCollectorBuffer contains all the FeatureEvents that we need to send to the relay-proxy for data collection.
  private dataCollectorBuffer?: FeatureEvent<any>[];
  // dataFlushInterval interval time (in millisecond) we use to call the relay proxy to collect data.
  private readonly dataFlushInterval: number;
  // dataCollectorMetadata are the metadata used when calling the data collector endpoint
  private readonly dataCollectorMetadata: Record<string, string> = {
    provider: 'open-feature-js-sdk',
  };
  private readonly goffApiController: GoffApiController;
  // logger is the Open Feature logger to use
  private logger?: Logger;

  constructor(options: DataCollectorHookOptions, goffApiController: GoffApiController, logger?: Logger) {
    this.dataFlushInterval = options.dataFlushInterval || 1000 * 60;
    this.logger = logger;
    this.goffApiController = goffApiController;
    this.collectUnCachedEvaluation = options.collectUnCachedEvaluation;
  }

  init() {
    this.bgScheduler = setInterval(async () => await this.callGoffDataCollection(), this.dataFlushInterval);
    this.dataCollectorBuffer = [];
  }

  async close() {
    clearInterval(this.bgScheduler);
    // We call the data collector with what is still in the buffer.
    await this.callGoffDataCollection();
  }

  /**
   * callGoffDataCollection is a function called periodically to send the usage of the flag to the
   * central service in charge of collecting the data.
   */
  async callGoffDataCollection() {
    const dataToSend = copy(this.dataCollectorBuffer) || [];
    this.dataCollectorBuffer = [];
    try {
      await this.goffApiController.collectData(dataToSend, this.dataCollectorMetadata);
    } catch (e) {
      if (!(e instanceof CollectorError)) {
        throw e;
      }
      this.logger?.error(e);
      // if we have an issue calling the collector, we put the data back in the buffer
      this.dataCollectorBuffer = [...this.dataCollectorBuffer, ...dataToSend];
      return;
    }
  }

  after(hookContext: HookContext, evaluationDetails: EvaluationDetails<FlagValue>) {
    if (!this.collectUnCachedEvaluation && evaluationDetails.reason !== StandardResolutionReasons.CACHED) {
      return;
    }

    const event = {
      contextKind: hookContext.context['anonymous'] ? 'anonymousUser' : 'user',
      kind: 'feature',
      creationDate: Math.round(Date.now() / 1000),
      default: false,
      key: hookContext.flagKey,
      value: evaluationDetails.value,
      variation: evaluationDetails.variant || 'SdkDefault',
      userKey: hookContext.context.targetingKey || defaultTargetingKey,
    };
    this.dataCollectorBuffer?.push(event);
  }

  error(hookContext: HookContext) {
    const event = {
      contextKind: hookContext.context['anonymous'] ? 'anonymousUser' : 'user',
      kind: 'feature',
      creationDate: Math.round(Date.now() / 1000),
      default: true,
      key: hookContext.flagKey,
      value: hookContext.defaultValue,
      variation: 'SdkDefault',
      userKey: hookContext.context.targetingKey || defaultTargetingKey,
    };
    this.dataCollectorBuffer?.push(event);
  }
}

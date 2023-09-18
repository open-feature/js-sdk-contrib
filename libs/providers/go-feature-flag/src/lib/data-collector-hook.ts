import {
  EvaluationDetails,
  FlagValue,
  Hook,
  HookContext,
  HookHints, Logger, StandardResolutionReasons,
} from '@openfeature/js-sdk';
import {
  DataCollectorHookOptions,
  DataCollectorRequest,
  DataCollectorResponse,
  FeatureEvent,
} from './model';
import {copy} from 'copy-anything';
import axios from 'axios';


const defaultTargetingKey = 'undefined-targetingKey';
export class GoFeatureFlagDataCollectorHook implements Hook {

  // bgSchedulerId contains the id of the setInterval that is running.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  private bgScheduler?: NodeJS.Timer;

  // dataCollectorBuffer contains all the FeatureEvents that we need to send to the relay-proxy for data collection.
  private dataCollectorBuffer?: FeatureEvent<any>[];

  // dataFlushInterval interval time (in millisecond) we use to call the relay proxy to collect data.
  private readonly dataFlushInterval: number;

  // dataCollectorMetadata are the metadata used when calling the data collector endpoint
  private readonly dataCollectorMetadata: Record<string, string> = {
    provider: 'open-feature-js-sdk',
  };

  // endpoint of your go-feature-flag relay proxy instance
  private readonly endpoint: string;

  // timeout in millisecond before we consider the request as a failure
  private readonly timeout: number;

  // logger is the Open Feature logger to use
  private logger?: Logger;

  // collectUnCachedEvent (optional) set to true if you want to send all events not only the cached evaluations.
  collectUnCachedEvaluation?: boolean;

  constructor(options: DataCollectorHookOptions, logger?: Logger) {
    this.dataFlushInterval = options.dataFlushInterval || 1000 * 60;
    this.endpoint = options.endpoint;
    this.timeout = options.timeout || 0; // default is 0 = no timeout
    this.logger = logger;
    this.collectUnCachedEvaluation = options.collectUnCachedEvaluation;
  }


  init(){
    this.bgScheduler = setInterval(async () => await this.callGoffDataCollection(), this.dataFlushInterval)
    this.dataCollectorBuffer = []
  }

  async close() {
    clearInterval(this.bgScheduler);
    // We call the data collector with what is still in the buffer.
    await this.callGoffDataCollection()
  }

  /**
   * callGoffDataCollection is a function called periodically to send the usage of the flag to the
   * central service in charge of collecting the data.
   */
  async callGoffDataCollection() {
    if (this.dataCollectorBuffer?.length === 0) {
      return;
    }

    const dataToSend = copy(this.dataCollectorBuffer) || [];
    this.dataCollectorBuffer = [];

    const request: DataCollectorRequest<boolean> = {events: dataToSend, meta: this.dataCollectorMetadata,}
    const endpointURL = new URL(this.endpoint);
    endpointURL.pathname = 'v1/data/collector';

    try {
      await axios.post<DataCollectorResponse>(endpointURL.toString(), request, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: this.timeout,
      });
    } catch (e) {
      this.logger?.error(`impossible to send the data to the collector: ${e}`)
      // if we have an issue calling the collector we put the data back in the buffer
      this.dataCollectorBuffer = [...this.dataCollectorBuffer, ...dataToSend];
    }
  }


  after(
    hookContext: HookContext,
    evaluationDetails: EvaluationDetails<FlagValue>,
    hookHints?: HookHints
  ) {
    if (!this.collectUnCachedEvaluation && evaluationDetails.reason !== StandardResolutionReasons.CACHED){
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

  error(hookContext: HookContext, err: unknown, hookHints?: HookHints) {
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

import { EvaluationDetails, FlagValue, Hook, HookContext } from '@openfeature/web-sdk';
import { CollectorManager } from './collector-manager';

const defaultTargetingKey = 'undefined-targetingKey';
type Timer = ReturnType<typeof setInterval>;

export class GoFeatureFlagDataCollectorHook implements Hook {
  private collectorManagger?: CollectorManager;

  constructor(collectorManager: CollectorManager) {
    this.collectorManagger = collectorManager;
  }

  after(hookContext: HookContext, evaluationDetails: EvaluationDetails<FlagValue>) {
    const event = {
      contextKind: hookContext.context['anonymous'] ? 'anonymousUser' : 'user',
      kind: 'feature',
      creationDate: Math.round(Date.now() / 1000),
      default: false,
      key: hookContext.flagKey,
      value: evaluationDetails.value,
      variation: evaluationDetails.variant || 'SdkDefault',
      userKey: hookContext.context.targetingKey || defaultTargetingKey,
      source: 'PROVIDER_CACHE',
    };
    this.collectorManagger?.add(event);
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
      source: 'PROVIDER_CACHE',
    };
    this.collectorManagger?.add(event);
  }
}

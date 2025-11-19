import type { Hook } from '@openfeature/web-sdk';
import type { EvaluationContext } from '@openfeature/server-sdk';
import type { BeforeHookContext, HookHints } from '@openfeature/core';

export class SyncMetadataHook implements Hook {
  enrichedContext: () => EvaluationContext;

  constructor(enrichedContext: () => EvaluationContext) {
    this.enrichedContext = enrichedContext;
  }

  public before(): EvaluationContext {
    return this.enrichedContext.apply(this);
  }
}

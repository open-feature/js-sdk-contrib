import type { Hook, EvaluationContext, BeforeHookContext, HookHints } from '@openfeature/server-sdk';

export class SyncMetadataHook implements Hook {
  enrichedContext: () => EvaluationContext;

  constructor(enrichedContext: () => EvaluationContext) {
    this.enrichedContext = enrichedContext;
  }

  public before(hookContext: BeforeHookContext, hookHints?: HookHints): EvaluationContext {
    return this.enrichedContext();
  }
}

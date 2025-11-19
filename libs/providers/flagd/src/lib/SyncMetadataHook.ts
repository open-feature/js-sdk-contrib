import {Hook} from "@openfeature/web-sdk";
import { EvaluationContext } from "@openfeature/server-sdk";
import { BeforeHookContext, HookHints } from "@openfeature/core";

export class SyncMetadataHook implements Hook<any> {
  enrichedContext: () => EvaluationContext;

  constructor(enrichedContext: () => EvaluationContext) {
    this.enrichedContext = enrichedContext
  }

  public before(hookContext: BeforeHookContext, hookHints?: HookHints): EvaluationContext {
    return this.enrichedContext.apply(this);
  }
}

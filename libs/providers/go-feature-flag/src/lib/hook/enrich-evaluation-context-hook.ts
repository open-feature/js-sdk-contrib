import type { EvaluationContext, Hook, HookContext, JsonValue } from '@openfeature/server-sdk';
import { ExporterMetadata } from '../model';

/**
 * Enrich the evaluation context with additional information
 */
export class EnrichEvaluationContextHook implements Hook {
  private readonly metadata: ExporterMetadata;

  /**
   * Constructor of the Hook
   * @param metadata - metadata to use in order to enrich the evaluation context
   */
  constructor(metadata?: ExporterMetadata) {
    if (!metadata) {
      this.metadata = new ExporterMetadata();
      return;
    }

    this.metadata = metadata;
  }

  /**
   * Enrich the evaluation context with additional information before the evaluation of the flag
   * @param context - The hook context
   * @param hints - Caller provided data
   * @returns The enriched evaluation context
   */
  async before<T extends JsonValue>(
    context: HookContext<T>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _hints?: Record<string, unknown>,
  ): Promise<EvaluationContext> {
    const enrichedContext = { ...context.context };

    if (this.metadata) {
      const metadataAsObject = this.metadata?.asObject() ?? {};
      if (Object.keys(metadataAsObject).length > 0) {
        enrichedContext['gofeatureflag'] = metadataAsObject;
      }
    }
    return enrichedContext;
  }
}

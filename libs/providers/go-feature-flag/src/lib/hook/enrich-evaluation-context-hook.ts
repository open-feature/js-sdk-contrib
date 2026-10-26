import type { EvaluationContext, Hook, HookContext, JsonValue } from '@openfeature/server-sdk';
import { ExporterMetadata } from '../model';
import { EXPORTER_METADATA_KEY, GO_FEATURE_FLAG_CONTEXT_KEY } from '../helper/constants';

/**
 * Reads an existing `gofeatureflag` entry as a namespace to merge into.
 *
 * The value comes from the caller and carries no guarantee of being an object. Anything that is not
 * a plain map is replaced rather than treated as an error, since a malformed entry must not fail
 * the evaluation.
 * @param value - the current value of the `gofeatureflag` context key, if any
 * @returns the namespace to merge into, empty when there is nothing usable to preserve
 */
function asNamespace(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

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

    // `gofeatureflag` is a namespace shared with the caller, who owns `flagList` and
    // `currentDateTime`. Only `exporterMetadata` belongs to the provider, so the existing entry is
    // merged into rather than replaced: assigning the whole key would silently discard the caller's
    // inputs, and the evaluation would then succeed against the wrong ones.
    enrichedContext[GO_FEATURE_FLAG_CONTEXT_KEY] = {
      ...asNamespace(enrichedContext[GO_FEATURE_FLAG_CONTEXT_KEY]),
      // Nested, not flattened: the relay proxy reads the metadata from `exporterMetadata`, so
      // spreading it directly into the namespace means it is never read.
      [EXPORTER_METADATA_KEY]: this.metadata.asObject(),
    };

    return enrichedContext;
  }
}

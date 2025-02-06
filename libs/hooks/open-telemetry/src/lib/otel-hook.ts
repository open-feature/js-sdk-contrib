import type { FlagMetadata, Logger } from '@openfeature/server-sdk';
import { Attributes } from '@opentelemetry/api';

export type AttributeMapper = (flagMetadata: FlagMetadata) => Attributes;

export type OpenTelemetryHookOptions = {
  /**
   * A function that maps OpenFeature flag metadata values to OpenTelemetry attributes.
   */
  attributeMapper?: AttributeMapper;
};

/**
 * Base class that does some logging and safely wraps the AttributeMapper.
 */
export abstract class OpenTelemetryHook {
  protected safeAttributeMapper: AttributeMapper;
  protected abstract name: string;

  constructor(options?: OpenTelemetryHookOptions, logger?: Logger) {
    this.safeAttributeMapper = (flagMetadata: FlagMetadata) => {
      try {
        return options?.attributeMapper?.(flagMetadata) || {};
      } catch (err) {
        logger?.debug(`${this.name}: error in attributeMapper, ${err.message}, ${err.stack}`);
        return {};
      }
    };
  }
}

import { RESERVED_EXPORTER_METADATA } from '../helper/constants';

/**
 * This class represents the exporter metadata that will be sent in your evaluation data collector
 */
export class ExporterMetadata {
  private metadata: Record<string, string | boolean | number> = {};

  /**
   * Add a metadata to the exporter
   * @param key - the key of the metadata
   * @param value - the value of the metadata
   */
  add(key: string, value: string | boolean | number): ExporterMetadata {
    this.metadata[key] = value;
    return this;
  }

  /**
   * Return the metadata as an immutable object, including the reserved keys.
   *
   * `provider` and `openfeature` are always present, whether or not anything was added, so every
   * exported event is attributable to an SDK and a language. They are applied last and therefore
   * cannot be shadowed by {@link add}: `provider` is normative — the collector groups by it — so a
   * caller-supplied value would misattribute this provider's traffic to another language.
   * @returns the metadata as an immutable object
   */
  asObject(): Record<string, string | boolean | number> {
    return Object.freeze({ ...this.metadata, ...RESERVED_EXPORTER_METADATA });
  }
}

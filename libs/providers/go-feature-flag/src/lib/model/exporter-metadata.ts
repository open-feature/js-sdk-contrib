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
   * Return the metadata as an immutable object
   * @returns the metadata as an immutable object
   */
  asObject(): Record<string, string | boolean | number> {
    return Object.freeze({ ...this.metadata });
  }
}

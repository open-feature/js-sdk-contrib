import { RESERVED_EXPORTER_METADATA } from '../helper/constants';
import { InvalidOptionsException } from '../exception';

/**
 * Whether a value is a JSON scalar the collector can store: a string, a boolean, or a number —
 * integer or floating-point alike, JavaScript draws no distinction and neither does the envelope.
 *
 * The envelope is a flat JSON object, so anything that would nest it — an object, an array — is
 * excluded, as is anything JSON cannot render: `null`, `undefined`, `NaN`, the infinities.
 */
const isExportableValue = (value: unknown): value is string | boolean | number =>
  typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));

/** A short, safe rendering of a rejected value, for the exception message. */
const describeValue = (value: unknown): string => {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    // NaN and the infinities reach here; `typeof` alone would not say which one it was.
    return String(value);
  }
  return typeof value;
};

/**
 * This class represents the exporter metadata that will be sent in your evaluation data collector
 */
export class ExporterMetadata {
  private metadata: Record<string, string | boolean | number> = {};

  /**
   * Add a metadata to the exporter
   *
   * Values are JSON scalars: a string, a boolean, or a number - integers and floats alike. The
   * envelope is a flat JSON object, so a nested value has nowhere to go.
   *
   * The signature says as much, but that restriction is erased at runtime, so it protects a
   * TypeScript caller and nobody else. A JavaScript caller - or a TypeScript one passing an `any` -
   * could insert an object, an array or a null, which is then serialised into the `meta` envelope
   * and rejected or silently mangled by the collector, with no diagnostic on this side. The check
   * below turns that into an error where the value enters.
   *
   * NaN and the infinities are rejected with them: `typeof` calls all three numbers, but
   * `JSON.stringify` renders each as `null`, which is precisely the silent mangling this guard
   * exists to prevent.
   * @param key - the key of the metadata
   * @param value - the value of the metadata
   * @throws {InvalidOptionsException} if the value is not a string, a boolean or a finite number
   */
  add(key: string, value: string | boolean | number): ExporterMetadata {
    if (!isExportableValue(value)) {
      throw new InvalidOptionsException(
        `exporterMetadata value for "${key}" must be a string, a boolean or a number (integer or float), ` +
          `got ${describeValue(value)}`,
      );
    }
    this.metadata[key] = value;
    return this;
  }

  /**
   * Returns an independent copy holding the same entries.
   *
   * The provider takes one at construction so that the instance it exports from is its own. The
   * caller keeps a reference to what they passed, and {@link asObject} is read at publish time
   * rather than at construction, so without this an {@link add} made afterwards - or a wholly
   * unrelated second provider built from the same object - would change what this one exports.
   * @returns a copy that no longer shares state with this instance
   */
  clone(): ExporterMetadata {
    const copy = new ExporterMetadata();
    // The values came through `add`, so they are already known to be exportable.
    copy.metadata = { ...this.metadata };
    return copy;
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

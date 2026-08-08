import type { GoFeatureFlagProviderOptions } from '../go-feature-flag-provider-options';
import { stripTrailingSlashes } from './validate-url';

/**
 * Returns a provider-owned copy of the caller options, with base URLs normalised.
 *
 * Writing through the caller's reference meant a caller who built one options object, constructed
 * two providers from it, or read `options.endpoint` afterwards saw their own input silently
 * rewritten - and under `Object.freeze` the assignment threw, turning normalisation into a
 * construction failure. The spread is also shallow, so every nested collection - `headers`,
 * `evaluationFlagList`, `exporterMetadata` - has to be copied explicitly, or a later edit of the
 * caller's object still changes the provider.
 *
 * @param options - validated options supplied to the provider constructor
 * @returns an independent copy ready for downstream use
 */
export function normalizeOptions(options: GoFeatureFlagProviderOptions): GoFeatureFlagProviderOptions {
  const normalised: GoFeatureFlagProviderOptions = { ...options };
  normalised.endpoint = stripTrailingSlashes(normalised.endpoint);
  if (normalised.dataCollectorBaseURL !== undefined) {
    normalised.dataCollectorBaseURL = stripTrailingSlashes(normalised.dataCollectorBaseURL);
  }
  if (options.headers !== undefined) {
    normalised.headers = { ...options.headers };
  }
  if (options.evaluationFlagList !== undefined) {
    normalised.evaluationFlagList = [...options.evaluationFlagList];
  }
  if (options.exporterMetadata !== undefined) {
    // Copied for the same reason as the two above, and it is the one that leaks the furthest:
    // `asObject()` is read at publish time, so a caller holding the original could still call
    // `add` after construction and change what every later event exports.
    normalised.exporterMetadata = options.exporterMetadata.clone();
  }
  return normalised;
}

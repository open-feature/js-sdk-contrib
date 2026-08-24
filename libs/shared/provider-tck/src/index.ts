/**
 * The OpenFeature Provider Conformance Suite (TCK) for JavaScript.
 *
 * The suite answers one question: does this provider map its backend onto the OpenFeature provider
 * contract correctly? It is the JavaScript implementation of Appendix F of the specification, and it
 * runs the same Gherkin scenarios, against the same canonical flag set, that every other language's
 * TCK runs. That shared basis is the point — "conformant" only means something if the question is
 * identical everywhere.
 *
 * See the README for the adoption guide.
 *
 * NOTE ON THE SOURCE OF TRUTH: the files under `features/`, `flags/` and `openapi/` are NOT owned by
 * this repository. They are copies of the language-agnostic conformance artifacts defined in
 * open-feature/spec under `specification/assets/provider-tck/`. Changes belong there and are copied
 * here — editing them locally forks the definition of conformance, which is the one thing this suite
 * exists to prevent. See https://github.com/open-feature/spec/issues/417.
 */

export { ALL_CAPABILITIES, Capability, capabilityForTag } from './lib/capability';
export { asConnectionControl, unsupportedControl } from './lib/control';
export type { BackendControl, ConnectionControl } from './lib/control';
export { CHANGING_BASELINE, CHANGING_CHANGED, CHANGING_FLAG_KEY, canonicalFlagSet } from './lib/flags';
export { InProcessControl } from './lib/inProcessControl';
export { DEFAULT_EVENT_TIMEOUT_MS, DEFAULT_READY_TIMEOUT_MS, domainFor } from './lib/options';
export type { ProviderFactory, TckOptions } from './lib/options';
export { CANONICAL_FLAGS_PATH, CONTROL_API_PATH, FEATURES_GLOB, runProviderTck } from './lib/runProviderTck';

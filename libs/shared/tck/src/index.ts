/**
 * The OpenFeature Provider Conformance Suite (TCK) for JavaScript.
 *
 * Does this provider map its backend onto the OpenFeature provider contract correctly? The
 * JavaScript implementation of Appendix F, running the same Gherkin scenarios against the same
 * canonical flag set as every other language's TCK. See the README for the adoption guide.
 *
 * NOTE ON THE SOURCE OF TRUTH: the feature files, canonical flag set and control-API document are
 * NOT owned by this repository. They are defined in open-feature/spec under
 * `specification/assets/provider-tck/`, consumed here through a git submodule and never copied.
 * Changes belong upstream — see https://github.com/open-feature/spec/issues/417.
 *
 * Adopters need none of that: the artifacts are packaged into the published library, so consuming
 * the TCK from npm requires no submodule and no particular repository layout.
 */

export {
  ALL_CAPABILITIES,
  Capability,
  DECLARABLE_CAPABILITIES,
  INEXPRESSIBLE_CAPABILITIES,
  RESERVED_CAPABILITIES,
  capabilityForTag,
  inexpressibleReason,
  isInexpressible,
  isReserved,
} from './lib/capability';
export {
  DEFAULT_BACKEND_SERVICE,
  DEFAULT_CONTROL_PORT,
  DEFAULT_STARTUP_TIMEOUT_MS,
  runContainerizedProviderTck,
} from './lib/compose';
export type { BackendEndpoint, ContainerizedProviderFactory, ContainerizedTckOptions } from './lib/compose';
export { asConnectionControl, unsupportedControl } from './lib/control';
export type { BackendControl, ConnectionControl } from './lib/control';
export { KnownDeviation } from './lib/deviation';
export { EXTENSION_URI_PREFIX } from './lib/extensions';
export { CHANGING_BASELINE, CHANGING_CHANGED, CHANGING_FLAG_KEY, canonicalFlagSet } from './lib/flags';
export type { FlagConfiguration } from './lib/flags';
export { DEFAULT_BACKEND_CONFIGURATION, DEFAULT_CONTROL_TIMEOUT_MS, HttpControl } from './lib/httpControl';
export type { HttpControlOptions } from './lib/httpControl';
export { InProcessControl } from './lib/inProcessControl';
export { DEFAULT_EVENT_TIMEOUT_MS, DEFAULT_READY_TIMEOUT_MS, domainFor } from './lib/options';
export type { ProviderFactory, TckOptions } from './lib/options';
export { REPORT_DIR_ENV } from './lib/report';
export type { ConformanceReport } from './lib/report';
export { SPEC_REVISION } from './lib/revision';
export { CANONICAL_FLAGS_PATH, CONTROL_API_PATH, FEATURES_GLOB, runProviderTck } from './lib/runProviderTck';
export { clientUnderTest, providerUnderTest } from './lib/underTest';

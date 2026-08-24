import { Capability } from '@openfeature/provider-tck';
import { runFlagdTck } from './tckSuite';

/**
 * The OpenFeature Provider Conformance Suite, run against the flagd provider's RPC resolver.
 *
 * One `runProviderTck` call per file — see the note in `tckSuite.ts`.
 */
runFlagdTck({
  name: 'flagd-rpc',
  resolverType: 'rpc',

  /*
   * Five capabilities, and every omission is derived from the provider's source rather than assumed:
   *
   * - Stale IS declared, and that is worth stating plainly because the Go provider is different. In
   *   Go, the RPC resolver never emits PROVIDER_STALE while in-process does
   *   (go-sdk-contrib#939). Here there is no such asymmetry: both resolvers report a lost connection
   *   through the same `disconnectCallback` seam — src/lib/service/grpc/grpc-service.ts:274 for RPC,
   *   src/lib/service/in-process/grpc/grpc-fetch.ts:197 for in-process — and the single handler
   *   behind it, src/lib/flagd-provider.ts:130-148, emits PROVIDER_STALE immediately
   *   (flagd-provider.ts:136) and escalates to PROVIDER_ERROR only once `retryGracePeriod` expires
   *   (flagd-provider.ts:144). The staleness contract is implemented once, in the provider, so it
   *   cannot differ between resolvers.
   * - UnavailableInit is declared: an unreachable backend rejects out of
   *   `waitForReady` (grpc-service.ts:194-202), which rejects `connect` and therefore `initialize`.
   * - ConfigurationChange is declared, and the event carries the changed keys —
   *   grpc-service.ts:243 derives them from the flagd change message and flagd-provider.ts:151
   *   puts them in the payload as `flagsChanged`, which the suite asserts on.
   * - StrictNumericTyping is omitted for the reason every JavaScript provider omits it: the language
   *   has no integer type, so the scenario is unsatisfiable by construction rather than by defect.
   *   See "The one place JavaScript cannot answer the shared question" in the TCK README.
   * - Targeting and Caching are omitted because no scenario carries their tags yet.
   */
  capabilities: [
    Capability.Events,
    Capability.Stale,
    Capability.ConfigurationChange,
    Capability.Object,
    Capability.UnavailableInit,
  ],

  // The RPC resolver asks flagd to resolve each flag, so it is ready as soon as the stream is up.
  readyTimeoutMs: 30_000,
  retryGracePeriod: 30,
});

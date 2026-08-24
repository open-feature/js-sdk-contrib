import { Capability } from '@openfeature/provider-tck';
import { runFlagdTck } from './tckSuite';

/**
 * The OpenFeature Provider Conformance Suite, run against the flagd provider's in-process resolver.
 *
 * One `runProviderTck` call per file — see the note in `tckSuite.ts`.
 */
runFlagdTck({
  name: 'flagd-in-process',
  resolverType: 'in-process',

  /*
   * The same five capabilities as the RPC suite, and that identity is the finding rather than a
   * copy-paste: in Go the two resolvers differ over PROVIDER_STALE (go-sdk-contrib#939), here they
   * cannot, because both report a lost connection through the same `disconnectCallback` seam —
   * src/lib/service/in-process/grpc/grpc-fetch.ts:197 here, src/lib/service/grpc/grpc-service.ts:274
   * for RPC — and the single handler behind it, src/lib/flagd-provider.ts:130-148, emits
   * PROVIDER_STALE (flagd-provider.ts:136) before escalating to PROVIDER_ERROR
   * (flagd-provider.ts:144).
   *
   * The omissions are the same and have the same reasons: StrictNumericTyping because JavaScript has
   * no integer type, so the scenario is unsatisfiable by construction (see the TCK README), and
   * Targeting and Caching because no scenario carries their tags yet.
   *
   * One in-process detail worth recording: the file/offline fetcher —
   * src/lib/service/in-process/file/file-fetch.ts — never calls `disconnectCallback` and so emits
   * neither PROVIDER_STALE nor a reconnect PROVIDER_READY. That mode is not under test here; a suite
   * covering `offlineFlagSourcePath` would have to leave Stale undeclared.
   */
  capabilities: [
    Capability.Events,
    Capability.Stale,
    Capability.ConfigurationChange,
    Capability.Object,
    Capability.UnavailableInit,
  ],

  // In-process syncs the whole ruleset before reporting ready, so it needs longer than RPC.
  readyTimeoutMs: 60_000,
  retryGracePeriod: 30,
});

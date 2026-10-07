import { Capability } from '@openfeature/tck';
import { runFlagdTck } from './suite';

/**
 * The OpenFeature Provider Conformance Suite, run against the flagd provider's in-process resolver.
 *
 * One `runProviderTck` call per file — see the note in `suite.ts`.
 */
runFlagdTck({
  name: 'flagd-in-process',
  resolverType: 'in-process',

  /*
   * The same capabilities as the RPC suite, reached by a different route: in-process syncs the
   * ruleset and evaluates it locally in flagd-core, where RPC reads values, variants and reasons out
   * of flagd's evaluation response. The two agreeing is the finding — see `rpc.spec.ts` for each
   * capability's reasoning; only the differences are recorded here.
   *
   * - Stale rests on the same single handler in flagd-provider.ts, reached from grpc-fetch.ts here,
   *   so the staleness contract cannot differ between resolvers.
   * - DisabledFlags is the straightforward case here: evaluating locally, the caller's default is in
   *   hand when the state is read, and flagd-core returns `{value: defaultValue, reason: DISABLED}`
   *   directly rather than RPC's zero-value-plus-substitution. All four rows pass here too.
   * - Variants, Targeting, StandardReasons, StringTyping and FullyTypedValues all land on the same
   *   results as RPC, the failing @variants row for `large-integer-flag` included.
   *
   * Withheld as in RPC: Reinitialization (`disconnect` closes the sync client and nothing constructs
   * a new one) and LargeIntegers (the testbed's missing flag). Neither records a deviation.
   *
   * One in-process detail worth recording: the file/offline fetcher
   * (src/lib/service/in-process/file/file-fetch.ts) never calls `disconnectCallback`, so it emits
   * neither PROVIDER_STALE nor a reconnect PROVIDER_READY. That mode is not under test here; a suite
   * covering `offlineFlagSourcePath` would have to leave Stale undeclared.
   */
  capabilities: [
    Capability.Events,
    Capability.Lifecycle,
    Capability.Stale,
    Capability.ConfigurationChange,
    Capability.Object,
    Capability.UnavailableInit,
    Capability.Variants,
    Capability.Targeting,
    Capability.DisabledFlags,
    Capability.StandardReasons,
    Capability.StringTyping,
    Capability.FullyTypedValues,
  ],

  // In-process syncs the whole ruleset before reporting ready, so it needs longer than RPC.
  readyTimeoutMs: 60_000,
});

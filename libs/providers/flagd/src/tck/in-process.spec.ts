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
   * The same eleven capabilities as the RPC suite, and the identity is the finding rather than a
   * copy-paste: an application switching resolver sees the same values, variants and reasons. Where
   * a reason differs from RPC's, it is recorded here; where it does not, see `rpc.spec.ts`.
   *
   * - Stale rests on the same single seam: in-process reports a lost connection through
   *   service/in-process/grpc/grpc-fetch.ts:197 into the one handler at flagd-provider.ts:130-148,
   *   so the staleness contract cannot differ between resolvers.
   * - Lifecycle reaches the backend harder than RPC's does: in-process syncs the whole ruleset
   *   before reporting ready, so READY cannot be synthesised on a provider that did nothing.
   * - Variants and Targeting are reached by a different route — in-process syncs the ruleset and
   *   evaluates it locally in flagd-core, where RPC reads both out of flagd's evaluation response —
   *   and land in the same place, the failing @variants row for `large-integer-flag` included.
   * - DisabledFlags is the straightforward case here rather than the interesting one: in-process
   *   evaluates locally, so the caller's default is in hand at the point the state is read and
   *   flagd-core returns `{value: defaultValue, reason: DISABLED}` directly
   *   (flagd-core.ts:176-181). RPC reaches the same four values the long way round, and the two
   *   agreeing is the finding. All four rows pass here too.
   * - StandardReasons: all nine pass with the reason coming from flagd-core evaluating the synced
   *   ruleset rather than from a response field. An application switching resolver sees the same
   *   reason as well as the same value, which is what makes a reason worth building telemetry on.
   * - StringTyping and FullyTypedValues: the same four scenarios pass here too, by the in-process
   *   route — flagd-core reads the type off the synced flag definition rather than off a response
   *   field, and refuses the string accessor for a non-string flag. The two resolvers agreeing is
   *   again the finding: a backend whose values were really strings would fail these four whichever
   *   resolver asked. Both tags, for the reason `rpc.spec.ts` gives at length — a synced flag
   *   definition types a float and a structure as readily as a boolean, so the split between the
   *   two tags has nothing to separate over this backend, and an allow-list declaration has to name
   *   the new half or lose two scenarios to silent skips.
   *
   * Withheld, as in RPC and for the same shape of reason:
   *
   * - Reinitialization: `disconnect` calls `this._syncClient.close()` (grpc-fetch.ts:95-99) and
   *   nothing constructs a new client, so the provider declines the reuse requirement 2.5.2 permits
   *   it to decline. Skipped, and no deviation: there is no defect to record.
   * - LargeIntegers, for the testbed's missing flag — see `rpc.spec.ts`.
   *
   * One in-process detail worth recording: the file/offline fetcher —
   * src/lib/service/in-process/file/file-fetch.ts — never calls `disconnectCallback` and so emits
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

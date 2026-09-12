import { Capability } from '@openfeature/tck';
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
   * The same eight capabilities as the RPC suite, and that identity is the finding rather than a
   * copy-paste: in Go the two resolvers differ over PROVIDER_STALE (go-sdk-contrib#939), here they
   * cannot, because both report a lost connection through the same `disconnectCallback` seam —
   * src/lib/service/in-process/grpc/grpc-fetch.ts:197 here, src/lib/service/grpc/grpc-service.ts:274
   * for RPC — and the single handler behind it, src/lib/flagd-provider.ts:130-148, emits
   * PROVIDER_STALE (flagd-provider.ts:136) before escalating to PROVIDER_ERROR
   * (flagd-provider.ts:144).
   *
   * Lifecycle is declared for the same reason as in RPC: initialisation genuinely reaches the sync
   * service, and in-process reaches it harder -- it syncs the whole ruleset before reporting ready,
   * so READY cannot be synthesised on a provider that did nothing.
   *
   * Variants and Targeting are declared as in RPC, and the resolvers reach them by different routes:
   * RPC reads the variant and the targeting decision out of flagd's evaluation response, while
   * in-process syncs the ruleset and evaluates it locally in flagd-core. The identical result is
   * again the finding — an application switching resolver sees the same variant and the same
   * targeted value, including the one @variants row that fails for want of `large-integer-flag`
   * in the testbed image (flagd-testbed#392). See the RPC suite for why no deviation is recorded.
   *
   * DisabledFlags is declared, and here it is the straightforward case rather than the interesting
   * one: in-process syncs the ruleset and evaluates it locally, so the caller's default is in hand
   * at the point the state is read -- flagd-core returns `{value: defaultValue, reason: DISABLED}`
   * directly (flagd-core.ts:176-181). RPC reaches the same answer the long way round, flagd sending
   * the type's zero value and the provider substituting (grpc-service.ts:306-312), and the two
   * agreeing is again the finding: an application switching resolver sees the same four values. All
   * four rows pass here too, which is what the declaration rests on.
   *
   * The omissions are the same and have the same reasons: NumericCoercion because JavaScript has
   * no integer type, so the scenario is unsatisfiable by construction (see the TCK README), and
   * Caching because it is still reserved and no scenario carries the tag.
   *
   * Reinitialization is left undeclared, as in RPC and for the same reason -- and it is the same
   * code shape: `disconnect` calls `this._syncClient.close()` (grpc-fetch.ts:95-99) and nothing
   * constructs a new client, so the provider declines reuse. Requirement 2.5.2 permits reuse rather
   * than requiring it ("some providers MAY allow reinitialization from this state"), so the
   * scenario is skipped and no deviation is recorded: there is no defect to record.
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
  ],

  // In-process syncs the whole ruleset before reporting ready, so it needs longer than RPC.
  readyTimeoutMs: 60_000,
});

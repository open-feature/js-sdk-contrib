import { Capability } from '@openfeature/tck';
import { runFlagdTck } from './suite';

/**
 * The OpenFeature Provider Conformance Suite, run against the flagd provider's RPC resolver.
 *
 * One `runProviderTck` call per file — see the note in `suite.ts`.
 */
runFlagdTck({
  name: 'flagd-rpc',
  resolverType: 'rpc',

  /*
   * Why this resolver declares or withholds each capability, on evidence from running the suite.
   * What the rules are is Appendix F, "Rules for declaring"; below is what they decided here.
   *
   * - Lifecycle: initialisation genuinely reaches flagd. `connect` awaits `waitForReady` on the
   *   gRPC channel (grpc-service.ts:194-202) and `initialize` resolves only once the stream is up,
   *   so READY against a healthy backend and ERROR against an unreachable one are both observable
   *   rather than synthesised by the SDK.
   * - UnavailableInit: an unreachable backend rejects out of the same `waitForReady`, which rejects
   *   `connect` and therefore `initialize`.
   * - Stale: both resolvers report a lost connection through one `disconnectCallback` seam —
   *   grpc-service.ts:274 here, service/in-process/grpc/grpc-fetch.ts:197 for in-process — and the
   *   single handler behind it (flagd-provider.ts:130-148) emits PROVIDER_STALE immediately (:136)
   *   and escalates to PROVIDER_ERROR only once `retryGracePeriod` expires (:144). The staleness
   *   contract is implemented once, in the provider, so it cannot differ between resolvers.
   * - ConfigurationChange: the event carries the changed keys — grpc-service.ts:243 derives them
   *   from flagd's change message and flagd-provider.ts:151 puts them in `flagsChanged`.
   * - Variants: flagd's evaluation response names the variant it matched and the provider hands it
   *   back untouched, so the eight gated rows are a real question rather than a formality. Seven
   *   pass; the eighth asks for `large-integer-flag` (see LargeIntegers below).
   * - Targeting: all three scenarios pass, and `targeting-key-flag` is already in the testbed image
   *   so nothing had to be seeded.
   * - DisabledFlags: the RPC resolver earns it *despite* the evaluation happening remotely, which is
   *   the interesting part. flagd answers a disabled flag with `reason: DISABLED`, an empty variant
   *   and the **type's** zero value rather than the caller's, the request never having carried one:
   *   the wire response for `disabled-integer-flag` is
   *   `{"value":"0","reason":"DISABLED","variant":""}`. What closes the gap is that the provider
   *   substitutes locally — grpc-service.ts:306-312 replaces the value with the caller's default
   *   when the variant is empty and the reason is DEFAULT or DISABLED — so flagd's protocol keeps
   *   the decision remote while the default stays client-side. All four rows pass, which is what
   *   the declaration rests on; without the substitution three of the four would have failed on the
   *   value alone.
   * - StandardReasons: all nine scenarios run — the tag composes with @targeting and
   *   @disabled-flags, both declared here — and all nine pass: STATIC for the four rule-less flags,
   *   ERROR for the unknown flag and the type mismatch, TARGETING_MATCH for the matching key and
   *   DEFAULT for the miss, DISABLED for the disabled flag. STATIC for a rule-less flag is the row
   *   the specification genuinely leaves open, so it is measured rather than assumed.
   * - StringTyping and FullyTypedValues, declared together: flagd's flag definitions are typed and
   *   the RPC resolver reads the type off the evaluation response, so `getStringDetails` on a
   *   boolean, a number or a structure is a TYPE_MISMATCH rather than that value's string
   *   representation. All four scenarios pass, and they are named rather than counted: the two rows
   *   of "A non-string flag is not returned as its string representation" (`boolean-flag` and
   *   `integer-flag`), "A float flag is not returned as its string representation", and "A
   *   structured flag is not returned as its JSON text".
   *
   *   Worth declaring rather than leaving out, because this is the capability's *other* side: these
   *   four rows were mandatory until Appendix F moved them, on the grounds that a backend storing
   *   flag values as strings has no mismatch to report. flagd is not such a backend, and a run that
   *   left the tag undeclared would say nothing about a property flagd demonstrably has.
   *
   *   The two tags are separate because a store can record a boolean and an integer natively while
   *   keeping a float or a structure as text. A flagd flag definition carries a JSON type for all
   *   four, so the split has nothing to separate over this backend and both halves are earned by
   *   the same mechanism. **Both are named explicitly because this adoption declares by an
   *   allow-list**: a capability that arrives upstream is undeclared here until it is written down,
   *   so registering @fully-typed-values without adding it would have turned two passing scenarios
   *   into skips, with nothing in the results saying that a property flagd demonstrably has went
   *   unasserted.
   *
   * Withheld:
   *
   * - Reinitialization, and this is a choice rather than a defect. `onClose` delegates to
   *   `disconnect`, which calls `this._client.close()` (grpc-service.ts:140-143), and `connect`
   *   never constructs a new client — so the provider releases its channel for good and declines
   *   reuse, which requirement 2.5.2 permits. The scenario is skipped and NO deviation is recorded:
   *   recording one would report a sanctioned choice as a defect.
   * - LargeIntegers, because this testbed image does not serve `large-integer-flag` at all
   *   (open-feature/flagd-testbed#392) — the same gap that fails the mandatory 2^31 - 1 scenario and
   *   the eighth @variants row. The tag gates exactly one scenario, so a backend without its flag
   *   leaves nothing about the capability establishable. No deviation either: the gap is in the
   *   backend's flag set, not in the provider. Unlike the others this omission is **temporary**, and
   *   should be revisited when #392 lands rather than left standing.
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

  // The RPC resolver asks flagd to resolve each flag, so it is ready as soon as the stream is up.
  readyTimeoutMs: 30_000,
});

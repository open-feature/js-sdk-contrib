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
   *
   * - Lifecycle and UnavailableInit: `connect` awaits `waitForReady` on the gRPC channel and
   *   `initialize` resolves only once the stream is up, so READY against a healthy backend and
   *   ERROR against an unreachable one are both observable rather than synthesised by the SDK.
   * - Stale: a lost connection arrives through one `disconnectCallback` seam into a single handler
   *   in flagd-provider.ts, which emits PROVIDER_STALE immediately and escalates to PROVIDER_ERROR
   *   once `retryGracePeriod` expires. Implemented in the provider, so it cannot differ by resolver.
   * - ConfigurationChange: grpc-service.ts derives the changed keys from flagd's change message and
   *   the provider puts them in `flagsChanged`.
   * - Variants: flagd's evaluation response names the matched variant and the provider hands it back
   *   untouched. Seven of the eight rows pass; the eighth asks for `large-integer-flag`, below.
   * - Targeting: all three scenarios pass.
   * - DisabledFlags: flagd answers a disabled flag with the *type's* zero value, not the caller's —
   *   the wire response for `disabled-integer-flag` is `{"value":"0","reason":"DISABLED",...}`. What
   *   closes the gap is grpc-service.ts substituting the caller's default locally when the variant
   *   is empty and the reason is DEFAULT or DISABLED. All four rows pass; without the substitution
   *   three would have failed on the value alone.
   * - StandardReasons: all nine scenarios run and pass — STATIC for the four rule-less flags, ERROR
   *   for the unknown flag and the type mismatch, TARGETING_MATCH and DEFAULT for the targeting
   *   pair, DISABLED for the disabled flag.
   * - StringTyping and FullyTypedValues: flagd's flag definitions are typed and the RPC resolver
   *   reads the type off the evaluation response, so `getStringDetails` on a boolean, a number or a
   *   structure is a TYPE_MISMATCH rather than that value's string representation. All four
   *   scenarios pass, so both halves of the split are earned by the same mechanism.
   *
   * Withheld:
   *
   * - Reinitialization: `onClose` delegates to `disconnect`, which closes the gRPC client, and
   *   `connect` never constructs a new one — the provider releases its channel for good and declines
   *   the reuse requirement 2.5.2 permits it to decline. No deviation recorded: not a defect.
   * - LargeIntegers: this testbed image does not serve `large-integer-flag`
   *   (open-feature/flagd-testbed#392), and the tag gates exactly one scenario, so there is nothing
   *   to establish. No deviation — the gap is in the backend's flag set, not the provider. This
   *   omission is temporary; revisit when #392 lands.
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

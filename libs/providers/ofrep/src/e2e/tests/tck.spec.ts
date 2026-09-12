import { join } from 'node:path';
import { Capability, runContainerizedProviderTck } from '@openfeature/tck';
import { OFREPProvider } from '../../lib/ofrep-provider';

/**
 * The OpenFeature Provider Conformance Suite, run against the OFREP provider.
 *
 * One suite per file: jest-cucumber accumulates step definitions in module state, so a second call
 * here would register the vocabulary twice and every step would report as ambiguous.
 *
 * ## Scope
 *
 * This covers `libs/providers/ofrep` only. `libs/providers/ofrep-web` is deliberately not adopted
 * here. It is the only OFREP provider in this repo with events, a STALE state and a failable
 * initialisation — the parts of the contract this suite is most useful for — but none of them can be
 * exercised against flagd: flagd's OFREP handler never writes an `ETag` and never reads
 * `If-None-Match`, so the `304` path the web provider's polling depends on is unreachable, and its
 * bulk response carries no `eventStreams` field, so the SSE path is unreachable too. Adopting it
 * against this backend would declare capabilities that the backend, not the provider, makes
 * untestable. It waits for a neutral OFREP testbed.
 */

/** The container-internal port flagd serves OFREP on. */
const OFREP_PORT = 8016;

/**
 * Budget for the stack and its control API to become reachable.
 *
 * Well above the suite's 60-second default because on a cold machine this includes pulling the
 * testbed image, which the budget is specified to cover.
 */
const STACK_TIMEOUT_MS = 180_000;

// Deliberately no jest.retryTimes: a conformance result that only holds on the third attempt is not
// a conformance result.

runContainerizedProviderTck({
  name: 'ofrep',

  // The suite owns the stack: started once before the first scenario and never restarted, with
  // scenario isolation coming from the control API instead — which restarts the flagd *process*
  // inside the container, keeping the port mapping. See the no-container-restart invariant in the
  // control API specification.
  composeFile: join(__dirname, '..', 'tck', 'docker-compose.yaml'),
  backendPorts: [OFREP_PORT],
  startupTimeoutMs: STACK_TIMEOUT_MS,

  // The endpoint carries the dynamically mapped host port, which does not exist until the stack is
  // up — hence a factory.
  //
  // The timeout is well under the suite's own budget on purpose. Every scenario here is a single
  // round trip to a container on the same host, so anything slower is a wedged backend, and the
  // scenarios that assert a code default are only meaningful if the provider gives up promptly.
  newProvider: (endpoint) =>
    new OFREPProvider({
      baseUrl: `http://${endpoint.host}:${endpoint.port(OFREP_PORT)}`,
      timeoutMs: 10_000,
    }),

  /*
   * Three capabilities, and every omission below is derived from the provider's source rather than
   * assumed. This is the smallest declaration of any provider in this repo, and that is the finding:
   * `OFREPProvider` is stateless. Its entire surface is a constructor, `onClose`, and four
   * `resolve*Evaluation` methods that each POST to `/ofrep/v1/evaluate/flags/{key}` —
   * src/lib/ofrep-provider.ts:15-111. There is no `initialize`, no `events` emitter, no `status`,
   * and no cached configuration, so most of the contract this suite exercises simply is not
   * implemented here. That is a legitimate design for a request-scoped protocol client, not a
   * defect, and the skips say so by name.
   *
   * - Object IS declared. `toResolutionDetails` passes a structured value straight through
   *   (libs/shared/ofrep-core/src/lib/api/ofrep-api.ts:235-263) and the `typeof` guard at
   *   ofrep-api.ts:251 rejects a structured flag requested as a scalar with TYPE_MISMATCH, which is
   *   what the @object scenarios in errors.feature ask for.
   *
   * - Events is omitted because the provider emits none. `OFREPProvider` has no `events` property
   *   (src/lib/ofrep-provider.ts:15-35), so the only lifecycle event an application ever sees is the
   *   PROVIDER_READY the SDK synthesises on registration. Declaring @events would make the readiness
   *   scenario in lifecycle.feature pass without the provider having demonstrated anything — a
   *   NoOpProvider passes it identically. (On the branch that introduces @lifecycle, that scenario
   *   moves behind its own capability; this provider should not declare that one either, for the
   *   same reason: initialisation does not reach the backend because there is no initialisation.)
   *
   * - Stale and ConfigurationChange are omitted for the same root cause: nothing holds a connection
   *   or a local copy of the ruleset. Every evaluation is an independent `postEvaluateFlag`
   *   (src/lib/ofrep-provider.ts:86), so there is no connection to lose and no configuration to
   *   observe changing.
   *
   * - UnavailableInit is omitted because there is no `initialize` to fail. The class implements
   *   `Provider` with `onClose` as its only lifecycle method (src/lib/ofrep-provider.ts:37-39), so a
   *   provider pointed at a closed port still registers and settles into READY; the @unavailable
   *   scenarios would wait out their 10s budget for an error event that cannot arrive. The
   *   constructor does reject a malformed URL (src/lib/ofrep-provider.ts:27-32), but that is a
   *   syntactic check that never touches the network, so it is not the initialisation failure the
   *   scenarios describe. `newUnavailableProvider` is therefore left unset, which runProviderTck
   *   requires to be consistent with the capability.
   *
   * - NumericCoercion is omitted for the reason every JavaScript provider omits it, not for
   *   anything specific to OFREP: the language has no integer type, so asking for float-flag as an
   *   Integer is indistinguishable from asking for it as a Float and the scenario is unsatisfiable
   *   by construction. See "The one place JavaScript cannot answer the shared question" in the TCK
   *   README. This is where the JS declaration is narrower than Go's and Java's, which do declare it
   *   on otherwise identical, equally stateless OFREP providers.
   *
   * - Variants IS declared. The OFREP evaluation response carries a `variant` field and
   *   `toResolutionDetails` copies it onto the resolution details (ofrep-api.ts:235-263), so the
   *   eight gated rows ask a real question of the provider. Requirement 2.2.4 is only a SHOULD and
   *   `types.md` types the field optional, so the claim rests on the run rather than the reading:
   *   seven of the eight rows pass. The eighth asks for `large-integer-flag`, which this testbed
   *   image does not serve at all (flagd-testbed#392) -- the same missing flag that already fails
   *   the mandatory 2^31 - 1 scenario here. No deviation is recorded for it: the gap is in the
   *   backend's flag set, not in the provider.
   *
   * - Targeting IS declared, and it is no longer a reserved name: Appendix F carries three scenarios
   *   for it. They are the only ones in the suite that ask this provider to serialise an evaluation
   *   context into a request at all — `postEvaluateFlag` puts it in the POST body — so for a
   *   stateless provider whose whole contract is one request and one response, they cover a larger
   *   share of it than they do anywhere else. `targeting-key-flag` is flagd-testbed's own, so
   *   nothing had to be seeded.
   *
   * - DisabledFlags IS declared, and it is the one result here that contradicted the expectation
   *   rather than confirming it. The capability was written assuming a provider whose backend
   *   decides could not have it: the request carries the flag key and the evaluation context but
   *   never the caller's *default*, so a server asked about a disabled flag has nothing to return
   *   and the provider nothing to substitute. That reasoning skips a step. OFREP's response schema
   *   makes `value` optional, and flagd's OFREP handler omits it altogether for a disabled flag —
   *   `200 OK` with `{"key":"disabled-boolean-flag","reason":"DISABLED","metadata":{}}`, no `value`
   *   and no `variant`. `toResolutionDetails` handles exactly that shape
   *   (libs/shared/ofrep-core/src/lib/api/ofrep-api.ts:239-245): an absent value becomes the
   *   caller's default, carrying the server's reason and no error code. So the substitution is
   *   client-side here too — the protocol can say "no value" instead of making the server invent
   *   one, which is the step the capability's rationale was missing.
   *
   *   All four rows pass, twice over, and that is what the declaration rests on rather than the
   *   reading above. It stays a claim about this provider against this backend: an OFREP server that
   *   answered a disabled flag with the flag's configured value, or with a `404`, would fail these
   *   rows through no fault of the provider. That is why the tag is gated, and why withholding it
   *   elsewhere would need no `knownDeviations` entry.
   *
   * - Caching is omitted because it is still reserved: no scenario carries the tag, so declaring it
   *   could not cause a skip and would put a capability nothing examined into the report.
   */
  capabilities: [Capability.Object, Capability.Variants, Capability.Targeting, Capability.DisabledFlags],

  // The SDK synthesises READY as soon as registration completes, since the provider has no
  // initialisation step. This is headroom for a loaded machine, not an expected latency.
  readyTimeoutMs: 30_000,
});
